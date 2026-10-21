## Mujic v13.0.14 — Lyrics Card Refinement & Render Recommendations

- **Share lyrics** stays in the full-screen player's **More Options** sheet, not alongside the primary playback controls. The action opens lyric selection, limited to four synced lines.
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

