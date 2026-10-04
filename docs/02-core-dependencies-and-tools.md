# 02 · Core Dependencies and Tools

The project deliberately has **three runtime dependencies** (`react`, `react-dom`, `react-router`). Everything else is build tooling that doesn't ship to the browser. The data pipeline uses **no npm packages at all**, only Node built-ins.

## Inventory

### Runtime (`dependencies`, shipped to the browser)

| Package | What it is | Problem it solves here |
|---|---|---|
| `react` | Component model + state/effects (hooks) | Re-renders the grid when filters change. Renders the car page when its JSON arrives. |
| `react-dom` | React's browser renderer | `createRoot(...).render()` in `main.tsx` mounts the app into `<div id="root">`. |
| `react-router` (v8) | Client-side router | Maps `/`, `/cars/:id`, `/credits` and `*` to pages. Stores filter state in the query string (`useSearchParams`). `<Link>` navigation without reloads. `<Form action="/">` for the header search. |

### Build/dev (`devDependencies`, never shipped)

| Package | What it is | Problem it solves here |
|---|---|---|
| `vite` | Dev server + production bundler (Rolldown/esbuild-based) | Instant dev server with hot module replacement. `vite build` produces minified, hashed assets in `dist/` and copies `public/` verbatim (including the 2,300 data files). |
| `@vitejs/plugin-react` | Vite plugin | Compiles JSX/TSX and enables React Fast Refresh (edits apply without losing component state). |
| `tailwindcss` + `@tailwindcss/vite` | Utility-first CSS engine (v4) | Generates only the CSS classes actually used in `src/`. The design tokens live in CSS (`@theme`), with no JS config file. |
| `typescript` | Type checker | `tsc -b` in `npm run build` fails the build on type errors, e.g. forgetting that `specs` can be `null`. |
| `@types/react`, `@types/react-dom`, `@types/node` | Type definitions | Types for React APIs and for Node APIs used in `vite.config.ts`. |
| `oxlint` | Rust-based linter | Enforces the **Rules of Hooks** (`react/rules-of-hooks: error`). Runs in milliseconds. |

### External services (not packages)

| Service | Used by | Purpose |
|---|---|---|
| FuelEconomy.gov bulk CSV | Pipeline | EPA specs for US models (public domain) |
| MediaWiki Action API + Wikipedia REST API | Pipeline | Article resolution, generations, photos, aliases, brand categories |
| Wikimedia thumbnail CDN (`thumb.wikimedia.org`) | Browser | Serves the photos (hotlinked) |
| Sketchfab Data API v3 | Pipeline | Searching for 3D models |
| Sketchfab embed viewer | Browser (`<iframe>`) | Renders and rotates 3D models |
| Google Fonts | Browser | Archivo font |

### Node built-ins used by the pipeline

| Module | Use |
|---|---|
| global `fetch` | All HTTP requests (built into Node 18+, so no `axios`/`node-fetch`) |
| `node:crypto` (`createHash`) | SHA-1 of a URL becomes its cache filename |
| `node:fs/promises` | Reading and writing the cache and the output JSON |
| `node:assert` | Inline self-checks (CSV parser, `stripMake`, unique ids) that abort the run on regressions |

## Why these and not alternatives

| Need | Chosen | Not chosen | Reason |
|---|---|---|---|
| Bundler | Vite | webpack, Create React App (deprecated) | Near-zero config, much faster dev startup, and it's React's recommended path. |
| Routing | React Router | TanStack Router, Next.js | Mature, small, and its `useSearchParams` makes "URL as state" trivial. No server needed. |
| Data fetching | Custom 20-line `useJson` | TanStack Query, SWR | Data is static and read-only: no refetching, mutations, or invalidation. A promise `Map` covers the need without a dependency. |
| State management | URL + local `useState` | Redux, Zustand, Context | The only shared state is "which filters are active", and the URL already holds it. |
| Styling | Tailwind v4 | CSS Modules, styled-components | No runtime cost, co-located styles, and design tokens as CSS variables. |
| 3D | Sketchfab iframe | three.js / react-three-fiber with downloaded models | No model hosting, no WebGL code, licensing and attribution handled by Sketchfab, and the heavy code loads only on car pages. |
| Lint | oxlint | ESLint | Same React rules, roughly 50–100× faster, one config file. |
| CSV parsing (pipeline) | One regex | `csv-parse`, `papaparse` | The EPA file has quoted fields but no embedded newlines (verified). One regex plus an `assert` is enough. |

## Framework "magic" vs. custom control

These are the places where a library does work implicitly, and where the code is explicit.

### Handled by libraries (behind the scenes)

| Mechanism | Who does it | What actually happens |
|---|---|---|
| JSX → JavaScript | `@vitejs/plugin-react` | `<Card car={c} />` compiles to `jsx(Card, { car: c })` calls. You never see this output. |
| Re-rendering | React | Calling `setState` or `setSearchParams` schedules a re-render of that component subtree. React diffs the virtual DOM and patches only the changed DOM nodes. |
| Effect cleanup | React | The function returned from `useEffect` runs before the next effect or on unmount. `useJson` uses it to ignore stale responses (`live = false`). |
| StrictMode double-invocation | React (dev only) | Effects run twice in development to expose missing cleanups. This is why `useJson` deduplicates fetches through the promise cache. |
| URL matching and nesting | React Router | `createBrowserRouter` picks the route and renders `Layout` with the matched child injected at `<Outlet/>`. |
| History integration | React Router | `<Link>` and `setSearchParams` push entries onto `window.history` without reloading. `{ replace: true }` (used for typing in search) overwrites the current entry instead, so the back button doesn't step through every keystroke. |
| `<Form action="/">` | React Router | Intercepts the native form submit, serializes the inputs to `?q=…`, and performs a client-side navigation. |
| CSS generation | Tailwind | Scans source files for class names like `border-ink` or `aspect-3/2` and emits only those rules. `@theme { --color-ink: … }` creates the `*-ink` utilities automatically. |
| Asset hashing and `public/` copy | Vite | Bundles land in `dist/assets/index-<hash>.js` (long-term cacheable). Files in `public/` are copied unchanged, so `/data/index.json` keeps its URL. |
| Image lazy loading | Browser | `loading="lazy"` defers off-screen card images. `srcSet` + `sizes` let the browser pick the 500px or 960px thumbnail. |
| SPA fallback | GitHub Pages + workflow | Unknown paths are served `404.html`, a copy of `index.html`, so the router can take over (see doc 06). |
| Sub-path prefixing | Vite `base` | `base: '/just-cars/'` rewrites asset URLs in the build. `import.meta.env.BASE_URL` exposes the same value to app code (router `basename`, `dataUrl()`). |

### Controlled by custom code (explicit)

| Concern | Location | Notes |
|---|---|---|
| Data fetching and caching in the browser | `fetchJson` / `useJson` in `src/data.ts` | Promise memoization per URL. Errors (including HTML returned in place of JSON) become `error: true`. |
| Search, filtering, ranking | `filterCars`, `soldAs`, `norm` in `src/data.ts` | Pure functions over `URLSearchParams`. No library involved. |
| All data acquisition | `scripts/build-data.mjs` | HTTP caching, throttling, retries with backoff, rate-limit circuit breaker, matching heuristics, output shape. |
| Routing table | `src/main.tsx` | Explicit route objects, plus a `*` catch-all for 404. |
| Page titles | `useEffect(() => { document.title = … })` in each page | No head-management library. |
| Layout-shift prevention | `min-h-svh` wrapper in `Layout`, eager first-row images | Tuned against Lighthouse. |
