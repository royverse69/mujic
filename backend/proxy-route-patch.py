"""
Mujic Render backend proxy routes.

Merge these routes into the existing deployed Flask app; do not blindly replace a newer
production backend with this project snapshot. The live app must already define `app`,
`request`, `jsonify`, `Response`, `requests`, `session`, and `BASE_API`.
"""

from flask import Response
import requests
from urllib.parse import urljoin, urlparse

ALLOWED_CATALOGUE_PREFIXES = {"search", "songs", "albums", "artists", "playlists"}
LYRICSPLUS_ORIGINS = (
    "https://lyricsplus.prjktla.my.id",
    "https://lyricsplus.prjktla.workers.dev",
    "https://lyricsplus-seven.vercel.app",
)


def _mujic_proxy_response(upstream):
    content_type = upstream.headers.get("Content-Type", "application/json")
    if "json" in content_type.lower():
        try:
            return jsonify(upstream.json()), upstream.status_code
        except ValueError:
            pass
    return Response(upstream.content, status=upstream.status_code, content_type=content_type)


@app.route("/api/<path:upstream_path>", methods=["GET"])
def mujic_catalogue_proxy(upstream_path):
    first_segment = (upstream_path or "").split("/", 1)[0].lower()
    if first_segment not in ALLOWED_CATALOGUE_PREFIXES:
        return jsonify({"success": False, "error": "Catalogue route not allowed"}), 404
    try:
        upstream_base = BASE_API.rstrip("/")
        target = f"{upstream_base}/{upstream_path}"
        upstream = session.get(
            target,
            params=request.args.to_dict(flat=False),
            headers={"Accept": request.headers.get("Accept", "application/json")},
            timeout=18,
        )
    except requests.RequestException:
        return jsonify({"success": False, "error": "Upstream catalogue temporarily unavailable"}), 502
    return _mujic_proxy_response(upstream)


CATALOGUE_MEDIA_DOMAINS = ("saavncdn.com", "jiosaavn.com")


def _mujic_allowed_media_url(value):
    try:
        parsed = urlparse(str(value or ""))
        host = (parsed.hostname or "").lower().rstrip(".")
        return (
            parsed.scheme == "https"
            and not parsed.username
            and not parsed.password
            and parsed.port in (None, 443)
            and any(host == domain or host.endswith("." + domain) for domain in CATALOGUE_MEDIA_DOMAINS)
        )
    except (TypeError, ValueError):
        return False


@app.route("/media", methods=["GET"])
def mujic_catalogue_media_proxy():
    target = request.args.get("url", "").strip()
    if not _mujic_allowed_media_url(target):
        return jsonify({"error": "Unsupported catalogue media host"}), 403
    forwarded = {"Accept-Encoding": "identity"}
    for header in ("Range", "If-Range", "If-None-Match", "If-Modified-Since", "Accept"):
        if request.headers.get(header):
            forwarded[header] = request.headers[header]
    upstream = None
    current = target
    for _ in range(5):
        if not _mujic_allowed_media_url(current):
            if upstream is not None:
                upstream.close()
            return jsonify({"error": "Redirected media host is not allowed"}), 403
        try:
            upstream = session.get(current, headers=forwarded, stream=True, allow_redirects=False, timeout=(8, 45))
        except requests.RequestException:
            return jsonify({"error": "Catalogue media is temporarily unavailable"}), 502
        if upstream.status_code not in (301, 302, 303, 307, 308):
            break
        location = upstream.headers.get("Location")
        upstream.close()
        if not location:
            return jsonify({"error": "Media redirect did not provide a destination"}), 502
        current = urljoin(current, location)
    else:
        if upstream is not None:
            upstream.close()
        return jsonify({"error": "Too many media redirects"}), 502
    headers = {key: upstream.headers[key] for key in ("Content-Type", "Content-Length", "Content-Range", "Accept-Ranges", "ETag", "Last-Modified") if key in upstream.headers}
    headers.setdefault("Cache-Control", "public, max-age=900")
    # Cross-origin MediaElementSource/equalizer use requires an explicit CORS grant.
    headers["Access-Control-Allow-Origin"] = "*"
    headers["Access-Control-Expose-Headers"] = "Accept-Ranges, Content-Length, Content-Range, Content-Type, ETag, Last-Modified"
    response = Response(upstream.iter_content(chunk_size=64 * 1024), status=upstream.status_code, headers=headers)
    response.call_on_close(upstream.close)
    return response


def _mujic_fixed_lyrics_request(url, params, timeout=8):
    try:
        upstream = session.get(url, params=params, headers={"Accept": "application/json"}, timeout=timeout)
    except requests.RequestException:
        return jsonify({"success": False, "error": "Lyrics provider temporarily unavailable"}), 502
    return _mujic_proxy_response(upstream)


@app.route("/lyrics/search", methods=["GET"])
def mujic_lyrics_search_proxy():
    if not request.args.get("q", "").strip():
        return jsonify({"error": "query required"}), 400
    return _mujic_fixed_lyrics_request("https://lrclib.net/api/search", request.args.to_dict(flat=False))


@app.route("/lyrics/get", methods=["GET"])
def mujic_lyrics_get_proxy():
    if not request.args.get("track_name", "").strip():
        return jsonify({"error": "track_name required"}), 400
    return _mujic_fixed_lyrics_request("https://lrclib.net/api/get", request.args.to_dict(flat=False))


@app.route("/lyricsplus/v2/lyrics/get", methods=["GET"])
def mujic_lyricsplus_get_proxy():
    params = request.args.to_dict(flat=False)
    last_response = None
    for origin in LYRICSPLUS_ORIGINS:
        try:
            upstream = session.get(f"{origin}/v2/lyrics/get", params=params, headers={"Accept": "application/json"}, timeout=5)
            last_response = upstream
            if upstream.status_code in (404, 405, 410) or upstream.status_code >= 500:
                continue
            return _mujic_proxy_response(upstream)
        except requests.RequestException:
            continue
    if last_response is not None:
        return _mujic_proxy_response(last_response)
    return jsonify({"success": False, "error": "Lyrics providers temporarily unavailable"}), 502


@app.route("/lyrics/ovh", methods=["GET"])
def mujic_lyrics_ovh_proxy():
    """Fixed-origin free-lyrics fallback; route all upstream requests through Render."""
    from urllib.parse import quote
    title = request.args.get("track_name", "").strip()
    artist = request.args.get("artist_name", "").strip()
    if not title or not artist:
        return jsonify({"success": False, "error": "track_name and artist_name required"}), 400
    url = f"https://api.lyrics.ovh/v1/{quote(artist, safe='')}/{quote(title, safe='')}"
    try:
        upstream = session.get(url, headers={"Accept": "application/json"}, timeout=8)
    except requests.RequestException:
        return jsonify({"success": False, "error": "Lyrics provider temporarily unavailable"}), 502
    if upstream.status_code == 404:
        return jsonify({"success": False, "error": "Lyrics not found", "source": "Lyrics.ovh"}), 404
    return _mujic_proxy_response(upstream)
