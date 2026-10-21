# Mujic lyric share cards (v13.0.10)

## How to use it

1. Open a streaming track with synced lyrics.
2. Long-press a lyric line (or right-click a line on desktop) to enter selection mode.
3. Tap/click up to three more timed lines. Use **Share card** to open the preview.
4. Save the image as a PNG or use the browser's native share sheet when image sharing is supported.
5. The QR opens Mujic with the shared catalogue track ID (`s`) and the selected first line timestamp (`t`, seconds).

The share-card renderer and QR encoder are bundled locally; card creation itself does not call a third-party QR service. The share URL uses the existing public Mujic app URL.

## Expected limits

- A QR can launch a playable track only for streaming-catalogue tracks. Local files are private to the device and cannot be made playable for another person by sharing a URL.
- Only synced/timestamped lyric lines can be selected. Lyrics without timing data cannot produce a reliable deep link to a specific moment.
- Web Share API support varies by browser and OS. When file sharing is not available, **Share card** saves the PNG instead. Browsers may require the recipient to tap Play after opening a shared link.
- PiP availability and the exact native controls are browser-specific. Mujic synchronizes the hidden PiP video with the audio engine and publishes Media Session actions/position, but the browser/OS owns the PiP controls and can expose a different set across platforms.
