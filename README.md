# Vinum Sacrum — An Atlas of Wine & Catholic Faith

An illuminated atlas mapping the world's wine-producing nations to the saints, religious orders, and Catholic traditions that shaped their vineyards.

## What's inside

- **97 wine-producing nations** across all continents
- **116 regions** with detailed Catholic narratives, signature wines, and historical landmarks
- **22 saint biographies** — from Saint Benedict and Saint Martin of Tours to Dom Pérignon, Saint Junípero Serra, and Blessed Pier Giorgio Frassati
- **11 religious orders** — Benedictines, Cistercians, Cluniacs, Carthusians, Dominicans, Franciscans, Jesuits, Premonstratensians, Trappists, Salesians, Marists
- Interactive Leaflet maps for every region with pinned abbeys, monasteries, cathedrals, and vineyards

## Tech

Pure static site — HTML, CSS, vanilla JavaScript. No build step, no backend, no dependencies beyond the Leaflet CDN.

```
index.html
css/styles.css
js/app.js
data.json
images/
  saints/     22 portraits
  orders/     11 emblems
```

## Run locally

Any static file server works. Two easy options:

```bash
# Python (built-in)
python3 -m http.server 8000

# Node
npx serve .
```

Then open http://localhost:8000

## Deploy

### Render (Static Site)

1. New + → **Static Site** (not Web Service)
2. Connect this repo, branch `main`
3. Build Command: *(leave blank)*
4. Publish Directory: `.`

### Any other static host

GitHub Pages, Netlify, Cloudflare Pages, Vercel — all work out of the box. Point them at the repo root.

## License

Content compiled from public-domain hagiographical sources and Wikimedia Commons imagery.
