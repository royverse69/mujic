# Mujic v13.4.0

- **Quick Picks never shrink** – picks are kept in a persisted, newest-first feed (up to 600). Each song change adds its fresh picks to the *front*; older picks stay. The shelf renders 48 at a time and appends more as you scroll right.
- **Settings redesign** (`css/settings.css`) – inset-grouped lists, coloured category tiles, real animated switches, sticky blurred sub-page headers, 48px+ rows, two-column tiles on large screens. Markup, `data-setting` hooks and JS are unchanged.
- **Desktop mini-player redesign** – floating three-zone player: now playing | previous / play / next with a seekable progress bar and times | volume and PiP. Click or drag the bar to seek. Phone layout is unchanged.
- **Smoother lyrics** – the follow-scroll is now an eased, interruptible JS glide instead of native smooth-scroll (which restarted on every line). Lyric lines animate opacity / transform / filter only.
- **Motion hygiene** – `transition: all` replaced with explicit compositor-friendly properties on buttons, nav, player surfaces, dialogs and lyrics. Off-screen list rows and Quick Picks columns skip rendering.
- **Caching** – in-memory provider caches 2–5× larger with longer lifetimes (stream URLs stay at 4 min), service-worker API/art caches enlarged, search results served stale-while-revalidate for 24 h, trimming throttled. First 24 Quick Picks artworks are pre-warmed.
- **Tab title** – scroll step shortened to 160 ms.
- The "Swipe mini-player down to stop" option now sits in Settings → Player & Audio → Player.
