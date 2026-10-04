// Builds public/data/index.json and public/data/cars/{id}.json.
// One catalog entry = one Wikipedia article + one generation. Sources:
//   - FuelEconomy.gov bulk CSV: US models with EPA specs (variants merged per article)
//   - Wikipedia brand categories: Asian-market models (no EPA specs)
//   - Wikipedia section headings + images: generations and their photos
//   - Sketchfab: 3D models
// Run: npm run data [-- maxArticles [Make,Make]]
import { createHash } from 'node:crypto'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import assert from 'node:assert'

// ---- config ----
const YEAR_FROM = 2000
const THIS_YEAR = new Date().getFullYear()
const MAX_ARTICLES = Number(process.argv[2] || Infinity)
const MAKES = process.argv[3]?.split(',') ?? null // limit to these makes/brands, e.g. Ferrari,Isuzu
const DELAY_MS = 250
const UA = 'just-cars-build/0.2 (https://github.com/Ervzs/just-cars; ejpejo26@gmail.com)'
// Asian brands whose Wikipedia category adds models never sold in the US (Hilux, Alterra, ...).
const BRAND_CATEGORIES = {
  Toyota: 'Toyota vehicles', Lexus: 'Lexus vehicles', Honda: 'Honda vehicles', Nissan: 'Nissan vehicles',
  Mitsubishi: 'Mitsubishi Motors vehicles', Mazda: 'Mazda vehicles', Subaru: 'Subaru vehicles',
  Suzuki: 'Suzuki vehicles', Isuzu: 'Isuzu vehicles', Daihatsu: 'Daihatsu vehicles', Hyundai: 'Hyundai vehicles',
  Kia: 'Kia vehicles', BYD: 'BYD vehicles', Geely: 'Geely vehicles', Chery: 'Chery vehicles', Haval: 'Haval vehicles',
  MG: 'MG vehicles', Changan: 'Changan Automobile vehicles', Proton: 'Proton vehicles', Perodua: 'Perodua vehicles',
  Tata: 'Tata Motors vehicles', Mahindra: 'Mahindra vehicles', VinFast: 'VinFast vehicles',
}

const CACHE = new URL('./.cache/', import.meta.url)
// Limited test runs (max or make filter) write elsewhere so they never replace the real catalog.
const OUT = new URL(MAKES || MAX_ARTICLES < Infinity ? './.out-test/' : '../public/data/', import.meta.url)
const sleep = ms => new Promise(r => setTimeout(r, ms))

// Cached, throttled, retrying GET. Returns text, or null on 404.
const cacheFile = url => new URL(createHash('sha1').update(url).digest('hex'), CACHE)
const cached = async url => { try { return JSON.parse(await readFile(cacheFile(url), 'utf8')) } catch { return null } }
async function get(url) {
  const hit = await cached(url)
  if (hit) return hit.body
  for (let attempt = 1; ; attempt++) {
    await sleep(DELAY_MS)
    let wait = 2000 * 2 ** attempt // 4s, 8s, 16s, 32s
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: url.endsWith('.csv') ? '*/*' : 'application/json' } })
      if (res.ok || res.status === 404) {
        const body = res.ok ? await res.text() : null
        await writeFile(cacheFile(url), JSON.stringify({ url, body }))
        return body
      }
      if (res.status !== 429 && res.status < 500) throw new Error(`${res.status} ${url}`)
      if (attempt >= 5) throw new Error(`${res.status} after retries: ${url}`)
      wait = Math.max(wait, 1000 * (Number(res.headers.get('retry-after')) || 0))
    } catch (e) {
      if (attempt >= 5 || /^\d{3} /.test(e.message)) throw e
    }
    await sleep(wait)
  }
}
const getJson = async url => JSON.parse((await get(url)) ?? 'null')

const norm = s => s.toLowerCase().replace(/[^a-z0-9]/g, '')
const slug = s => s.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const words = s => ` ${s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `
const num = s => (s === '' || s == null ? null : Number(s))
const span = (a, b) => Array.from({ length: Math.max(0, b - a + 1) }, (_, i) => a + i)
const wantMake = m => !MAKES || MAKES.some(x => norm(x) === norm(m))

// ---- FuelEconomy.gov ----
const parseLine = l => l.match(/("([^"]|"")*"|[^,]*)(,|$)/g).slice(0, -1)
  .map(f => f.replace(/,$/, '').replace(/^"|"$/g, '').replace(/""/g, '"'))
assert.deepEqual(parseLine('a,"b, ""c""",,d'), ['a', 'b, "c"', '', 'd'])

async function loadEpa() {
  const csv = await get('https://www.fueleconomy.gov/feg/epadata/vehicles.csv')
  const [head, ...lines] = csv.trim().split(/\r?\n/)
  const h = parseLine(head)
  const groups = new Map()
  for (const line of lines) {
    const r = Object.fromEntries(parseLine(line).map((v, i) => [h[i], v]))
    if (+r.year < YEAR_FROM || !wantMake(r.make)) continue
    const key = slug(`${r.make} ${r.baseModel}`) // merges case variants like LEAF/Leaf
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(r)
  }
  return [...groups.values()]
}

// Specs from the latest year's base variant (smallest engine, EVs last).
function specsFrom(rows) {
  const latest = Math.max(...rows.map(r => +r.year))
  const r = rows.filter(r => +r.year === latest).sort((a, b) => (num(a.displ) ?? 99) - (num(b.displ) ?? 99))[0]
  const displ = num(r.displ), cyl = num(r.cylinders), range = num(r.range)
  return {
    representativeYear: latest,
    vehicleClass: r.VClass || null,
    fuelType: r.fuelType || null,
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
  }
}

// ---- Wikipedia ----
const WIKI = 'https://en.wikipedia.org'
const api = params => getJson(`${WIKI}/w/api.php?format=json&${new URLSearchParams(params)}`)
const summary = title => getJson(`${WIKI}/api/rest_v1/page/summary/${encodeURIComponent(title.replaceAll(' ', '_'))}`)
const okPage = p => p && p.type !== 'disambiguation' && p.extract && !/\b(may|can) refer to\b/.test(p.extract)

async function findWiki(make, model) {
  const direct = await summary(`${make} ${model}`) // follows redirects, e.g. "Ferrari 296 GTB" -> "Ferrari 296"
  if (okPage(direct)) return direct
  const hits = (await api({ action: 'query', list: 'search', srlimit: 5, srsearch: `${make} ${model} car` }))?.query?.search ?? []
  // Search hits must mention the model's first word, so "Tonale" never lands on "Stelvio".
  const first = norm(model.split(/[\s/]+/)[0])
  for (const h of hits.filter(h => norm(h.title).startsWith(norm(make)) && norm(h.title).includes(first))) {
    const p = await summary(h.title)
    if (okPage(p)) return p
  }
  return null
}

// Generations from section headings like "Sixth generation (A00/LA, A10; 2012)" or "XV70 (2017–2024)".
async function generations(title) {
  const secs = (await api({ action: 'parse', prop: 'sections', redirects: 1, page: title }))?.parse?.sections ?? []
  const gens = []
  for (const s of secs) {
    const line = s.line.replace(/<[^>]+>/g, '')
    const paren = line.match(/\(([^)]*)\)/)?.[1]
    const y = paren?.match(/(\d{4})(?:\s*[–-]\s*(\d{4}|present))?/)
    const isGen = /generation/i.test(line) || /^(?!\d{4}\b)[A-Z0-9-]*\d[\w/-]*\s*\(/.test(line)
    if (s.toclevel > 2 || !y || !isGen) continue
    gens.push({ label: line.replace(/\s*\(.*$/, ''), section: s.index, start: +y[1], end: y[2] ? (y[2] === 'present' ? THIS_YEAR : +y[2]) : null })
  }
  gens.sort((a, b) => a.start - b.start)
  gens.forEach((g, i) => { g.end ??= gens.slice(i + 1).find(n => n.start > g.start)?.start - 1 || THIS_YEAR })
  return gens.filter(g => g.end >= YEAR_FROM)
}

// First photo-like image in a section (skips rear/interior shots, logos, diagrams).
async function sectionImage(title, section) {
  const imgs = (await api({ action: 'parse', prop: 'images', redirects: 1, page: title, section }))?.parse?.images ?? []
  return imgs.find(f => /\.(jpe?g|png|webp)$/i.test(f) && !/rear|interior|engine|dash|logo|badge|emblem|map|diagram|icon/i.test(f)) ?? null
}

// Wikimedia serves only standard thumbnail widths; upload.wikimedia.org rate-limits hotlinks, thumb host doesn't.
const WIDTHS = [1920, 1280, 960, 500, 330]
const atWidth = (thumb, original, max) => {
  const w = WIDTHS.find(w => w <= max && w <= original)
  const src = thumb.replace(/\?.*$/, '')
  return w && /\/\d+px-/.test(src) ? src.replace(/\/\d+px-/, `/${w}px-`) : src
}
async function fileUrls(files) {
  if (!files.length) return {}
  const pages = (await api({ action: 'query', prop: 'imageinfo', iiprop: 'url|size', iiurlwidth: 960, titles: files.map(f => `File:${f}`).join('|') }))?.query?.pages ?? {}
  const out = {}
  for (const p of Object.values(pages)) {
    const i = p.imageinfo?.[0]
    if (i?.thumburl) out[norm(p.title.replace(/^File:/, ''))] = { thumbnail: atWidth(i.thumburl, i.width, 960), image: atWidth(i.thumburl, i.width, 1920) }
  }
  return out
}

// Other names the car is sold under, from Wikipedia redirects ("Isuzu Alterra" -> Isuzu MU-X).
async function aliases(title, make, model) {
  const pages = (await api({ action: 'query', prop: 'redirects', rdlimit: 'max', rdnamespace: 0, titles: title }))?.query?.pages ?? {}
  const seen = new Set([norm(model)])
  return Object.values(pages).flatMap(p => p.redirects ?? []).map(r => r.title)
    .filter(t => !/[()/]|generation/i.test(t))
    .map(t => (t.toLowerCase().startsWith(make.toLowerCase() + ' ') ? t.slice(make.length + 1) : t))
    .filter(n => !seen.has(norm(n)) && seen.add(norm(n)))
    .slice(0, 8)
}

// Years a car was made, from its extract: "2004–2016", "since 2002", "introduced in 2017".
function extractYears(text) {
  const m = text.match(/(\d{4})\s*(?:–|-|to|until)\s*(\d{4}|present)/) ?? text.match(/(?:since|introduced in|launched in|from) (\d{4})/)
  return m ? span(+m[1], m[2] && m[2] !== 'present' ? +m[2] : THIS_YEAR) : []
}

// ---- Sketchfab ----
// Search quota is limited. Once it refuses, use cached results only; the next run fills the gaps.
let sketchfabSkipped = 0
async function findModels(make, model) {
  const url = `https://api.sketchfab.com/v3/search?type=models&downloadable=true&count=10&q=${encodeURIComponent(`${make} ${model}`)}`
  let res
  if (sketchfabSkipped && !(await cached(url))) return sketchfabSkipped++, []
  try { res = JSON.parse((await get(url)) ?? 'null') } catch (e) {
    console.warn(`\nSketchfab unavailable (${e.message}), using cache only for the rest of this run`)
    return sketchfabSkipped++, []
  }
  // Whole-word match on make and model, so "6" or "GT" don't match any name containing them.
  return (res?.results ?? [])
    .filter(m => words(m.name).includes(words(model)) && words(m.name).includes(words(make)))
    .map(m => ({ uid: m.uid, name: m.name, author: m.user.displayName, authorUrl: m.user.profileUrl, license: m.license?.label ?? 'See Sketchfab' }))
}

// ---- collect articles ----
await mkdir(CACHE, { recursive: true })
const articles = new Map() // Wikipedia title (or epa:slug) -> { make, page, rows, variants }

const epa = (await loadEpa()).sort((a, b) => new Set(b.map(r => r.year)).size - new Set(a.map(r => r.year)).size)
for (const [i, rows] of epa.entries()) {
  const { make, baseModel } = rows.at(-1)
  process.stdout.write(`\rEPA ${i + 1}/${epa.length} ${make} ${baseModel}`.padEnd(70))
  const page = await findWiki(make, baseModel)
  const key = page?.title ?? `epa:${slug(`${make} ${baseModel}`)}`
  if (!articles.has(key)) articles.set(key, { make, page, rows: [], variants: [] })
  const a = articles.get(key)
  a.rows.push(...rows)
  a.variants.push(baseModel)
}

const unwanted = /concept|\bbus\b|motorcycle|scooter|engine|platform|powertrain|tractor|forklift|race car|racing car|company|brand|division|factory|plant\b/i
for (const [brand, category] of Object.entries(BRAND_CATEGORIES).filter(([b]) => wantMake(b))) {
  const members = (await api({ action: 'query', list: 'categorymembers', cmtitle: `Category:${category}`, cmtype: 'page', cmlimit: 500 }))?.query?.categorymembers ?? []
  for (const [i, { title }] of members.entries()) {
    process.stdout.write(`\r${brand} ${i + 1}/${members.length} ${title}`.padEnd(70))
    if (/^List of|generation|disambiguation/i.test(title)) continue
    const page = await summary(title)
    if (!okPage(page) || articles.has(page.title) || /generation/i.test(page.description ?? '')) continue
    const what = `${page.description ?? ''} ${page.extract.split('. ')[0]}`
    if (unwanted.test(what) || (/truck/i.test(what) && !/pickup/i.test(what))) continue
    articles.set(page.title, { make: brand, page, rows: [], variants: [] })
  }
}

// ---- build entries ----
const entries = []
const list = [...articles.values()].slice(0, MAX_ARTICLES)
for (const [i, a] of list.entries()) {
  const { make, page, rows } = a
  const title = page?.title ?? `${make} ${a.variants[0]}`
  process.stdout.write(`\rArticles ${i + 1}/${list.length} ${title}`.padEnd(70))
  const model = title.toLowerCase().startsWith(make.toLowerCase() + ' ') ? title.slice(make.length + 1) : title
  const gens = page ? await generations(page.title) : []
  const epaYears = [...new Set(rows.map(r => +r.year))]
  const articleYears = epaYears.length ? epaYears : page ? extractYears(page.extract) : []

  // Non-EPA articles must have been made since YEAR_FROM (by generations or extract years).
  if (!rows.length && !gens.length && !articleYears.some(y => y >= YEAR_FROM)) continue

  const files = page ? await Promise.all(gens.map(g => sectionImage(page.title, g.section))) : []
  const urls = await fileUrls(files.filter(Boolean))
  const models = await findModels(make, model)
  const aka = page ? await aliases(page.title, make, model) : []

  // ponytail: EPA model years vs Wikipedia production years can be off by one at generation boundaries.
  const genFor = y => gens.filter(g => g.start <= y && y <= g.end).at(-1) ?? gens.filter(g => g.start <= y).at(-1) ?? gens[0]
  const slots = gens.length ? gens : [null]
  slots.forEach((g, gi) => {
    const gRows = g ? rows.filter(r => genFor(+r.year) === g) : rows
    // Generations show their global production years; EPA years only for articles without generations.
    const years = g ? span(g.start, Math.min(g.end, THIS_YEAR)) : articleYears.sort((x, y) => x - y)
    const photo = (g && urls[norm(files[gi] ?? '')]) || (page && page.thumbnail && {
      thumbnail: atWidth(page.thumbnail.source, page.originalimage?.width ?? 0, 960),
      image: atWidth(page.thumbnail.source, page.originalimage?.width ?? 0, 1920),
    }) || { thumbnail: null, image: null }
    // A 3D model naming a year goes to that year's generation; one without a year only to the newest.
    const yearOf = m => +(m.name.match(/\b(19[5-9]\d|20[0-4]\d)\b/)?.[1] ?? 0)
    const sketchfab = !g ? models[0] ?? null
      : models.find(m => yearOf(m) >= g.start && yearOf(m) <= g.end)
        ?? (gi === slots.length - 1 ? models.find(m => !yearOf(m)) ?? null : null)
    const epaPart = gRows.length ? specsFrom(gRows) : { representativeYear: null, vehicleClass: null, fuelType: null, specs: null }
    entries.push({
      id: slug(g ? `${title} ${g.label}` : title),
      make,
      model,
      generation: g?.label ?? null,
      aka,
      years,
      vehicleClass: epaPart.vehicleClass,
      fuelType: epaPart.fuelType,
      engine: epaPart.specs?.engine ?? null,
      thumbnail: photo.thumbnail,
      has3d: !!sketchfab,
      representativeYear: epaPart.representativeYear,
      specs: epaPart.specs,
      variants: [...new Set(gRows.map(r => r.baseModel))],
      description: page?.extract ?? null,
      wikipediaUrl: page?.content_urls?.desktop?.page ?? null,
      image: photo.image,
      sketchfab,
    })
  })
}

// Same title + label twice (rare): keep ids unique.
const seen = new Map()
for (const e of entries) { const n = seen.get(e.id) ?? 0; seen.set(e.id, n + 1); if (n) e.id += `-${n + 1}` }
assert.equal(new Set(entries.map(e => e.id)).size, entries.length, 'duplicate car ids')

// ---- write ----
entries.sort((a, b) => a.make.localeCompare(b.make) || a.model.localeCompare(b.model) || (a.years[0] ?? 0) - (b.years[0] ?? 0))
await rm(new URL('cars/', OUT), { recursive: true, force: true })
await mkdir(new URL('cars/', OUT), { recursive: true })
for (const e of entries) await writeFile(new URL(`cars/${e.id}.json`, OUT), JSON.stringify(e, null, 2))
const index = entries.map(({ id, make, model, generation, aka, years, vehicleClass, fuelType, engine, thumbnail, has3d }) =>
  ({ id, make, model, generation, aka, years, vehicleClass, fuelType, engine, thumbnail, has3d }))
await writeFile(new URL('index.json', OUT), JSON.stringify(index))

const pct = f => `${Math.round((100 * entries.filter(f).length) / entries.length)}%`
const thumbs = entries.map(e => e.thumbnail).filter(Boolean)
console.log(`\n\nEntries: ${entries.length} (from ${list.length} articles)
With description: ${pct(e => e.description)}
With photo: ${pct(e => e.image)}
With 3D: ${pct(e => e.has3d)}
With EPA specs: ${pct(e => e.specs)}
Duplicate thumbnails: ${thumbs.length - new Set(thumbs).size}${sketchfabSkipped ? `
Sketchfab skipped for ${sketchfabSkipped} articles (rate limited). Rerun later to fill them in.` : ''}`)
