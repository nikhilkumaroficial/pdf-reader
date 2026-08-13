# Leaf PDF Book Reader

A local-first PDF reader with IndexedDB storage, PDF.js rendering, responsive library UI, progress persistence, zoom, fullscreen, keyboard/touch navigation and a physical-style page-turn transition.

## Run

Because PDF.js modules and browser APIs are used, serve this folder from a local HTTP server instead of opening `index.html` with `file://`.

Example:

```bash
python -m http.server 5173
```

Then open `http://localhost:5173`.

PDF data is stored in IndexedDB and is not uploaded by this app. PDF.js is loaded from the Cloudflare CDN, so an internet connection is required for the reader engine unless you vendor PDF.js locally.
