# Leaf PDF Book Reader

A local-first PDF reader with IndexedDB storage, PDF.js rendering, single-page reading mode, responsive controls, 50%-400% zoom, fit-to-page/fit-width controls, keyboard/touch navigation, and a 3D paper-style page curl animation.

## Run locally

This is a static site. You can deploy it directly to GitHub Pages. For local testing, serve this folder with any static HTTP server, for example:

```bash
python -m http.server 5173
```

Then open `http://localhost:5173`.

## GitHub Pages

Upload the contents of this folder to a public repository, then enable **Settings → Pages → Deploy from a branch → main → /(root)**.

PDF files are stored only in the browser's IndexedDB and are not uploaded to the server.
