import { useEffect, useState } from 'react'

export type CarSummary = {
  id: string
  make: string
  model: string
  years: number[]
  vehicleClass: string
  fuelType: string
  engine: string | null
  thumbnail: string | null
  has3d: boolean
}

export type CarDetail = CarSummary & {
  representativeYear: number
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
  }
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

export const useIndex = () => useJson<CarSummary[]>('/data/index.json')

export const yearRange = (years: number[]) =>
  years.length > 1 ? `${years[0]}–${years.at(-1)}` : `${years[0]}`

// One filter used by the grid and by prev/next on the car page, driven by the URL query.
export function filterCars(cars: CarSummary[], p: URLSearchParams) {
  const q = (p.get('q') ?? '').trim().toLowerCase()
  const make = p.get('make'), cls = p.get('class'), fuel = p.get('fuel'), only3d = p.get('3d') === '1'
  const from = Number(p.get('from')) || 0, to = Number(p.get('to')) || 9999
  const out = cars.filter(c =>
    (!q || `${c.make} ${c.model}`.toLowerCase().includes(q)) &&
    (!make || c.make === make) &&
    (!cls || c.vehicleClass === cls) &&
    (!fuel || c.fuelType === fuel) &&
    (!only3d || c.has3d) &&
    c.years.some(y => y >= from && y <= to))
  return p.get('sort') === 'new' ? out.sort((a, b) => b.years.at(-1)! - a.years.at(-1)!) : out
}
