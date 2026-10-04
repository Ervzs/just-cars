# 03 · Data Models and Storage

## Storage type

There is **no database**. The data layer is a **static JSON document store** on the host's file system, served over HTTP:

| File | Contents | Size | Loaded by |
|---|---|---|---|
| `public/data/index.json` | `CarSummary[]`: every car generation, summary fields only | ~1 MB (~2,280 entries) | Grid, header, prev/next, "Other generations" |
| `public/data/cars/{id}.json` | One `CarDetail` per car generation | ~2,280 files, ~10 MB total | Car page only |

This split is an **index/detail (list/document) pattern**. The grid needs nine small fields per car; descriptions and specs would roughly triple the payload, so they live in per-car files fetched on demand.

**Why not a database?**
- The data is read-only at runtime and changes only when the pipeline reruns.
- A database would need a server or a paid hosted service, plus an API layer and credentials.
- A client-side SQL engine (SQLite/WASM) would add about 1 MB of engine to answer queries that `Array.filter` handles in under a millisecond for about 2,300 rows.

## Entities

### `CarSummary` (the index row)

Defined in `src/data.ts`. Produced by the pipeline's final `entries.map(...)`.

```ts
export type CarSummary = {
  id: string              // URL slug, primary key: "toyota-hilux-eighth-generation"
  make: string            // "Toyota"
  model: string           // "Hilux" (make prefix stripped: "Mazda6" -> "6")
  generation: string | null // "Eighth generation" | "XV70" | null (no generation headings)
  aka: string[]           // other market names: ["Alterra"] on the Isuzu MU-X
  years: number[]         // production/model years, ascending
  vehicleClass: string | null // EPA class, null for non-US models
  fuelType: string | null     // EPA fuel type, null for non-US models
  engine: string | null       // "2.8L 4-cyl", null for EVs and non-US models
  thumbnail: string | null    // 960px Wikimedia thumbnail URL
  has3d: boolean
}
```

### `CarDetail` (the per-car document)

`CarDetail = CarSummary & { … }`. The intersection type guarantees the detail file is a superset of the index row.

```ts
representativeYear: number | null  // EPA year the specs come from
variants: string[]                  // merged EPA model names: ["296 GTB", "296 GTS", ...]
specs: { engine, displacementL, cylinders, transmission, drive,
         mpgCity, mpgHighway, mpgCombined, evRangeMiles } | null   // null = never sold in the US
description: string | null          // Wikipedia extract (plain text)
wikipediaUrl: string | null
image: string | null                // 1920px photo URL
sketchfab: { uid, name, author, authorUrl, license } | null
```

### Conceptual model behind the files

The pipeline works with three concepts. Only the last is persisted.

```
EPA group (make + baseModel)  ──many-to-one──►  Article (one Wikipedia page)
                                                     │ one-to-many
                                                     ▼
                                               Generation (section heading)
                                                     │ one-to-one
                                                     ▼
                                               Entry  ──► CarSummary + CarDetail files
```

- **Article:** the unit of identity. EPA variants that resolve to the same page are merged, which is what deduplicates photos.
- **Generation:** the unit of display. Each one has its own photo, years, specs and 3D model.

### Relationships and "indexes"

JSON files have no foreign keys. Relationships are recomputed in the browser:

| Relationship | How it is resolved | Cost |
|---|---|---|
| Entry → detail document | `id` → URL `/data/cars/{id}.json` (the filename *is* the primary-key index) | One HTTP GET |
| Generation siblings ("Other generations") | `cars.filter(c => c.make === car.make && c.model === car.model)` on the index | Linear scan, about 2,300 rows |
| Prev/next | Position of `id` in `filterCars(index, params)` | Linear scan |
| Search | `norm()` substring match over make + model + aliases | Linear scan |

At this scale, a linear scan takes well under a millisecond. Building lookup maps or a search index would add code without a measurable gain.

### Identity: the `id` slug

```js
const slug = s => s.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
id: slug(g ? `${title} ${g.label}` : title)   // "Toyota Hilux" + "Eighth generation"
```

- **Deterministic:** the same article and generation always produce the same id, so URLs stay stable across data rebuilds.
- **Unique:** the pipeline asserts uniqueness (`assert.equal(new Set(ids).size, entries.length)`), and suffixes `-2` on the rare collision.
- `NFKD` normalization decomposes accented letters, so "Protegé" becomes "protege".

## Persistence lifecycle

```
query (external APIs) → validate/filter → transform/merge → write JSON → git commit → deploy
```

### 1. Query

The pipeline queries three sources through one function, `get(url)`:

```js
async function get(url) {
  const hit = await cached(url)          // 1. cache-aside: return the stored response if present
  if (hit) return hit.body
  for (let attempt = 1; ; attempt++) {   // 2. otherwise fetch, throttled, with retries
    await sleep(DELAY_MS)
    ...
    if (res.ok || res.status === 404) {  // 3. store successes and 404s (a 404 is a valid answer)
      await writeFile(cacheFile(url), JSON.stringify({ url, body }))
      return body
    }
    ...
  }
}
```

**Cache-aside pattern:** the caller checks the cache first. On a miss it fetches from the source and populates the cache. The cache key is `sha1(url)`, so any change to a URL (a parameter, say) naturally creates a new entry and never serves stale data for a different query.

### 2. Validate

The data comes from crowd-sourced and third-party sources, so "validation" is heuristic filtering rather than schema enforcement:

| Check | Code | Rejects |
|---|---|---|
| Real article | `okPage(p)` | Disambiguation pages, "may/can refer to" set-index pages, empty extracts |
| Search hit relevance | `norm(h.title).includes(firstWordOfModel)` | e.g. "Alfa Romeo Tonale" landing on the Stelvio page |
| Passenger car | `unwanted` regex + truck-without-pickup check | Buses, engines, platforms, concepts, companies |
| Era | Generation end ≥ 2000, or extract years ≥ 2000 | Classic-only models |
| 3D relevance | Whole-word make **and** model in the Sketchfab model name | "BMW M" matching any name containing "m" |
| Photo relevance | File-name filter (no `rear`, `interior`, `logo`, …) | Rear shots and logos as card photos |
| Integrity | `assert` on parser output, `stripMake`, unique ids | Aborts the run before writing corrupt output |

### 3. Mutate and transform

- **Merge:** EPA groups sharing an article are concatenated (`rows`, `variants`).
- **Split:** articles are split into generations. EPA rows are assigned with `genFor(year)`.
- **Derive:**
  - `specs` comes from the latest year's base variant (smallest displacement).
  - `years` comes from the generation range.
  - Image URLs are rewritten to standard Wikimedia widths.

### 4. Write

The write is a full replacement, not an incremental update: `rm -r public/data/cars/`, write every file, then `index.json`. A full rewrite means deleted or renamed cars can't leave orphan files behind.

### 5. Migrations

There are no schema migrations. When the shape changes (e.g. adding `aka` or `generation`), the script is updated and the whole dataset is regenerated from cache in about 30 seconds. The app code is updated in the same change.

During the transition, the UI reads new optional fields defensively (`c.aka?.join(...)`, `car.variants?.length`) so an older dataset doesn't crash it.

## Browser-side state stores

| State | Store | Lifetime |
|---|---|---|
| Filters, search, sort, page | URL query string (`?q=hilux&make=Toyota&page=2`) | Survives reload, back/forward, sharing |
| Fetched JSON | Module-level `Map<url, Promise>` in `data.ts` | Until the tab is reloaded |
| Mobile "filters open" toggle | `useState` in `HomePage` | Component lifetime |

There is no `localStorage`, cookie or server session.

## Terminology

| Term | Meaning here |
|---|---|
| **baseModel** | EPA's own grouping column (e.g. "F150"). The starting key for US models. |
| **Article** | A Wikipedia page. The identity unit after merging. |
| **Generation** | A redesign era parsed from a section heading, e.g. "Sixth generation (2012)" or "XV70 (2017–2024)". |
| **Variant** | An EPA model name merged into an article ("296 GTS"). |
| **Alias / aka** | Another market name from a Wikipedia redirect ("Alterra"). |
| **Representative year** | The EPA model year whose specs are displayed. |
| **Cache-aside** | Check the cache, fetch on miss, store the result. |
| **Index/detail split** | Small list file + per-item files fetched on demand. |
