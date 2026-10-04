import { useEffect, useState } from 'react'

export type CarSummary = {
  id: string
  make: string
  model: string
  generation: string | null
  aka: string[] // other market names, e.g. Alterra for the Isuzu MU-X
  years: number[]
  vehicleClass: string | null
  fuelType: string | null
  engine: string | null
  thumbnail: string | null
  has3d: boolean
}

export type CarDetail = CarSummary & {
  representativeYear: number | null
  variants: string[]
  // null when the generation was never sold in the US (no EPA data)
  specs: {
    engine: string | null
    displacementL: number | null
    cylinders: number | null
    transmission: string | null
    drive: string | null
    mpgCity: number | null
    mpgHighway: number | null
    mpgCombined: number | null
    evRangeMiles: number | null
  } | null
  description: string | null
  wikipediaUrl: string | null
  image: string | null
  sketchfab: { uid: string; name: string; author: string; authorUrl: string; license: string } | null
}

const cache = new Map<string, Promise<unknown>>()
const fetchJson = (url: string) => {
  if (!cache.has(url)) cache.set(url, fetch(url).then(r => (r.ok ? r.json() : Promise.reject(r.status))))
  return cache.get(url)!
}

// Fetches JSON once per URL. A missing file (or the SPA's HTML fallback) becomes `error`.
export function useJson<T>(url: string) {
  const [state, setState] = useState<{ url: string; data?: T; error?: boolean }>({ url })
  useEffect(() => {
    let live = true
    fetchJson(url).then(
      data => live && setState({ url, data: data as T }),
      () => live && setState({ url, error: true }),
    )
    return () => { live = false }
  }, [url])
  return state.url === url ? state : { url }
}

// Data URLs follow Vite's `base`, so they work under the GitHub Pages sub-path.
export const dataUrl = (path: string) => `${import.meta.env.BASE_URL}data/${path}`
export const useIndex = () => useJson<CarSummary[]>(dataUrl('index.json'))

export const yearRange = (years: number[]) =>
  years.length > 1 ? `${years[0]}–${years.at(-1)}` : years.length ? `${years[0]}` : ''

// Spacing and punctuation don't matter: "mazda6", "Mazda 6" and "MAZDA-6" all match.
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
const nameMatch = (c: CarSummary, q: string) => norm(`${c.make}${c.model}`).includes(q)

// The other-market name a car matched by, when its own name didn't ("Hilux Surf" for the 4Runner).
export function soldAs(c: CarSummary, query: string | null) {
  const q = norm(query ?? '')
  return q && !nameMatch(c, q) ? c.aka?.find(a => norm(`${c.make}${a}`).includes(q) || norm(a).includes(q)) ?? null : null
}

// One filter used by the grid and by prev/next on the car page, driven by the URL query.
export function filterCars(cars: CarSummary[], p: URLSearchParams) {
  const q = norm(p.get('q') ?? '')
  const make = p.get('make'), cls = p.get('class'), fuel = p.get('fuel'), only3d = p.get('3d') === '1'
  const from = Number(p.get('from')) || 0, to = Number(p.get('to')) || 9999
  const out = cars.filter(c =>
    (!q || nameMatch(c, q) || soldAs(c, q) !== null) &&
    (!make || c.make === make) &&
    (!cls || c.vehicleClass === cls) &&
    (!fuel || c.fuelType === fuel) &&
    (!only3d || c.has3d) &&
    (!(p.has('from') || p.has('to')) || c.years.some(y => y >= from && y <= to)))
  if (p.get('sort') === 'new') return out.sort((a, b) => (b.years.at(-1) ?? 0) - (a.years.at(-1) ?? 0))
  // With a search, cars matching by their own name come before other-market-name matches (stable sort).
  return q ? out.sort((a, b) => Number(!nameMatch(a, q)) - Number(!nameMatch(b, q))) : out
}
