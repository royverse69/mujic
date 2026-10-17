# Render backend proxy routes for Mujic v12.0.32

The PWA now sends catalogue and lyrics API calls to the Render service at `https://gaana-suno-varna-machhar-aajayega.onrender.com`. Known Saavn/JioSaavn audio and artwork CDN URLs are also loaded through the Render `/media?url=...` byte-range proxy. The PWA cannot change the deployed server itself. To activate the new requests, merge `proxy-route-patch.py` into the existing Flask app in the Render-linked repository and redeploy it.

## Important deployment note

Do **not** blindly overwrite a newer production `app.py` with this project snapshot. Add the route patch to the backend source that is currently deployed. It expects the existing app to define `app`, `request`, `jsonify`, `Response`, `requests`, `session`, and `BASE_API`. Keep the existing `/`, `/health`, `/search`, `/song/<id>`, `/stream/<id>`, `/queue/<id>`, `/artist/<name>`, `/trending`, and `/lyrics` routes intact.

## Routes added by the patch

- `/api/search`, `/api/search/songs`, `/api/search/artists`, `/api/search/albums`, `/api/search/playlists`
- `/api/songs`, `/api/songs/<id>`, `/api/songs/<id>/suggestions`
- `/api/artists`, `/api/artists/<id>`, `/api/artists/<id>/songs`, `/api/artists/<id>/albums`
- `/api/albums`, `/api/playlists`
- `/lyrics/search`, `/lyrics/get`, `/lyricsplus/v2/lyrics/get`
- `/media?url=...` for HTTPS media hosts under `saavncdn.com` and `jiosaavn.com`, including Range requests for audio seeking

The catalogue proxy uses the fixed server-side `BASE_API` and an allowlist of catalogue route prefixes; it does not accept arbitrary destination URLs. Lyrics endpoints likewise use fixed upstream origins.

## Verify after redeploy

1. Visit `/health` and confirm it returns `status: ok`.
2. Test `/api/search/songs?query=Billie%20Eilish&limit=5` in a browser.
3. Test `/api/artists?link=<encoded-artist-link>` with an actual artist link.
4. Test `/lyrics/search?q=Billie%20Eilish%20everything%20i%20wanted`.
5. Reload Mujic with network access. If old frontend assets persist, close installed tabs and reopen after the service-worker cache update.

The app shell still uses catalogue-provided media URLs as source metadata, but known Saavn/JioSaavn audio/artwork requests are fetched through Render with Range support for playback seeking. The proxy only permits fixed catalogue media domains and validates redirects; it is not an arbitrary URL proxy.


### v12.0.39 lyrics fallback

The new frontend calls `GET /lyrics/ovh?track_name=...&artist_name=...` only after LRCLIB and the existing Render lyrics route have no verified match. Merge the corresponding `lyrics_ovh_proxy` route from `proxy-route-patch.py` into the deployed Flask backend and redeploy Render for this final fallback to work. It calls only the fixed `https://api.lyrics.ovh` origin; it does not accept arbitrary URLs. The source comes from the `artist` and `title` metadata on both local tracks and online catalogue tracks.
