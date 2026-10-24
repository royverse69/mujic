# Mujic v13.2.0 — API, lyrics reliability, and adaptive motion

## API request reduction
- Removed the fixed Arijit Singh home-album query, Arijit-specific evening fallback query, and the dedicated Arijit suggested-search chip. Listeners can still search for any artist manually; listening-history-based recommendations may naturally include artists the user actually plays.
- Replaced the static multi-celebrity home artist query list with history-led exact lookups. A cold-start install makes one broad artist-catalogue request; populated history uses at most four artist names in capped batches.
- Replaced four fixed trending-artist queries, refreshed on a 15-minute cache interval, with three generic catalogue queries and a one-hour edge-cache interval.
- Playback queue generation now asks the catalogue's suggestions endpoint first and makes at most one contextual fallback search instead of fanning out into album, artist, title/artist, and language-artist searches.
- Empty "Suggested for You" and Quick Picks results have cooldowns so an empty result or transient provider failure doesn't immediately trigger the same requests again. Empty queue payloads are cacheable at the Worker.
- Home shelves use a 45-minute cache, personal suggestions a six-hour cache, and online search input is debounced to 360 ms. Search and catalogue caching at the Worker remains enabled.

## Lyrics reliability
- The browser routes lyric calls through the Cloudflare Worker; it does not call upstream lyric-provider domains directly. The Worker adds the LRCLIB client identifier upstream and caches successful responses at the edge.
- The online track flow makes an exact LRCLIB `api/get` lookup, waits briefly, and then tries one metadata-verified `api/search` request if needed. It no longer queries the redundant `/lyrics?track` wrapper before making another exact lookup, nor repeats the same generic Worker lookup path.
- If lyrics are still missing, the existing Lyrics.ovh and LyricsPlus Worker routes remain part of the fallback chain. The UI then retries the exact LRCLIB lookup twice with backoff and keeps the lyrics view open with a persistent **Try again** action. The unavailable message appears only after those attempts fail.
- LyricClip was not wired to an invented endpoint; no verifiable public API contract was established in this update.

## Motion and mobile behavior
- Settings supports Automatic (device-aware), Full Motion, and Reduced Motion. Automatic honors the operating-system reduced-motion preference and suppresses extra motion on constrained devices.
- Added restrained opacity/transform transitions for views, cards, lyric loading, active lyric lines, and common interactions. Reduced-motion and low-end policies suppress nonessential animation.
- On mobile, the mini-player tucks away as the user scrolls upward and returns while scrolling downward; it stays visible near the top and while the full player is open.

## Validation
`npm run check` passes, including JavaScript syntax validation and all existing regression scripts plus the v13.2.0 API-reduction, lyrics-retry, motion, and mini-player checks. This is automated source-level validation; it is not a substitute for live upstream/API monitoring or physical-device visual testing.
