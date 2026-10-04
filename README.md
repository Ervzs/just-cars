# Just Cars

A static site showcasing cars from around the world since 2000, one card per generation, with Wikipedia descriptions and photos, EPA specs for US models, and rotatable Sketchfab 3D models where available.

## Develop

```sh
npm install
npm run dev        # http://localhost:5173/just-cars/
```

## Data

`npm run data` rebuilds `public/data/` from FuelEconomy.gov (bulk CSV), Wikipedia (articles, brand categories, generations) and Sketchfab. API responses are cached in `scripts/.cache/`, so reruns are fast. For a quick test pass a limit and optional makes, e.g. `npm run data -- 20 Toyota,Isuzu`. Test runs write to `scripts/.out-test/` and never touch `public/data/`. The year range and the Asian brand categories are set at the top of `scripts/build-data.mjs`.

## Deploy

Every push to `main` builds and publishes the site to **GitHub Pages** (`https://ervzs.github.io/just-cars/`) via `.github/workflows/deploy.yml`. One-time setup: repo **Settings → Pages → Source: GitHub Actions**. Details in [deploy.md](deploy.md).
