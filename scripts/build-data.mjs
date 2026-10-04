// Builds public/data/index.json and public/data/cars/{id}.json from
// FuelEconomy.gov (bulk CSV), Wikipedia and Sketchfab. Run: npm run data [-- maxCars]
import { createHash } from 'node:crypto'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import assert from 'node:assert'

// ---- config ----
const YEAR_FROM = 2000
const MAKES = null // e.g. ['Toyota', 'Porsche'] to limit the catalog
const MAX_CARS = Number(process.argv[2] ?? Infinity)
const DELAY_MS = 250
const UA = 'just-cars-build/0.1 (https://github.com/Ervzs; ejpejo26@gmail.com)'

const CACHE = new URL('./.cache/', import.meta.url)
const OUT = new URL('../public/data/', import.meta.url)
const sleep = ms => new Promise(r => setTimeout(r, ms))

// Cached, throttled, retrying GET. Returns text, or null on 404.
async function get(url) {
  const file = new URL(createHash('sha1').update(url).digest('hex'), CACHE)
  try { return JSON.parse(await readFile(file, 'utf8')).body } catch {}
  for (let attempt = 1; ; attempt++) {
    await sleep(DELAY_MS)
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: url.endsWith('.csv') ? '*/*' : 'application/json' } })
      if (res.ok || res.status === 404) {
        const body = res.ok ? await res.text() : null
        await writeFile(file, JSON.stringify({ url, body }))
        return body
      }
      if (res.status !== 429 && res.status < 500) throw new Error(`${res.status} ${url}`)
      if (attempt >= 3) throw new Error(`${res.status} after retries: ${url}`)
    } catch (e) {
      if (attempt >= 3 || /^\d{3} /.test(e.message)) throw e
    }
    await sleep(1000 * 2 ** attempt)
  }
}
const getJson = async url => JSON.parse((await get(url)) ?? 'null')

// ---- CSV ----
const parseLine = l => l.match(/("([^"]|"")*"|[^,]*)(,|$)/g).slice(0, -1)
  .map(f => f.replace(/,$/, '').replace(/^"|"$/g, '').replace(/""/g, '"'))
assert.deepEqual(parseLine('a,"b, ""c""",,d'), ['a', 'b, "c"', '', 'd'])

const norm = s => s.toLowerCase().replace(/[^a-z0-9]/g, '')
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const num = s => (s === '' || s == null ? null : Number(s))

async function loadEpa() {
  const csv = await get('https://www.fueleconomy.gov/feg/epadata/vehicles.csv')
  const [head, ...lines] = csv.trim().split(/\r?\n/)
  const h = parseLine(head)
  const groups = new Map()
  for (const line of lines) {
    const r = Object.fromEntries(parseLine(line).map((v, i) => [h[i], v]))
    if (+r.year < YEAR_FROM || (MAKES && !MAKES.includes(r.make))) continue
    const key = `${r.make}|${r.baseModel}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(r)
  }
  return [...groups.values()]
}

function toCar(rows) {
  const years = [...new Set(rows.map(r => +r.year))].sort((a, b) => a - b)
  const latest = years.at(-1)
  // Base variant of the latest year: smallest engine, EVs (no displ) last.
  const r = rows.filter(r => +r.year === latest)
    .sort((a, b) => (num(a.displ) ?? 99) - (num(b.displ) ?? 99))[0]
  const displ = num(r.displ), cyl = num(r.cylinders), range = num(r.range)
  return {
    id: slug(`${r.make} ${r.baseModel}`),
    make: r.make,
    model: r.baseModel,
    years,
    vehicleClass: r.VClass,
    fuelType: r.fuelType,
    engine: displ ? `${displ.toFixed(1)}L ${cyl}-cyl` : null,
    thumbnail: null,
    has3d: false,
    representativeYear: latest,
    specs: {
      engine: displ ? `${displ.toFixed(1)}L ${cyl}-cyl` : null,
      displacementL: displ,
      cylinders: cyl,
      transmission: r.trany || null,
      drive: r.drive || null,
      mpgCity: num(r.city08),
      mpgHighway: num(r.highway08),
      mpgCombined: num(r.comb08),
      evRangeMiles: range > 0 ? range : null,
    },
    description: null,
    wikipediaUrl: null,
    image: null,
    sketchfab: null,
  }
}

// ---- Wikipedia ----
const WIKI = 'https://en.wikipedia.org'
const summary = title => getJson(`${WIKI}/api/rest_v1/page/summary/${encodeURIComponent(title.replaceAll(' ', '_'))}`)
const okPage = p => p && p.type !== 'disambiguation' && p.extract

async function findWiki(make, model) {
  const direct = await summary(`${make} ${model}`)
  if (okPage(direct)) return direct
  const q = encodeURIComponent(`${make} ${model} car`)
  const hits = (await getJson(`${WIKI}/w/api.php?action=query&list=search&srlimit=5&format=json&srsearch=${q}`))?.query?.search ?? []
  const exact = hits.find(h => norm(h.title) === norm(`${make} ${model}`))
  for (const h of exact ? [exact] : hits.filter(h => norm(h.title).startsWith(norm(make)))) {
    const p = await summary(h.title)
    if (okPage(p)) return p
  }
  return null
}

// Wikimedia only serves certain thumbnail widths; fall back to the original if smaller.
function sized(page, width) {
  const t = page.thumbnail, o = page.originalimage
  if (!t) return null
  if (o?.width >= width && /\/\d+px-/.test(t.source)) return t.source.replace(/\/\d+px-/, `/${width}px-`).replace(/\?.*$/, '')
  return (o?.source ?? t.source).replace(/\?.*$/, '')
}

// ---- Sketchfab ----
async function findModel(make, model) {
  const q = encodeURIComponent(`${make} ${model}`)
  const res = await getJson(`https://api.sketchfab.com/v3/search?type=models&downloadable=true&count=10&q=${q}`)
  // Whole-word match on make and model, so "6" or "GT" don't match any name containing them.
  const words = s => ` ${s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `
  const m = res?.results?.find(m => words(m.name).includes(words(model)) && words(m.name).includes(words(make)))
  return m ? { uid: m.uid, name: m.name, author: m.user.displayName, authorUrl: m.user.profileUrl, license: m.license?.label ?? 'See Sketchfab' } : null
}

// ---- main ----
await mkdir(CACHE, { recursive: true })
const groups = (await loadEpa()).sort((a, b) => new Set(b.map(r => r.year)).size - new Set(a.map(r => r.year)).size)
const cars = groups.slice(0, MAX_CARS).map(toCar)
assert.equal(new Set(cars.map(c => c.id)).size, cars.length, 'duplicate car ids')

for (const [i, car] of cars.entries()) {
  process.stdout.write(`\r${i + 1}/${cars.length} ${car.make} ${car.model}`.padEnd(70))
  const page = await findWiki(car.make, car.model)
  if (page) {
    car.description = page.extract
    car.wikipediaUrl = page.content_urls?.desktop?.page ?? null
    car.thumbnail = sized(page, 960)
    car.image = sized(page, 1920)
  }
  car.sketchfab = await findModel(car.make, car.model)
  car.has3d = !!car.sketchfab
}

cars.sort((a, b) => a.make.localeCompare(b.make) || a.model.localeCompare(b.model))
await rm(new URL('cars/', OUT), { recursive: true, force: true })
await mkdir(new URL('cars/', OUT), { recursive: true })
for (const car of cars) await writeFile(new URL(`cars/${car.id}.json`, OUT), JSON.stringify(car, null, 2))
const index = cars.map(({ id, make, model, years, vehicleClass, fuelType, engine, thumbnail, has3d }) =>
  ({ id, make, model, years, vehicleClass, fuelType, engine, thumbnail, has3d }))
await writeFile(new URL('index.json', OUT), JSON.stringify(index))

const pct = f => `${Math.round((100 * cars.filter(f).length) / cars.length)}%`
console.log(`\n\nCars: ${cars.length}
With description: ${pct(c => c.description)}
With photo: ${pct(c => c.image)}
With 3D: ${pct(c => c.has3d)}
No Wikipedia match: ${cars.filter(c => !c.description).map(c => c.id).join(', ') || 'none'}`)
