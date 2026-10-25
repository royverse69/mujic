# v13.2.5 implementation notes

This release is a targeted mini-player, player-artwork, and Search catalogue update. It does not replace or remove the existing playback engines or views.

- Mini-player art dimensions are 48px on mobile and 54px on desktop. Desktop volume/PiP tools are absolutely aligned into one right-side horizontal row; both are forcibly hidden at mobile breakpoints.
- Touch swipes run a brief outgoing animation before requesting the previous/next track. When the new cover source is assigned, the full-player artwork animates in from the opposite side. Device reduced-motion and low-end classes suppress the motion.
- Full-player backdrop uses the current track artwork at strong blur and low brightness/opacity, with a very slow movement. The foreground cover stays crisp.
- Search category cards use source URLs supplied by the user. The browser downloads them lazily and the image files are not packaged locally due the runtime's unavailable external network access.
- `data/discovery-catalog.json` and `js/discovery-catalog-data.js` are kept synchronized for network/fallback paths.
