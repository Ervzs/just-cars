# 01 · System Overview and Data Flow

## What the system is

Just Cars is a **static single-page application (SPA)** that showcases about 2,300 car generations from around the world. Each entry has a photo, an optional rotatable 3D model, specs and a description.

The system has two halves that never run at the same time:

| Half | Runs | Job |
|---|---|---|
| **Data pipeline** (`scripts/build-data.mjs`) | On a developer machine, on demand (`npm run data`) | Pulls data from three public APIs, merges and cleans it, and writes static JSON files into `public/data/` |
| **Web app** (`src/`) | In the visitor's browser | Downloads those JSON files and renders the grid, filters, and car pages |

There is no backend server, database or runtime API. All data a visitor sees was computed ahead of time and committed to git.

## Tech stack

| Layer | Technology | Version | Role |
|---|---|---|---|
| Language (app) | **TypeScript** | ~6.0 | Typed JavaScript for everything in `src/` |
| Language (pipeline) | **JavaScript (ES modules)** | ES2023 | `build-data.mjs`, run directly by Node |
| UI library | **React** | 19 | Component rendering and state |
| Routing | **React Router** | 8 (data router API) | Maps URLs to pages, reads and writes query strings |
| Styling | **Tailwind CSS** | 4 | Utility-class CSS generated at build time |
| Build tool / dev server | **Vite** | 8 | Dev server with hot reload, production bundler |
| Linter | **oxlint** | 1.x | Fast Rust-based linter (ESLint-compatible rules) |
| Runtime (pipeline) | **Node.js** | 24 (20.19+ required by Vite) | Runs the pipeline and the build tooling |
| Fonts | **Archivo** (Google Fonts) | variable, `wdth` + `wght` axes | The only typeface. Its width axis carries the visual hierarchy |
| External data | FuelEconomy.gov, Wikipedia/MediaWiki, Sketchfab | — | Specs, text and photos, and 3D models |
| Hosting | **GitHub Pages** + **GitHub Actions** | — | Static file hosting at `/just-cars/`; the workflow builds and publishes on every push |

### Terms

- **SPA (single-page application):** the server returns one HTML file (`index.html`). JavaScript then renders every "page" in the browser and swaps views without reloading.
- **Static site:** every file is pre-built. The host only serves files and never runs code per request.
- **Build-time data ("static generation"):** data is fetched once when the site is built, not on each visit. This trades freshness for speed, zero runtime cost and no API-key exposure.

## Why this architecture

| Decision | Chosen | Alternatives rejected | Reasoning |
|---|---|---|---|
| Where data comes from at runtime | Pre-built JSON files | A backend API with a database; calling FuelEconomy/Wikipedia/Sketchfab from the browser | The catalog changes rarely. Pre-building removes servers, databases, CORS issues, rate limits per visitor and API dependency at runtime. Hosting stays free. |
| Rendering model | Client-side SPA | Server-side rendering (Next.js), a static site generator (Astro) | No SEO-critical dynamic content and no server. A plain SPA on a static host is the simplest thing that works. One trade-off: car pages are not pre-rendered HTML. |
| Data granularity | One small index plus one file per car | One big file; a client-side database (SQLite/WASM) | The grid needs only summary fields. Detail fields (descriptions, specs) load only when a car is opened. |
| EPA source | Bulk CSV download | FuelEconomy REST API (one call per year/make/model/option) | One 22 MB request replaces tens of thousands of throttled calls. The CSV also has an EPA-curated `baseModel` grouping column. |

## Component map

```
                ┌────────────── build time (developer machine) ──────────────┐
FuelEconomy CSV ┐                                                             │
Wikipedia APIs  ├──► scripts/build-data.mjs ──► public/data/index.json        │
Sketchfab API   ┘        │  (cache: scripts/.cache/)   public/data/cars/*.json│
                └────────┼───────────────────────────────────────────────────┘
                         ▼ git commit + push
                ┌────── GitHub Actions → GitHub Pages ──┐
                │ npm run build → dist/ (static files)  │
                └──────────────┬────────────────────────┘
                               ▼ HTTP GET
                ┌──────────────── browser ────────────────┐
                │ index.html → main.tsx → RouterProvider  │
                │   Layout (header, footer)               │
                │   ├─ HomePage  ← /data/index.json       │
                │   ├─ CarPage   ← /data/cars/{id}.json   │
                │   ├─ CreditsPage                        │
                │   └─ NotFoundPage                       │
                │ data.ts: useJson cache, filterCars      │
                └─────────────────────────────────────────┘
                               │ iframe (car pages with 3D)
                               ▼
                     sketchfab.com embed viewer
```

## End-to-end data flow

A "request" in this system has two phases. First, data is **produced** at build time. Later, it is **consumed** at visit time.

### Phase 1: Producing data (`npm run data`)

1. **EPA ingest.** `loadEpa()` downloads `vehicles.csv` and parses each line with a regex CSV parser. It keeps rows from 2000 onward and groups them by `slug(make + baseModel)`, which merges case variants such as `LEAF`/`Leaf`.
2. **Wikipedia resolution.** For each EPA group, `findWiki()` resolves a Wikipedia article. Groups that land on the same article become one *article* entry, and their EPA model names become `variants` (296 GTB, 296 GTS and 296 Speciale all become "Ferrari 296").
3. **Global models.** For each Asian brand in `BRAND_CATEGORIES`, the script lists the members of the brand's Wikipedia category (e.g. "Toyota vehicles"). It keeps passenger-vehicle articles not already covered. This is how the Hilux, Vios, MU-X and similar get in.
4. **Generations.** `generations()` reads the article's section headings (e.g. "Eighth generation (AN120/AN130; 2015)") and turns them into year ranges.
5. **Per-generation assets:**
   - `sectionImage()` and `fileUrls()` fetch a photo for each generation.
   - `findModels()` fetches Sketchfab 3D models.
   - `aliases()` fetches other market names from Wikipedia redirects.
6. **Assemble entries.** One entry is created per article + generation. EPA rows are assigned to generations by year, and specs come from the latest year's base variant.
7. **Write.** The script clears `public/data/cars/`, writes one `{id}.json` per entry, then writes `index.json`, which holds the summary fields of all entries.

Every HTTP response is cached on disk in `scripts/.cache/`. A second run makes zero network calls unless a request's URL changed.

### Phase 2: Consuming data (a visitor opens `/cars/toyota-hilux-eighth-generation?q=hilux`)

1. **Host.** `/just-cars/cars/...` is not a real file. GitHub Pages has no rewrite rules, so it serves the site's `404.html`, a copy of `index.html` made by the deploy workflow. The app loads from it.
2. **Boot.** `index.html` loads the bundled `main.tsx`. `createBrowserRouter` (with `basename` `/just-cars/`) matches the URL to the `/cars/:id` route, nested inside the `Layout` route.
3. **Render pass 1 (loading state):**
   - `CarPage` reads `id` with `useParams()` and the query string with `useSearchParams()`.
   - It calls `useJson('/data/cars/toyota-hilux-eighth-generation.json')` and `useIndex()`.
   - Neither response has arrived, so a skeleton renders.
4. **Fetch.** `fetchJson()` in `data.ts` issues `fetch()` requests and stores each promise in a module-level `Map`, so a URL is fetched once per page session.
5. **Render pass 2 (data):** when the promises resolve, `setState` triggers a re-render with the car detail. `filterCars(index, params)` recomputes the visitor's filtered list from the `?q=hilux` query, giving the previous and next neighbours.
6. **Output:** title block, Sketchfab `<iframe>` (or photo), the fuel-economy panel (only if `specs` exists), "Other generations" links and the description.
7. **Failure path.** If the JSON file is missing, the host answers 404, or a dev server returns HTML. Either way the promise rejects, `error` becomes `true`, and `NotFoundPage` renders.

The "storage" is the static file system of the host. The "business logic" at request time is `filterCars()` running in the browser.

## Engineering conventions

### Directory structure

```
just-cars/
├── index.html               Vite entry HTML: fonts, meta tags, #root mount point
├── vite.config.ts           Vite plugins: React + Tailwind
├── tsconfig*.json           TypeScript project references (app vs. node config)
├── .oxlintrc.json           Lint rules (React hooks rules enforced)
├── .github/workflows/deploy.yml  Build + publish to GitHub Pages
├── deploy.md                Deployment guide
├── design/mockup.html       Approved static design (direction A: "Window sticker")
├── scripts/
│   ├── build-data.mjs       The entire data pipeline (single file)
│   ├── .cache/              Raw API responses (gitignored)
│   └── .out-test/           Output of limited test runs (gitignored)
├── public/                  Copied verbatim into dist/
│   ├── data/index.json      CarSummary[] for the grid (~1 MB)
│   ├── data/cars/*.json     One CarDetail per car generation (~2,300 files)
│   ├── favicon.svg, robots.txt
└── src/
    ├── main.tsx             Router definition and React mount
    ├── index.css            Tailwind import, design tokens (@theme), global CSS
    ├── data.ts              Types, fetch cache hook, search/filter logic
    ├── components/Layout.tsx Shared header (with quick search), footer, <Outlet/>
    └── pages/               One component per route
```

### Patterns used

| Pattern | Where | Why |
|---|---|---|
| **URL as state** | `HomePage` filters live in `useSearchParams()`, not in `useState` | The back button, refresh and shared links all restore the exact filtered view. Prev/next on car pages can recompute the same list. |
| **Single shared filter function** | `filterCars()` in `data.ts`, used by the grid and by `CarPage` | The grid order and prev/next order can never disagree. |
| **Fetch-once promise cache** | `fetchJson()` + `useJson()` | `index.json` (1 MB) is downloaded once and reused by the Layout, HomePage and CarPage. |
| **Layout route** | `Layout` wraps all routes via `<Outlet/>` | Header and footer render once. Pages only render their own content. |
| **Static generation + cache-aside** | `get()` in the pipeline | Each external response is fetched once, stored by the SHA-1 of its URL, and reused forever. |
| **Generate, don't hand-edit** | `public/data/` is only written by the script | Data fixes go into the script's heuristics, so a rerun reproduces them. |

### Feature lifecycle

1. **Plan:** the agreed process plans a phase, then approves it.
2. **Data change?** Edit `scripts/build-data.mjs`, then test with a limited run: `npm run data -- 40 Toyota,Isuzu`. This writes to `scripts/.out-test/` and never touches real data.
3. **Full regeneration:** `npm run data`. It's fast when cached.
4. **UI change:** edit `src/`, check with `npm run dev`, then confirm with `npm run build` (typecheck plus bundle) and `npm run lint`.
5. **Commit** in small, single-purpose steps (data and app separately), then push. A push to `main` redeploys the host.
