# Mujic v13.2.7

## Picture-in-Picture redesign
- Rebuilt Document Picture-in-Picture as a cover-led player with the album artwork filling the entire window, a legible dark lower gradient, title/artist overlay, elapsed/remaining times, seek bar, centered play/pause, previous/next, volume, more options, lyrics and queue controls.
- Sized the initial PiP window to a square layout and added compact responsive rules for short or narrow PiP windows. The title/progress block sits lower like the supplied reference, and the centered play/pause is a transparent icon rather than a white tile.
- Album artwork uses the largest already-known artwork URL and a fallback on load failure.

## Search playlist playback
- Online rows resolve tracks from their active search, playlist, artist/category, history or shelf context before requiring a registry hit.
- Context tracks, including serialized saved-playlist entries, are re-registered with the streaming provider before the Player queue uses their IDs, preventing playlist taps from being rejected after provider-cache eviction. Catalogue rows also switch to streaming mode from the same tap when necessary.
- Search song taps keep the prior single-song queue behavior; playlist/collection rows start the selected track with the remaining context queue.

## Validation
- `npm run check` passes with regression coverage for the PiP layout, context recovery, and playback handoff after provider-cache eviction.
