# Mujic v13.2.0 — API, lyrics reliability, and adaptive motion

## API request reduction
- Removed the unsolicited fixed “Arijit Singh” album query and Arijit-specific evening suggestions. Generic romantic Hindi/Bollywood terms are used unless listening history naturally informs recommendations.
- Replaced the large static artist-search list with history-led exact lookups (maximum four per refresh); a cold-start install uses one broad artist catalogue request.
- The Worker trending endpoint now uses three generic cached queries rather than four fixed celebrity searches, with a one-hour fresh cache window. Playback queue generation prefers the catalogue suggestions endpoint and makes at most one contextual fallback search instead of several artist/album/language searches.
- Empty recommendation results are cached too, preventing repeated failed suggestions from firing on every Home refresh. Home shelf query fan-out remains bounded, the home cache lasts 45 minutes and the suggestion cache lasts 6 hours, and online search debounce is 360 ms.

## Lyrics reliability
- Online music catalogue lookup is followed by LRCLIB’s documented `api/get` and (when needed) `api/search` endpoints through the Cloudflare Worker, so requests remain edge-cached and the browser never contacts upstream lyric providers directly. The Worker identifies Mujic to LRCLIB.
- The online track flow makes one exact Worker-cached LRCLIB lookup followed by a short pause and one verified search if needed; it no longer calls the duplicate `/lyrics?track` wrapper or repeats the same `lyrics/get` and `lyrics/search` requests in the generic fallback path.
- Lyrics loading now retries the exact LRCLIB lookup twice with backoff, retains lyrics view while checking, and shows a persistent “Try again” action if no verified lyrics are returned.
- Kept existing Lyrics.ovh / LyricsPlus fallback paths. No guessed LyricClip endpoint was added because a verifiable public API specification was not found.

## Motion and mobile behavior
- Motion setting now supports Automatic (device-aware), Full Motion, and Reduced Motion. Automatic respects reduced-motion OS preference and reduces extra animation on constrained devices.
- Added lightweight transitions for view changes, cards, lyrics loading and active lyric lines. Transitions primarily use opacity/transform and are suppressed by reduced-motion and low-end policies.
- On mobile, the mini-player tucks away while the user scrolls toward the top and returns while scrolling down; it stays visible near the top and when the full player is open.

## Validation
Run `npm run check`. Automated checks include source syntax, existing regression tests, API fan-out constraints, lyric retry flow, adaptive motion, and mini-player scroll behavior.
