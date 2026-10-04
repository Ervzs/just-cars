import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { filterCars, useIndex, yearRange, type CarSummary } from '../data'

const PER_PAGE = 24
const uniq = (xs: string[]) => [...new Set(xs)].sort((a, b) => a.localeCompare(b))
const field = 'flex-col gap-0.5 border-ink px-3.5 py-2.5 text-[13px] text-muted'
// Filter fields stack under the search on mobile, sit in one ruled row from md up.
const extra = 'col-span-2 border-t md:col-span-1 md:border-t-0 md:border-r'
const input = 'w-full bg-transparent py-0.5 text-base font-semibold text-ink'

export default function HomePage() {
  const [params, setParams] = useSearchParams()
  const { data: cars, error } = useIndex()
  const [showFilters, setShowFilters] = useState(false)
  useEffect(() => { document.title = 'Just Cars: browse 1,000+ cars with 3D models' }, [])

  const opts = useMemo(() => {
    if (!cars) return null
    const ys = cars.flatMap(c => c.years)
    const lo = Math.min(...ys), hi = Math.max(...ys)
    return {
      makes: uniq(cars.map(c => c.make)),
      classes: uniq(cars.map(c => c.vehicleClass)),
      fuels: uniq(cars.map(c => c.fuelType)),
      years: Array.from({ length: hi - lo + 1 }, (_, i) => hi - i),
    }
  }, [cars])
  const results = useMemo(() => (cars ? filterCars(cars, params) : []), [cars, params])
  const pages = Math.max(1, Math.ceil(results.length / PER_PAGE))
  const page = Math.min(pages, Math.max(1, Number(params.get('page')) || 1))
  const shown = results.slice((page - 1) * PER_PAGE, page * PER_PAGE)
  const activeFilters = ['make', 'from', 'to', 'class', 'fuel', '3d'].filter(k => params.has(k)).length

  const set = (key: string, value: string) =>
    setParams(p => {
      if (value) p.set(key, value)
      else p.delete(key)
      p.delete('page')
      return p
    }, { replace: key === 'q' })
  const pageHref = (n: number) => {
    const p = new URLSearchParams(params)
    if (n > 1) p.set('page', String(n))
    else p.delete('page')
    return `?${p}`
  }
  const hide = showFilters ? 'flex' : 'hidden md:flex'

  return (
    <main>
      <div className="grid grid-cols-[1fr_auto] border-b border-ink bg-white md:grid-cols-[2.2fr_1fr_1.4fr_1.2fr_1.1fr_auto]">
        <label className={`${field} flex md:border-r`}>
          Search
          <input type="search" className={`${input} placeholder:font-normal placeholder:text-[#8A949C]`} placeholder="Make or model, like Supra"
            value={params.get('q') ?? ''} onChange={e => set('q', e.target.value)} />
        </label>
        <button className="cond flex items-center gap-1.5 bg-ink px-4 font-bold text-white md:hidden" aria-expanded={showFilters}
          onClick={() => setShowFilters(s => !s)}>
          Filters{activeFilters > 0 && ` (${activeFilters})`}
        </button>
        <label className={`${field} ${hide} ${extra}`}>
          Make
          <select className={input} value={params.get('make') ?? ''} onChange={e => set('make', e.target.value)}>
            <option value="">All makes</option>
            {opts?.makes.map(m => <option key={m}>{m}</option>)}
          </select>
        </label>
        <div className={`${field} ${hide} ${extra}`}>
          Years
          <div className="flex items-center gap-1.5 text-ink">
            <select aria-label="From year" className={input} value={params.get('from') ?? ''} onChange={e => set('from', e.target.value)}>
              <option value="">Any</option>
              {opts?.years.map(y => <option key={y}>{y}</option>)}
            </select>
            to
            <select aria-label="To year" className={input} value={params.get('to') ?? ''} onChange={e => set('to', e.target.value)}>
              <option value="">Any</option>
              {opts?.years.map(y => <option key={y}>{y}</option>)}
            </select>
          </div>
        </div>
        <label className={`${field} ${hide} ${extra}`}>
          Class
          <select className={input} value={params.get('class') ?? ''} onChange={e => set('class', e.target.value)}>
            <option value="">All classes</option>
            {opts?.classes.map(c => <option key={c}>{c}</option>)}
          </select>
        </label>
        <label className={`${field} ${hide} ${extra}`}>
          Fuel
          <select className={input} value={params.get('fuel') ?? ''} onChange={e => set('fuel', e.target.value)}>
            <option value="">Any fuel</option>
            {opts?.fuels.map(f => <option key={f}>{f}</option>)}
          </select>
        </label>
        <label className={`${hide} col-span-2 cursor-pointer items-center gap-2.5 border-t border-ink px-3.5 py-2.5 text-[15px] font-semibold whitespace-nowrap md:col-span-1 md:border-t-0`}>
          <input type="checkbox" className="size-5 accent-ink" checked={params.get('3d') === '1'} onChange={e => set('3d', e.target.checked ? '1' : '')} />
          Only with 3D
        </label>
      </div>

      <div className="px-4 pb-10 sm:px-8">
        <div className="flex items-center justify-between gap-4 pt-4 pb-3.5 text-muted">
          <span aria-live="polite">
            {error ? 'Could not load the car list. Refresh the page to try again.'
              : !cars ? 'Loading cars…'
              : results.length ? `Showing ${(page - 1) * PER_PAGE + 1}–${(page - 1) * PER_PAGE + shown.length} of ${results.length.toLocaleString()} cars`
              : '0 cars'}
          </span>
          <label>
            Sort{' '}
            <select className="bg-transparent font-semibold text-ink" value={params.get('sort') ?? ''} onChange={e => set('sort', e.target.value)}>
              <option value="">Make A–Z</option>
              <option value="new">Newest first</option>
            </select>
          </label>
        </div>

        {!cars && !error ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,260px),1fr))] gap-5" aria-busy="true">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="animate-pulse border-2 border-line bg-white">
                <div className="aspect-3/2 bg-skel" />
                <div className="m-3.5 h-3.5 w-2/5 bg-skel" />
                <div className="mx-3.5 mb-5 h-7 w-3/4 bg-skel" />
              </div>
            ))}
          </div>
        ) : cars && !results.length ? (
          <div className="border-2 border-dashed border-ink bg-white px-6 py-12 text-center">
            <h2 className="cond mb-1.5 text-[34px] font-extrabold">
              {params.get('q') ? `No cars match “${params.get('q')}”` : 'No cars match these filters'}
            </h2>
            <p className="mx-auto mb-5 max-w-[46ch] text-muted">
              Nothing in the catalog matches this search with the current filters. Try another make or model, or clear the filters.
            </p>
            <button className="bg-ink px-5 py-3 font-bold text-white" onClick={() => setParams({})}>Clear filters</button>
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,260px),1fr))] gap-5">
            {shown.map(c => <Card key={c.id} car={c} query={params.toString()} />)}
          </div>
        )}

        {pages > 1 && (
          <nav aria-label="Pages" className="flex flex-wrap justify-center gap-1 pt-8 font-semibold">
            {page > 1 && <Link className="border-2 border-ink px-3 py-2" to={pageHref(page - 1)}>Previous</Link>}
            {[...new Set([1, page - 1, page, page + 1, pages])].filter(n => n >= 1 && n <= pages).map((n, i, arr) => (
              <span key={n} className="flex">
                {i > 0 && n - arr[i - 1] > 1 && <span className="px-2 py-2">…</span>}
                <Link to={pageHref(n)} aria-current={n === page ? 'page' : undefined}
                  className={`min-w-10 border-2 px-3 py-2 text-center ${n === page ? 'border-ink bg-ink text-white' : 'border-transparent'}`}>{n}</Link>
              </span>
            ))}
            {page < pages && <Link className="border-2 border-ink px-3 py-2" to={pageHref(page + 1)}>Next</Link>}
          </nav>
        )}
      </div>
    </main>
  )
}

function Card({ car: c, query }: { car: CarSummary; query: string }) {
  return (
    <Link to={`/cars/${c.id}${query ? `?${query}` : ''}`} className="group block border-2 border-ink bg-white">
      <div className="relative aspect-3/2 border-b-2 border-ink bg-skel">
        {c.thumbnail && <img src={c.thumbnail} alt="" loading="lazy" className="size-full object-cover" />}
        {c.has3d && <span className="cond absolute top-0 right-0 bg-ink px-2.5 py-1 text-[15px] font-extrabold text-white">3D</span>}
      </div>
      <div className="px-3.5 pt-3 pb-3.5">
        <p className="text-sm text-muted">{c.make}</p>
        <h3 className="cond text-[30px] leading-none font-extrabold decoration-[3px] underline-offset-4 group-hover:underline">{c.model}</h3>
        <dl className="mt-3 grid grid-cols-[auto_1fr] border-t border-ink text-sm [&>*]:border-b [&>*]:border-line [&>*]:py-1.5">
          <dt className="pr-4 text-muted">Years</dt><dd className="text-right font-semibold">{yearRange(c.years)}</dd>
          <dt className="pr-4 text-muted">Class</dt><dd className="text-right font-semibold">{c.vehicleClass}</dd>
          <dt className="pr-4 text-muted">Engine</dt><dd className="text-right font-semibold">{c.engine ?? 'Electric'}</dd>
        </dl>
      </div>
    </Link>
  )
}
