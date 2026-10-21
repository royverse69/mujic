# Mujic lyric share cards (v13.0.19)

## How to use it

1. Enable **Settings → Lyrics → Lyric sharing cards**.
2. Open the full-screen lyrics for a track. Open the player’s **More Options** menu and choose **Share lyrics**.
3. Tap up to five synced lyric lines to highlight them. Choose **Share card** to preview the square, album-colour card.
4. Save the image as a PNG or use the browser’s native share sheet when image sharing is supported.

The share card follows the interaction pattern documented by Spotify: highlight lyric lines in the full-screen lyrics view, then share the image to a destination. The card’s background colours are derived from the track artwork, with the repository’s actual black or white Spotify logo selected for contrast. It contains track artwork, title, artist and the selected lyric lines, without a QR code or redundant explanatory text around the preview.

## Expected limits

- Only synced/timestamped lyric lines can be selected. Lyrics without timing data cannot produce a reliable deep link to a specific moment.
- The Spotify logo files `icons/Spotify Logo - Black.png` and `icons/Spotify Logo - White.png` must remain in the deployed repository. The app references and pre-caches these exact same-origin assets.
- Web Share API support varies by browser and OS. When file sharing is not available, **Share card** saves the PNG instead.
- PiP availability and the exact native controls are browser-specific. The browser/OS owns the PiP controls and can expose a different set across platforms.


### Card appearance

Open **Settings → Lyrics → Share-card style** to choose **Mujic Style** or **Spotify Style**. Spotify Style uses the RGB negative of the dominant album-cover accent to make the cover stand out; Mujic Style keeps the cover-derived accent colour and uses the original Mujic app icon. The setting is saved with your other preferences.

## Picture-in-Picture playback controls (v13.0.19)

The Document PiP window uses direct Player/AudioAdapter actions. For browsers that only support video PiP, the silent canvas video’s play/pause events are bridged to the same audio player, while Media Session actions use a shared deduplicated request path. Track/position metadata follows the active audio element. Exact native controls are controlled by browser and operating-system support.
