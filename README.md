## Mujic v13.0.20 — Onboarding, Install Banner & Faster Search Playback

- **Install banner** shows on the Offline and Online *Home* screens only, when the browser exposes install (or on iOS, with Add to Home Screen instructions). Dismissing it hides it for 7 days; it never shows in the installed app.
- **First-run guide** explains the Offline/Online switch, how each mode works, turning on lyrics, Settings customization and extras. It appears once for new users and can be replayed from **Settings → App & About → App guide**.
- **Wavy waveform** is now the default seek-bar effect (existing installs still on the old "off" default are migrated once).
- **Greeting fix**: the Offline Home greeting follows the time of day instead of always showing "Good evening".
- **Search playback**: tapped streaming search results request media from `mujic.calverse.online` first; Render remains the fallback. Quick Picks / Suggested shelves still use Render directly.

## Mujic v13.0.16 — Lyrics Card Refinement & Render Recommendations

- **Share lyrics** stays in the full-screen player's **More Options** sheet, not alongside the primary playback controls. The action opens lyric selection, limited to five synced lines.
- The share card follows the supplied portrait reference: a dark, subdued backdrop sampled from the song's actual album cover, large readable lyrics, the cover image, song title and artist, and the original repository Mujic icon. The generated image contains **no QR code**.
- The card supports local and streaming tracks. When supported, sharing text can retain the song/timestamp link; this is separate from the QR-free image.
- **Quick Picks** requests Render `/trending` directly. **Suggested for You** requests Render `/queue/<song_id>` and `/search?q=...` directly. Other catalogue shelves, general search, stream resolution, playlists and local library routes remain unchanged.
- PWA version/cache and regression checks are updated for this release.

### Validate

Run `npm run check`. The Render route tests stub the backend and verify that Quick Picks/Suggested requests use the Render origin rather than the Cloudflare primary. Live suggestions still depend on the deployed Render service and its CORS policy.

### Previous update notes

- The Home Radio shelf is a touch-friendly horizontal rail with scroll snapping; the All stations page remains a grid.
- Restored the previous full-screen player header. The now-playing treatment applies to queue and playlist rows instead of altering the full-screen player UI.
- Retained the 31-category discovery catalog, station-specific radio playback, and existing backend routes.


## v13.0.16 — Spotify-style lyric cards and mobile polish

- Lyric sharing can be enabled or disabled from Settings → Lyrics.
- Share cards use a square album-colour layout, artwork and song metadata at the top, left-aligned selected lyrics, and the repository’s black/white Spotify logo variant for contrast.
- Redundant share-dialog subtitle and preview caption removed.
- Smaller/low-end devices skip expensive glass blur layers and the card’s blurred full-canvas background.
- Keep the existing `icons/Spotify Logo - Black.png` and `icons/Spotify Logo - White.png` files in the repository; the app references and service-worker caches those exact assets.


## v13.0.18 changes

- Document PiP is preferred when available and contains directly connected play/pause, previous/next, ±10-second seek and a seek bar. Browser-native video PiP remains as a fallback.
- Media Session actions use the shared Player and current audio element to keep external controls and player state synchronized.
- Settings → Lyrics now includes a persistent share-card style selector (Mujic or Spotify). Spotify cards use a complementary negative of the artwork palette.

Document PiP requires a secure context (typically HTTPS) and a supporting browser. The fallback uses Media Session action handlers; exact native controls depend on browser/OS support.


## v13.0.19 — PiP control synchronization

- Native video PiP play/pause controls now operate the real music player; duplicate browser Media Session requests are deduplicated.
- PiP playback state and metadata follow the audio element, with event listeners safely attached when PiP opens and removed when it closes.
- PiP canvas drawing is cached by track/artwork so the background sync does not redraw unchanged pixels.
- Settings → Lyrics continues to offer Mujic Style and Spotify Style share cards; Spotify backgrounds use the RGB negative of the sampled album-art palette.
