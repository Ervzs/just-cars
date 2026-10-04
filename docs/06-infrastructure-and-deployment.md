# 06 · Infrastructure and Deployment

## Runtime model

**Static hosting on GitHub Pages.** After deployment there is no running process belonging to this project. GitHub's CDN answers each request straight from the published `dist/` files, under the project sub-path `https://ervzs.github.io/just-cars/`.

| Property | Consequence |
|---|---|
| No server | Nothing to crash, patch, scale or pay for per request |
| Files are immutable per deploy | A deploy is atomic: the host swaps to the new file set |
| Data is part of the build | Updating data means regenerating it, committing, and redeploying |

## Scripts (the build system)

Defined in `package.json`:

| Command | Runs | Purpose |
|---|---|---|
| `npm run dev` | `vite` | Dev server at `localhost:5173/just-cars/` with hot module replacement. Serves `public/` and transforms `src/` on request. |
| `npm run build` | `tsc -b && vite build` | Type-check every TS project (fails on errors), then bundle into `dist/` |
| `npm run preview` | `vite preview` | Serves `dist/` at `localhost:4173/just-cars/` to test the production build |
| `npm run lint` | `oxlint` | Lint (Rules of Hooks enforced as errors) |
| `npm run data` | `node scripts/build-data.mjs [max] [Makes]` | Regenerate `public/data/`. With arguments, a test run writes to `scripts/.out-test/`. |

### What `vite build` produces

```
dist/
├── index.html                    references /just-cars/assets/... (prefixed via Vite `base`)
├── assets/index-<hash>.js        app bundle (~330 KB raw, ~104 KB gzip)
├── assets/index-<hash>.css       Tailwind output (~18 KB)
├── data/index.json               copied from public/
├── data/cars/*.json              copied from public/ (~2,280 files)
├── favicon.svg, robots.txt
└── 404.html                      added by the deploy workflow (copy of index.html)
```

**Content hashing:** a JS/CSS filename changes only when its content changes. Hosts can therefore cache `assets/*` "forever", while `index.html` is re-fetched to pick up new hashes.

### TypeScript project references

`tsconfig.json` references two configs:
- `tsconfig.app.json`: browser code in `src/` (DOM types, `jsx: react-jsx`, bundler module resolution).
- `tsconfig.node.json`: `vite.config.ts` (Node types).

`tsc -b` ("build mode") checks both and caches results in `node_modules/.tmp/*.tsbuildinfo`. `noEmit: true` is set because Vite, not `tsc`, produces the JavaScript. TypeScript here is purely a checker.

## Environment variables

**None need to be set.**

- The app reads one value Vite injects at build time: `import.meta.env.BASE_URL`. It equals the `base` in `vite.config.ts` (`/just-cars/`), and both the router `basename` and `dataUrl()` derive from it, so the sub-path is defined in exactly one place.
- The pipeline reads only CLI arguments (`process.argv`); its configuration lives in constants at the top of the script (`YEAR_FROM`, `DELAY_MS`, `BRAND_CATEGORIES`).
- The Node version for CI is pinned in the workflow (`node-version: 22`; Vite 8 needs 20.19+).

This is deliberate: no secrets means nothing to configure per environment and nothing to leak.

## SPA fallback routing

The central infrastructure concern of an SPA. The browser asks for `/just-cars/cars/toyota-hilux-eighth-generation`, but no such file exists; only `index.html` does.

Many static hosts solve this with a *rewrite rule*. **GitHub Pages has no rewrite rules.** It does one thing on a miss: it serves the site's `404.html`, without changing the URL. The deploy workflow exploits that:

```yaml
- run: npm run build
- run: cp dist/index.html dist/404.html   # the app itself becomes the "not found" page
```

Any unknown path therefore loads the full app. React Router reads the URL and renders the matching route, or the app's own 404 page for `*`.

**Trade-off:** deep links are answered with HTTP status **404**, even though the page renders correctly. Browsers ignore the status, but crawlers may not index those URLs. The alternatives are hash routing (`/#/cars/...`, uglier URLs) or pre-rendering every page (a larger build). For a showcase site, the 404.html approach is the simplest.

Real files are served first, so `/just-cars/data/index.json` and `/just-cars/assets/*.js` are unaffected. A missing data file such as `/just-cars/data/cars/nope.json` also gets 404 status, which the app turns into its "We don't have that car" page.

### The sub-path (`base`)

A GitHub *project* site is served from `/<repo-name>/`, not the domain root. Three things must agree on that prefix, and all three read it from Vite's `base`:

| Consumer | Mechanism |
|---|---|
| Built asset URLs (`<script>`, CSS, favicon) | Vite rewrites them at build time |
| Router | `createBrowserRouter(routes, { basename: import.meta.env.BASE_URL })`, so `<Link to="/credits">` resolves to `/just-cars/credits` |
| Data fetches | `dataUrl(path)` in `src/data.ts` returns `${BASE_URL}data/${path}` |

Renaming the repo or adding a custom domain needs only one change: the `base` value.

## Containers and CI/CD

| Item | Present | Notes |
|---|---|---|
| Dockerfile / containers | No | No server to containerize. A container would only wrap a static file server. |
| CI/CD pipeline | Yes: `.github/workflows/deploy.yml` | GitHub Actions builds and publishes to GitHub Pages on every push to `main` (or manually via *Run workflow*) |
| Automated tests | No test suite | Correctness checks are the `assert` self-checks in the pipeline, `tsc` in the build, and `oxlint` |
| Scheduled data refresh | No | Data is refreshed manually with `npm run data` and a commit. A cron-based GitHub Action could automate this later. |

**Deployment flow:**

```
git push origin main
   └─► GitHub Actions
         build job:  checkout → setup-node 22 (npm cache) → npm ci → npm run build
                     → cp index.html 404.html → upload-pages-artifact (dist/)
         deploy job: deploy-pages → live at https://ervzs.github.io/just-cars/
```

**Workflow details:**
- **`npm ci`, not `npm install`:** installs exactly what `package-lock.json` pins, and fails if the lockfile and `package.json` disagree. That makes builds reproducible.
- **Permissions:** `pages: write` and `id-token: write` let `deploy-pages` authenticate to Pages with a short-lived OIDC token. No stored deploy key or secret is involved.
- **`concurrency: pages` with `cancel-in-progress: false`:** two quick pushes queue up instead of cancelling a deploy halfway.
- **Two jobs:** the `deploy` job runs only if `build` succeeds. A type error (`tsc -b`) therefore never reaches production.

**One-time setup:** repo **Settings → Pages → Source: GitHub Actions**. Step-by-step instructions are in `deploy.md`.

## Serving traffic and production failure states

| Failure | What the visitor sees | Why |
|---|---|---|
| Unknown route (`/just-cars/foo`) | App 404 page ("We don't have that car") | Pages serves `404.html` (the app), and the `*` route matches |
| Unknown car (`/just-cars/cars/nope`) | Same 404 page | The data file answers 404, `fetchJson` rejects, `error` is set |
| `index.json` fails to load | "Could not load the car list. Refresh the page to try again." | `useIndex` error branch |
| Wikimedia photo missing or blocked | Grey placeholder box (card) or "No photo available" (detail) | `<img>` only rendered when the URL exists. A broken URL shows the browser's broken-image state on the grey background. |
| Sketchfab down | The iframe area shows Sketchfab's own error. The rest of the page is unaffected. | Isolated in a cross-origin iframe |
| Google Fonts unavailable | Falls back to `ui-sans-serif, system-ui` | Font stack in `@theme --font-sans`; `display=swap` keeps text visible meanwhile |
| JavaScript disabled | Blank page | Inherent to a client-rendered SPA. Pre-rendering pages would fix it but needs a different build. |
| Bad deploy | `git revert` the commit and push, or re-run the workflow for an earlier good commit | Each deploy is an immutable artifact built from one commit |
| Build fails (type error, bad lockfile) | Nothing: the previous deploy stays live | The `deploy` job needs a successful `build` |

## Performance profile (Lighthouse, after tuning)

| Page | Performance | Accessibility | Best practices | SEO |
|---|---|---|---|---|
| Home | 87 | 100 | 77 | 100 |
| Car page | 92 | 100 | 77 | 100 |

**Tuning applied:**
- **Eager images on the first row** (`loading="eager"`, everything else lazy), which improves the time to the first large image (LCP).
- **`srcSet` with 500px and 960px thumbnails,** so phones don't download desktop images.
- **`min-h-svh` on the content area and a reserved header line,** which removed a layout shift (CLS) of 1.0 on car pages.
- **`robots.txt` as a real file,** which fixed an SEO audit (otherwise the fallback answered with HTML).

**Known ceilings:**
- **Best practices stays at 77** because of third-party cookies from Sketchfab and Wikimedia.
- **`index.json` is about 1 MB** (about 125 KB gzipped by the host). If the catalog grows by an order of magnitude, split it by make or paginate it.

## Data refresh operations

```sh
npm run data                 # cached responses make reruns ~30 s; new requests are throttled
git add public/data && git commit -m "Refresh car data" && git push
```

- **Rate limits:** if the summary reports "Sketchfab skipped … (rate limited)", rerun an hour later. Only the missing 3D lookups are fetched again.
- **Cache reset:** delete `scripts/.cache/` to force fresh data from every source. A full uncached run takes roughly an hour.
- **Safe experimentation:** `npm run data -- 40 Toyota,Isuzu` writes to `scripts/.out-test/` and cannot affect what's deployed.
