# Mujic

Offline-first music player PWA with optional streaming, synced lyrics and artwork-led lyric cards.

## Architecture (v13.1.0)

Every network request the app makes — catalogue search, artist/album/playlist details, recommendations,
lyrics and audio/artwork media — goes to **one origin: the Cloudflare Worker at `https://mujic.calverse.online`**
(source in [`worker/`](worker/)). There is no Render service and no direct browser-to-upstream traffic.

Caching, from the outside in:

1. **In memory** (`online-provider.js`): finished catalogue answers are reused instantly (stale-while-revalidate),
   identical in-flight requests share one network call, and abandoned requests still finish to warm the cache.
2. **Service worker** (`sw.js`): JSON from the Worker is cached with stale-while-revalidate (search fresh 5 min,
   usable stale for 1 h); artwork and the first 256 KiB of the next track are cached separately.
3. **Cloudflare edge** (`worker/index.js`): the Cache API stores every JSON route with per-route TTLs and
   stale-while-revalidate; `/media` is cached by Cloudflare (including byte ranges). The upstream catalogue is
   contacted only on a miss.

## Deploying the Worker

```bash
cd worker
npx wrangler deploy      # serves mujic.calverse.online (see wrangler.toml)
```

Check it: `/health`, `/api/search/songs?query=Billie%20Eilish&limit=5`, `/trending`, `/lyrics/search?q=...`.
Routes: `/api/*`, `/media`, `/search`, `/trending`, `/queue/:id`, `/stream/:id`, `/song/:id`, `/suggest`,
`/lyrics`, `/lyrics/get`, `/lyrics/search`, `/lyrics/ovh`, `/lyricsplus/v2/lyrics/get`.

## Run locally

`npm start` serves the static app on port 3000. `npm run check` runs the syntax and regression checks.
