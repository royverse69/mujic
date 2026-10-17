from flask import Flask, request, jsonify, Response
from flask_cors import CORS
from flask_compress import Compress
import requests
from requests.adapters import HTTPAdapter
import time
import random
from urllib.parse import urljoin, urlparse

app = Flask(__name__)
CORS(app)
Compress(app)  

BASE_API = "https://music-api.albatross0071.workers.dev/api"

# Fixed-origin proxy for the full documented catalogue API. This lets the PWA use the
# Render service as its single API entry point while keeping the upstream host server-side.
# The allowlist prevents this from becoming an open proxy to arbitrary URLs or services.
ALLOWED_CATALOGUE_PREFIXES = {"search", "songs", "albums", "artists", "playlists"}

@app.route("/api/<path:upstream_path>", methods=["GET"])
def catalogue_api_proxy(upstream_path):
    first_segment = (upstream_path or "").split("/", 1)[0].lower()
    if first_segment not in ALLOWED_CATALOGUE_PREFIXES:
        return jsonify({"success": False, "error": "Catalogue route not allowed"}), 404

    target = f"{BASE_API.rstrip('/')}/{upstream_path}"
    try:
        upstream = session.get(
            target,
            params=request.args.to_dict(flat=False),
            headers={"Accept": request.headers.get("Accept", "application/json")},
            timeout=18,
        )
    except requests.RequestException as exc:
        return jsonify({"success": False, "error": "Upstream catalogue temporarily unavailable"}), 502

    content_type = upstream.headers.get("Content-Type", "application/json")
    # Return JSON as JSON so existing client-side response parsers remain unchanged.
    if "json" in content_type.lower():
        try:
            return jsonify(upstream.json()), upstream.status_code
        except ValueError:
            pass
    return Response(upstream.content, status=upstream.status_code, content_type=content_type)

# Catalogue media proxy for supported Saavn/JioSaavn CDN hosts only. The URL is validated
# before every request/redirect to prevent use as an arbitrary URL proxy or SSRF primitive.
CATALOGUE_MEDIA_DOMAINS = ("saavncdn.com", "jiosaavn.com")


def _is_allowed_catalogue_media_url(value):
    try:
        parsed = urlparse(str(value or ""))
        host = (parsed.hostname or "").lower().rstrip(".")
        if parsed.scheme != "https" or parsed.username or parsed.password:
            return False
        if parsed.port not in (None, 443):
            return False
        return any(host == domain or host.endswith("." + domain) for domain in CATALOGUE_MEDIA_DOMAINS)
    except (TypeError, ValueError):
        return False


@app.route("/media", methods=["GET"])
def catalogue_media_proxy():
    target = request.args.get("url", "").strip()
    if not _is_allowed_catalogue_media_url(target):
        return jsonify({"error": "Unsupported catalogue media host"}), 403

    request_headers = {"Accept-Encoding": "identity"}
    for header in ("Range", "If-Range", "If-None-Match", "If-Modified-Since", "Accept"):
        value = request.headers.get(header)
        if value:
            request_headers[header] = value

    upstream = None
    current_target = target
    for _ in range(5):
        if not _is_allowed_catalogue_media_url(current_target):
            if upstream is not None:
                upstream.close()
            return jsonify({"error": "Redirected media host is not allowed"}), 403
        try:
            upstream = session.get(
                current_target,
                headers=request_headers,
                stream=True,
                allow_redirects=False,
                timeout=(8, 45),
            )
        except requests.RequestException:
            return jsonify({"error": "Catalogue media is temporarily unavailable"}), 502

        if upstream.status_code not in (301, 302, 303, 307, 308):
            break
        location = upstream.headers.get("Location")
        upstream.close()
        if not location:
            return jsonify({"error": "Media redirect did not provide a destination"}), 502
        current_target = urljoin(current_target, location)
    else:
        if upstream is not None:
            upstream.close()
        return jsonify({"error": "Too many media redirects"}), 502

    passthrough_headers = {}
    for header in ("Content-Type", "Content-Length", "Content-Range", "Accept-Ranges", "ETag", "Last-Modified"):
        if header in upstream.headers:
            passthrough_headers[header] = upstream.headers[header]
    passthrough_headers.setdefault("Cache-Control", "public, max-age=900")
    response = Response(upstream.iter_content(chunk_size=64 * 1024), status=upstream.status_code, headers=passthrough_headers)
    response.call_on_close(upstream.close)
    return response


# --- TCP Connection Pooling ---
session = requests.Session()
adapter = HTTPAdapter(
    pool_connections=20, 
    pool_maxsize=20,
    max_retries=3
)
session.mount("https://", adapter)
session.mount("http://", adapter)

# --- Globals & Caching ---
search_cache = {}
song_cache = {}
lyrics_cache = {}
recommend_cache = {}
trending_cache = {}
CACHE_TIME = 1800  # 30 mins

TRENDING_MAP = {
    "english": ["The Weeknd", "Imagine Dragons", "Taylor Swift", "OneRepublic", "Ed Sheeran"],
    "hindi": ["Arijit Singh", "Pritam", "Shreya Ghoshal", "Anirudh Ravichander", "Vishal-Shekhar"],
    "spanish": ["Bad Bunny", "J Balvin", "Rosalía", "Shakira"]
}


# --- Core Helper Functions ---
def get_cache(cache, key):
    item = cache.get(key)
    if not item: return None
    if time.time() - item["time"] > CACHE_TIME:
        del cache[key]
        return None
    return item["data"]

def set_cache(cache, key, data):
    cache[key] = {
        "time": time.time(),
        "data": data
    }

def search_songs(query):
    if not query: return []
    try:
        r = session.get(f"{BASE_API}/search", params={"query": query}, timeout=15)
        return r.json().get("data", {}).get("songs", {}).get("results", [])
    except:
        return []

def fetch_single_song_raw(song_id):
    cached = get_cache(song_cache, song_id)
    if cached: return cached

    try:
        r = session.get(f"{BASE_API}/songs/{song_id}", timeout=15)
        r.raise_for_status()
        data = r.json()
        set_cache(song_cache, song_id, data)
        return data
    except:
        return None

def extract_stream_url(song_id):
    song_data = fetch_single_song_raw(song_id)
    if not song_data or "data" not in song_data or not song_data["data"]:
        return None

    urls = song_data["data"][0].get("downloadUrl", [])
    if not urls: return None
    
    quality_order = ["320kbps", "160kbps", "96kbps", "48kbps", "12kbps"]
    for quality in quality_order:
        match = next((x for x in urls if x.get("quality") == quality), None)
        if match:
            return match.get("url")
    return urls[0].get("url")

def generate_recommendations(song_id):
    cached = get_cache(recommend_cache, song_id)
    if cached: return cached

    song_data = fetch_single_song_raw(song_id)
    if not song_data or "data" not in song_data or not song_data["data"]:
        return []
        
    current_song = song_data["data"][0]

    song_name = current_song.get("name", "")
    artist = current_song.get("primaryArtists", "")
    album = current_song.get("album", {})
    album_name = album.get("name", "") if isinstance(album, dict) else ""
    language = current_song.get("language", "")
    language = language.lower() if language else ""

    recommendations = []
    
    # 40% Album
    if album_name:
        try: recommendations.extend(search_songs(album_name)[:12])
        except: pass
    # 30% Artist
    if artist:
        try: recommendations.extend(search_songs(artist)[:9])
        except: pass
    
    # De-duplication queries
    if artist and song_name:
        try: recommendations.extend(search_songs(f"{artist} {song_name}")[:8])
        except: pass
    if song_name:
        try: recommendations.extend(search_songs(song_name)[:8])
        except: pass
    
    # 20% Language/Genre & 10% Trending Mix
    if language in TRENDING_MAP:
        try:
            trending_artists = random.sample(TRENDING_MAP[language], 2)
            for ta in trending_artists:
                recommendations.extend(search_songs(ta)[:3])
        except: pass
    elif language:
        try: recommendations.extend(search_songs(language)[:6])
        except: pass
    
    seen_ids = set()
    seen_titles = set()
    final = []
    
    for song in recommendations:
        s_id = song.get("id")
        s_title = song.get("name", "").lower().strip()
        
        if not s_id or s_id == song_id or s_id in seen_ids:
            continue
            
        if s_title in seen_titles and song_name.lower().strip() in s_title:
            continue
            
        seen_ids.add(s_id)
        seen_titles.add(s_title)
        final.append(song)

    result = final[:30]
    set_cache(recommend_cache, song_id, result)
    return result


# --- Base Routes ---
@app.route("/")
def home():
    return jsonify({"status": "online", "name": "Royverse Music API Hardened"})

@app.route("/health")
def health():
    return jsonify({"status": "ok", "timestamp": int(time.time())})

@app.route("/stats")
def stats():
    return jsonify({
        "search_cache": len(search_cache),
        "song_cache": len(song_cache),
        "lyrics_cache": len(lyrics_cache),
        "recommend_cache": len(recommend_cache),
        "trending_cache": len(trending_cache)
    })


# --- Search & Content Routes ---
@app.route("/search")
def search():
    query = request.args.get("q")
    if not query: return jsonify({"error": "query required"}), 400

    cached = get_cache(search_cache, query)
    if cached: return jsonify(cached)

    try:
        r = session.get(f"{BASE_API}/search", params={"query": query}, timeout=15)
        data = r.json()
        set_cache(search_cache, query, data)
        return jsonify(data)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/suggest")
def suggest():
    query = request.args.get("q")
    if not query:
        return jsonify([])

    try:
        songs = search_songs(query)
        suggestions = []

        for song in songs[:10]:
            # Clean up HTML entities just in case they bleed through the new structure
            title = (song.get("title") or song.get("name", "")).replace("&quot;", '"').replace("&amp;", "&")
            artist = (song.get("primaryArtists") or song.get("artists", "")).replace("&quot;", '"').replace("&amp;", "&")
            
            suggestions.append({
                "id": song.get("id"),
                "title": title,
                "artist": artist
            })

        return jsonify(suggestions)
    except Exception:
        return jsonify([])

@app.route("/artist/<name>")
def artist_songs(name):
    if not name: return jsonify({"artist": "", "songs": []})
    try:
        raw_results = search_songs(name)
        artist_songs_filtered = []
        
        for song in raw_results:
            artists_string = str(song.get("primaryArtists", "")).lower()
            if name.lower() in artists_string:
                artist_songs_filtered.append(song)
                
        return jsonify({
            "artist": name,
            "songs": artist_songs_filtered[:50]
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/trending")
def trending():
    cached = get_cache(trending_cache, "global_trending")
    if cached: return jsonify(cached)

    try:
        queries = ["The Weeknd", "Imagine Dragons", "Taylor Swift", "Arijit Singh"]
        results = []
        for q in queries:
            songs = search_songs(q)
            results.extend(songs[:5])
            
        set_cache(trending_cache, "global_trending", {"songs": results})
        return jsonify({"songs": results})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# --- Playback & Queue Management ---
@app.route("/song/<song_id>")
def song(song_id):
    data = fetch_single_song_raw(song_id)
    if data:
        return jsonify(data)
    return jsonify({"error": "Song not found"}), 404

@app.route("/stream/<song_id>")
def stream(song_id):
    try:
        stream_url = extract_stream_url(song_id)
        
        if not stream_url:
            return jsonify({"error": "Stream unavailable"}), 404
            
        cached_song = get_cache(song_cache, song_id)
        title = "Unknown"
        if cached_song and "data" in cached_song and cached_song["data"]:
            title = cached_song["data"][0].get("name", "Unknown")

        return jsonify({
            "id": song_id,
            "title": title,
            "stream": stream_url
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/queue/<song_id>")
def get_queue(song_id):
    try:
        song_data = fetch_single_song_raw(song_id)
        current_song = song_data["data"][0] if (song_data and "data" in song_data) else None
        queue_pool = generate_recommendations(song_id).copy()

        return jsonify({
            "current": current_song,
            "queue": queue_pool
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# --- Data Infrastructure & Bulk Lookups ---
@app.route("/songs/bulk")
def bulk_songs():
    raw_ids = request.args.get("ids")
    if not raw_ids: return jsonify([])

    id_list = [i.strip() for i in raw_ids.split(",") if i.strip()]
    results = []

    try:
        r = session.get(f"{BASE_API}/songs/{','.join(id_list)}", timeout=12)
        response_json = r.json()
        
        if response_json.get("success") and isinstance(response_json.get("data"), list):
            songs_data = response_json["data"]
        else:
            raise ValueError("Fallback triggered")
            
    except Exception:
        songs_data = []
        for song_id in id_list:
            single_res = fetch_single_song_raw(song_id)
            if single_res and "data" in single_res and single_res["data"]:
                songs_data.append(single_res["data"][0])

    for song in songs_data:
        results.append({
            "id": song.get("id"),
            "title": song.get("name"),
            "artist": song.get("primaryArtists", "Unknown"),
            "image": song.get("image")[-1]["url"] if (song.get("image") and isinstance(song["image"], list)) else None
        })
        
    return jsonify(results)

@app.route("/recommendations/bulk")
def bulk_recommendations():
    ids = request.args.get("ids")
    if not ids: return jsonify({"recommendations": []})

    try:
        id_list = ids.split(",")
        all_recs = []
        seen = set()
        
        for song_id in id_list[:3]:
            recs = generate_recommendations(song_id)
            for r in recs:
                r_id = r.get("id")
                if r_id and r_id not in seen:
                    seen.add(r_id)
                    all_recs.append(r)
                    
        return jsonify({"recommendations": all_recs[:50]})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/lyrics")
def lyrics():
    track = request.args.get("track")
    artist = request.args.get("artist")
    if not track: return jsonify({"success": False})

    cache_key = f"{track}_{artist}".lower()
    cached = get_cache(lyrics_cache, cache_key)
    if cached: return jsonify(cached)

    try:
        r = session.get(
            "https://lrclib.net/api/get",
            params={"track_name": track, "artist_name": artist},
            timeout=10
        )
        if r.status_code == 404:
            return jsonify({"success": False, "error": "Lyrics not found"})
            
        data = r.json()
        set_cache(lyrics_cache, cache_key, data)
        return jsonify(data)
    except Exception as e:
        return jsonify({"success": False, "error": str(e)})


# Fixed-origin lyrics proxies. These keep all lyrics API calls behind this Render service.
# No user-supplied URL is accepted, so these routes cannot be used as arbitrary URL proxies.
LYRICSPLUS_ORIGINS = (
    "https://lyricsplus.prjktla.my.id",
    "https://lyricsplus.prjktla.workers.dev",
    "https://lyricsplus-seven.vercel.app",
)


def _relay_json_or_body(upstream):
    content_type = upstream.headers.get("Content-Type", "application/json")
    if "json" in content_type.lower():
        try:
            return jsonify(upstream.json()), upstream.status_code
        except ValueError:
            pass
    return Response(upstream.content, status=upstream.status_code, content_type=content_type)


def _request_fixed_lyrics_origin(url, params, timeout=8):
    try:
        upstream = session.get(
            url,
            params=params,
            headers={"Accept": "application/json"},
            timeout=timeout,
        )
        return _relay_json_or_body(upstream)
    except requests.RequestException:
        return jsonify({"success": False, "error": "Lyrics provider temporarily unavailable"}), 502


@app.route("/lyrics/search", methods=["GET"])
def lyrics_search_proxy():
    query = request.args.get("q", "").strip()
    if not query:
        return jsonify({"error": "query required"}), 400
    return _request_fixed_lyrics_origin(
        "https://lrclib.net/api/search",
        request.args.to_dict(flat=False),
        timeout=8,
    )


@app.route("/lyrics/get", methods=["GET"])
def lyrics_get_proxy():
    if not request.args.get("track_name", "").strip():
        return jsonify({"error": "track_name required"}), 400
    return _request_fixed_lyrics_origin(
        "https://lrclib.net/api/get",
        request.args.to_dict(flat=False),
        timeout=8,
    )


@app.route("/lyrics/ovh", methods=["GET"])
def lyrics_ovh_proxy():
    """Free Lyrics.ovh fallback; only fixed-origin requests, never a caller-supplied URL."""
    from urllib.parse import quote
    title = request.args.get("track_name", "").strip()
    artist = request.args.get("artist_name", "").strip()
    if not title or not artist:
        return jsonify({"success": False, "error": "track_name and artist_name required"}), 400
    cache_key = f"lyrics-ovh:{artist}:{title}".lower()
    cached = get_cache(lyrics_cache, cache_key)
    if cached:
        return jsonify(cached)
    url = f"https://api.lyrics.ovh/v1/{quote(artist, safe='')}/{quote(title, safe='')}"
    try:
        upstream = session.get(url, headers={"Accept": "application/json"}, timeout=8)
        if upstream.status_code == 404:
            return jsonify({"success": False, "error": "Lyrics not found", "source": "Lyrics.ovh"}), 404
        upstream.raise_for_status()
        payload = upstream.json()
        lyrics_text = payload.get("lyrics", "") if isinstance(payload, dict) else ""
        if not isinstance(lyrics_text, str) or not lyrics_text.strip():
            return jsonify({"success": False, "error": "Lyrics not found", "source": "Lyrics.ovh"}), 404
        result = {"success": True, "lyrics": lyrics_text.strip(), "source": "Lyrics.ovh"}
        set_cache(lyrics_cache, cache_key, result)
        return jsonify(result)
    except requests.RequestException:
        return jsonify({"success": False, "error": "Lyrics provider temporarily unavailable", "source": "Lyrics.ovh"}), 502


@app.route("/lyricsplus/v2/lyrics/get", methods=["GET"])
def lyricsplus_get_proxy():
    params = request.args.to_dict(flat=False)
    last_response = None
    for origin in LYRICSPLUS_ORIGINS:
        try:
            upstream = session.get(
                f"{origin}/v2/lyrics/get",
                params=params,
                headers={"Accept": "application/json"},
                timeout=5,
            )
            last_response = upstream
            # Try the next fixed provider on missing-route or provider failure responses.
            if upstream.status_code in (404, 405, 410) or upstream.status_code >= 500:
                continue
            return _relay_json_or_body(upstream)
        except requests.RequestException:
            continue
    if last_response is not None:
        return _relay_json_or_body(last_response)
    return jsonify({"success": False, "error": "Lyrics providers temporarily unavailable"}), 502


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)