# API integration

The PWA talks to a single backend: the Cloudflare Worker at `https://mujic.calverse.online` (`worker/index.js`).

## Catalogue
`/api/<search|songs|albums|artists|playlists>/...` is relayed to `https://saavn.sumit.co/api` with a fixed allowlist.
Queries are normalised (sorted parameters) so equivalent requests share one cache entry.

| Route | Edge fresh | Stale-while-revalidate |
| --- | --- | --- |
| song search | 10 min | 1 h |
| artist/album/playlist search | 30 min | 2 h |
| song details | 15 min | 2 h |
| suggestions / `/queue` / `/trending` | 15–30 min | 2 h |
| details (albums, artists, playlists) | 30 min | 6 h |
| lyrics (hit) | 24 h | 7 d |
| lyrics (miss) | 30 min | 1 h |

## Lyrics
`/lyrics/get`, `/lyrics/search` (LRCLIB), `/lyrics/ovh` (Lyrics.ovh) and `/lyricsplus/v2/lyrics/get`
(LyricsPlus mirrors raced in parallel; the first healthy answer wins). All origins are fixed server-side.

## Media
`/media?url=` accepts HTTPS URLs on `saavncdn.com` / `jiosaavn.com` only, validates every redirect hop,
supports `Range`, sends CORS headers for the equalizer/visualizer, and is cached by Cloudflare.

## Browser side
- `js/backend-config.js` — the single origin, a bounded retry on network/gateway errors.
- `js/online-provider.js` — in-memory SWR cache, request coalescing, abort-safe searches.
- `sw.js` — API stale-while-revalidate, artwork cache, first-chunk media prefetch, network-first navigation with a timeout.
