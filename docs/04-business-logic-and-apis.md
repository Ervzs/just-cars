# 04 · Business Logic and APIs

The domain logic lives in two places:

| Location | Runs | Logic |
|---|---|---|
| `scripts/build-data.mjs` | Build time, Node | Entity resolution: which cars exist, how they're named, grouped and illustrated |
| `src/data.ts` | Visit time, browser | Querying: search, filter, rank, sort |

React components (`src/pages/*`) are presentation. They read state, call `filterCars`, and render.

## 1. Pipeline domain logic (`scripts/build-data.mjs`)

### Entity resolution: EPA model → Wikipedia article

The hardest problem in the project is deciding that EPA's "296 GTB Spider", Wikipedia's "Ferrari 296" and Sketchfab's "Ferrari 296 GTB 2022" are the same car.

```js
async function findWiki(make, model) {
  const direct = await summary(`${make} ${model}`)   // Wikipedia follows redirects:
  if (okPage(direct)) return direct                 // "Ferrari 296 GTB" -> "Ferrari 296"
  const hits = (await api({ action: 'query', list: 'search', srlimit: 5, srsearch: `${make} ${model} car` }))?.query?.search ?? []
  const first = norm(model.split(/[\s/]+/)[0])
  for (const h of hits.filter(h => norm(h.title).startsWith(norm(make)) && norm(h.title).includes(first))) {
    const p = await summary(h.title)
    if (okPage(p)) return p
  }
  return null
}
```

**How it works:**
1. **Exact title first.** Wikipedia's redirect graph is a high-quality, human-curated alias map, so trying it first is both cheapest and most accurate.
2. **Search fallback, with guard rails.** A search hit must start with the make *and* contain the model's first word. Without the second rule, "Tonale" resolves to "Stelvio" because both appear in similar searches.

### Generations from document structure

```js
// "Sixth generation (A00/LA, A10; 2012)"  or  "XV70 (2017–2024)"
const paren = line.match(/\(([^)]*)\)/)?.[1]
const y = paren?.match(/(\d{4})(?:\s*[–-]\s*(\d{4}|present))?/)
const isGen = /generation/i.test(line) || /^(?!\d{4}\b)[A-Z0-9-]*\d[\w/-]*\s*\(/.test(line)
```

The pipeline treats Wikipedia's **section headings as semi-structured data**. Wikidata, the structured alternative, was tested and lacked generation data, and it was missing even the Hilux.

An end year missing from a heading is inferred as the next generation's start minus 1. EPA model years are then assigned to generations by range. This can be one year off at boundaries, because production years aren't model years; the code marks that with a `ponytail:` comment.

### Distributing assets across generations

```js
// A 3D model naming a year goes to that year's generation; one without a year only to the newest.
const sketchfab = !g ? models[0] ?? null
  : models.find(m => yearOf(m) >= g.start && yearOf(m) <= g.end)
    ?? (gi === slots.length - 1 ? models.find(m => !yearOf(m)) ?? null : null)
```

This rule prevents a modern 3D model from being reused on every historic generation.

### Resilience: throttle, retry, circuit breaker

| Mechanism | Implementation | Purpose |
|---|---|---|
| Throttle | `await sleep(DELAY_MS)` (250 ms) before every network request; requests are sequential | Polite to free APIs; avoids bans |
| Retry with exponential backoff | Up to 5 attempts, waiting 4, 8, 16, then 32 s, or longer if `Retry-After` says so | Rides out transient 5xx and 429 responses |
| Fail fast on client errors | Non-429 4xx throws immediately | Retrying a bad request never helps |
| Circuit breaker (Sketchfab) | After one exhausted retry chain, `sketchfabSkipped` turns on cache-only mode for the rest of the run | Sketchfab has an hourly search quota. One failure shouldn't stall or abort a 50-minute run, and the next run fills the gaps. |
| Isolated test output | Limited runs write to `scripts/.out-test/` | A test can never overwrite the published catalog |

## 2. Browser query logic (`src/data.ts`)

### Search normalization

```ts
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
const nameMatch = (c: CarSummary, q: string) => norm(`${c.make}${c.model}`).includes(q)
```

Normalizing both sides to lowercase alphanumerics makes "mazda6", "Mazda 6" and "MAZDA-6" identical. It's simpler and more predictable than fuzzy matching, which would add a library and produce surprising results for short model names like "6" or "M".

### Filter, rank, sort

```ts
export function filterCars(cars: CarSummary[], p: URLSearchParams) {
  const q = norm(p.get('q') ?? '')
  ...
  const out = cars.filter(c =>
    (!q || nameMatch(c, q) || soldAs(c, q) !== null) &&
    (!make || c.make === make) && (!cls || c.vehicleClass === cls) && (!fuel || c.fuelType === fuel) &&
    (!only3d || c.has3d) &&
    (!(p.has('from') || p.has('to')) || c.years.some(y => y >= from && y <= to)))
  if (p.get('sort') === 'new') return out.sort((a, b) => (b.years.at(-1) ?? 0) - (a.years.at(-1) ?? 0))
  return q ? out.sort((a, b) => Number(!nameMatch(a, q)) - Number(!nameMatch(b, q))) : out
}
```

**Design points:**
- **Input is `URLSearchParams`.** The URL is the single source of truth, so the same function serves the grid, prev/next, and any future shareable view.
- **Relevance tiers.** Cars matching by their own name come before cars matching only through an alias (the 4Runner sold as "Hilux Surf"). `Array.prototype.sort` is stable, so the alphabetical order inside each tier is preserved.
- **Nullable fields.** A car with no `vehicleClass` (non-US models) is simply excluded when a class filter is active, and included otherwise.
- **`soldAs()`** is reused by the card UI to explain why a result appears ("Sold as Hilux Surf").

## 3. Routing (the app's "controllers")

```tsx
const router = createBrowserRouter([{
  element: <Layout />,
  children: [
    { path: '/', element: <HomePage /> },
    { path: '/cars/:id', element: <CarPage /> },
    { path: '/credits', element: <CreditsPage /> },
    { path: '*', element: <NotFoundPage /> },
  ],
}])
```

| Route | Reads | Writes | Role |
|---|---|---|---|
| `/` | `index.json`, query string | Query string (`setSearchParams`) | Browse, filter, paginate (24 per page) |
| `/cars/:id` | `cars/{id}.json`, `index.json`, query string | — | Detail, prev/next in filtered order, sibling generations |
| `/credits` | — | — | Attribution |
| `*` | — | — | 404 view |
| Header `<Form action="/">` (non-home pages) | — | Navigates to `/?q=…` | Quick search |

**Query-string schema** (the app's public "API"):

| Param | Example | Meaning |
|---|---|---|
| `q` | `hilux` | Search text (normalized) |
| `make`, `class`, `fuel` | `Toyota` | Exact-match filters |
| `from`, `to` | `2010` | Year range overlap |
| `3d` | `1` | Only cars with a 3D model |
| `sort` | `new` | Newest first (default: alphabetical, or best match when searching) |
| `page` | `3` | Pagination, 1-based |

## 4. Interface design

### Protocol

**Plain HTTP GET of static JSON files.** There is no REST server, GraphQL or RPC. The "API" is the file layout:

```
GET /just-cars/data/index.json            → CarSummary[]
GET /just-cars/data/cars/{id}.json        → CarDetail
```

This is effectively a read-only REST resource model (a collection plus items, addressed by URL) with the server replaced by a CDN.

### Serialization

- **Pipeline:** `JSON.stringify(entry, null, 2)` for detail files, which are pretty-printed for readable git diffs. `index.json` is written compact, because it's the hot path.
- **App:** `Response.json()`. The TypeScript types in `data.ts` are a **compile-time contract only**; nothing validates the JSON at runtime. That's acceptable because the producer (the pipeline) is in the same repository and the data is regenerated with the code.

### External APIs consumed (build time)

| API | Style | Endpoints used |
|---|---|---|
| FuelEconomy.gov | Static file | `/feg/epadata/vehicles.csv` |
| Wikipedia REST | REST/JSON | `/api/rest_v1/page/summary/{title}` |
| MediaWiki Action API | RPC-style (`?action=…`) | `query&list=search`, `query&list=categorymembers`, `parse&prop=sections`, `parse&prop=images&section=N`, `query&prop=imageinfo`, `query&prop=redirects` |
| Sketchfab Data API v3 | REST/JSON | `/v3/search?type=models&downloadable=true&q=…` |

## 5. Error handling strategy

| Layer | Failure | Handling |
|---|---|---|
| Pipeline HTTP | 404 | Cached as `null`, treated as "no data" |
| Pipeline HTTP | 429 / 5xx / network error | Retry with backoff, then throw. Sketchfab failures trip the circuit breaker instead of aborting. |
| Pipeline data | Missing article, photo or 3D model | Field is `null`. The entry is still written. |
| Pipeline integrity | Parser regression, duplicate ids | `assert` aborts **before** any file is written |
| Browser fetch | Non-2xx status | Promise rejects, `error: true` |
| Browser fetch | Missing car file (GitHub Pages answers 404; the local preview server answers with HTML) | Non-2xx rejects, or `r.json()` throws on HTML. Either way `error: true` and `NotFoundPage` renders. |
| Browser index load | `index.json` fails | Grid shows "Could not load the car list. Refresh the page to try again." |
| Browser rendering | Missing optional data | Conditional rendering: no spec panel without `specs`, no Years row without years, a placeholder when there's no photo |
| Race conditions | Fast navigation between cars | `useJson` ignores responses for a URL that's no longer current (`state.url === url` check plus the `live` flag) |

There is no error boundary. Every data-dependent branch renders a defined fallback instead of throwing.
