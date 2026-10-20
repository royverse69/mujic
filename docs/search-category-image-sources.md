# Search category artwork sources

The Browse Categories view loads photos from Unsplash's image CDN in regular `<img loading="lazy">` elements. Images are requested only as the grid approaches the viewport; the app's image caching service worker can retain them for later visits when caching is enabled.

Sources use the Unsplash image CDN and the Unsplash License: https://unsplash.com/license . These are decorative category illustrations, not claims that the subjects pictured are the specific artist or genre. Network availability and individual asset URLs can change; if a URL stops resolving, replace it with another image whose source page and license have been reviewed.
