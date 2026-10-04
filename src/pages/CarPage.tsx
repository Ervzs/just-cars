import { useEffect, useMemo } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { dataUrl, filterCars, useIndex, useJson, yearRange, type CarDetail } from '../data'
import NotFoundPage from './NotFoundPage'

const embed = (uid: string) =>
  `https://sketchfab.com/models/${uid}/embed?autostart=1&autospin=0.15&preload=1&ui_infos=0&ui_inspector=0&ui_settings=0&ui_vr=0&ui_ar=0&ui_help=0&ui_annotations=0&ui_theme=dark`

export default function CarPage() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const { data: car, error } = useJson<CarDetail>(dataUrl(`cars/${id}.json`))
  const { data: cars } = useIndex()

  // Previous/next follow the grid's current filtered order (carried in the query string).
  const [prev, next] = useMemo(() => {
    const list = cars ? filterCars(cars, params) : []
    const i = list.findIndex(c => c.id === id)
    return i < 0 ? [] : [list[i - 1], list[i + 1]]
  }, [cars, params, id])
  const siblings = cars && car ? cars.filter(c => c.make === car.make && c.model === car.model && c.id !== car.id) : []
  const q = params.size ? `?${params}` : ''

  useEffect(() => {
    if (car) document.title = `${car.make} ${car.model}${car.generation ? ` (${car.generation})` : ''} | Just Cars`
  }, [car])

  if (error) return <NotFoundPage />

  const s = car?.specs
  const unit = car?.fuelType === 'Electricity' ? 'MPGe' : 'mpg'
  const rows = car ? ([
    ['Also known as', car.aka?.join(', ')],
    ['Variants', car.variants?.length > 1 && car.variants.join(', ')],
    ['Engine', s?.engine],
    ['Transmission', s?.transmission],
    ['Drive', s?.drive],
    ['Fuel', car.fuelType],
    ['Class', car.vehicleClass],
    ['Electric range', s?.evRangeMiles && `${s.evRangeMiles} miles`],
  ].filter(r => r[1]) as [string, string][]) : []

  return (
    <main>
      <nav className="flex items-stretch justify-between border-b border-ink bg-white">
        <Link to={`/${q}`} className="flex items-center gap-2 px-4 py-3 font-semibold sm:px-6">‹ All cars</Link>
        <div className="flex">
          {prev && (
            <Link to={`/cars/${prev.id}${q}`} className="flex flex-col justify-center border-l border-ink px-4 py-2 text-[13px] text-muted sm:px-6">
              <span className="hidden sm:inline">Previous</span>
              <b className="text-base text-ink"><span className="sm:hidden">‹ </span>{prev.make} {prev.model}</b>
            </Link>
          )}
          {next && (
            <Link to={`/cars/${next.id}${q}`} className="flex flex-col items-end justify-center border-l border-ink px-4 py-2 text-[13px] text-muted sm:px-6">
              <span className="hidden sm:inline">Next</span>
              <b className="text-base text-ink">{next.make} {next.model}<span className="sm:hidden"> ›</span></b>
            </Link>
          )}
        </div>
      </nav>

      <div className="px-4 pb-10 sm:px-8">
        {!car ? (
          <div className="animate-pulse pt-7" aria-busy="true">
            <div className="mb-3 h-5 w-24 bg-skel" />
            <div className="mb-6 h-20 w-2/3 bg-skel" />
            <div className="aspect-16/10 bg-skel lg:w-2/3" />
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2 pt-7 pb-5">
              <h1 className="xcond text-[clamp(48px,9vw,112px)] leading-[.85] font-black tracking-tight">
                <small className="mb-2 block text-lg font-medium tracking-normal text-muted [font-stretch:100%] sm:text-[22px]">{car.make}</small>
                <span className="[overflow-wrap:anywhere]">{car.model}</span>
              </h1>
              <p className="text-lg">{[car.generation, yearRange(car.years)].filter(Boolean).join(', ')}</p>
            </div>

            <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
              <div>
                <div className="aspect-16/10 border-2 border-ink bg-[#1b1f22]">
                  {car.sketchfab ? (
                    <iframe title={`3D model of the ${car.make} ${car.model}`} src={embed(car.sketchfab.uid)} className="size-full"
                      allow="autoplay; fullscreen; xr-spatial-tracking" allowFullScreen />
                  ) : car.image ? (
                    <img src={car.image} alt={`${car.make} ${car.model}`} className="size-full object-cover" />
                  ) : (
                    <p className="grid size-full place-items-center text-white/70">No photo available</p>
                  )}
                </div>
                <p className="mt-2 text-[13px] text-muted">
                  {car.sketchfab ? (
                    <>3D model: <a className="underline" href={`https://sketchfab.com/3d-models/${car.sketchfab.uid}`}>{car.sketchfab.name}</a> by{' '}
                      <a className="underline" href={car.sketchfab.authorUrl}>{car.sketchfab.author}</a>, {car.sketchfab.license}</>
                  ) : car.image ? 'No 3D model yet. Photo from Wikipedia.' : 'No 3D model yet.'}
                </p>
              </div>

              <aside aria-label="Specifications" className="border-3 border-ink bg-white">
                <div className="flex items-baseline justify-between bg-ink px-3.5 py-2.5 text-white">
                  <b className="cond text-[22px] font-extrabold">{s ? 'Fuel economy' : 'Details'}</b>
                  {s && <span>{car.representativeYear} model</span>}
                </div>
                {s?.mpgCombined != null && (
                  <div className="grid grid-cols-[1fr_1.3fr_1fr] items-center border-b-3 border-ink text-center">
                    <div className="px-1.5 py-3.5">{s.mpgCity != null && <><b className="cond block text-[40px] leading-none font-extrabold">{s.mpgCity}</b><small>city</small></>}</div>
                    <div className="self-stretch bg-green px-1.5 py-4.5 text-white">
                      <b className="cond block text-[60px] leading-none font-extrabold sm:text-[72px]">{s.mpgCombined}</b>
                      <small>combined {unit}</small>
                    </div>
                    <div className="px-1.5 py-3.5">{s.mpgHighway != null && <><b className="cond block text-[40px] leading-none font-extrabold">{s.mpgHighway}</b><small>highway</small></>}</div>
                  </div>
                )}
                {rows.length > 0 && <dl className="grid grid-cols-[auto_1fr] px-3.5 pt-1.5 pb-3 [&>*]:border-b [&>*]:border-line [&>*]:py-2 [&>*:nth-last-child(-n+2)]:border-b-0">
                  {rows.map(([k, v]) => [
                    <dt key={k} className="pr-4 text-muted">{k}</dt>,
                    <dd key={`${k}v`} className="text-right font-semibold">{v}</dd>,
                  ])}
                </dl>}
                <p className="border-t border-ink px-3.5 py-2 text-xs text-muted">
                  {s ? 'EPA estimates from FuelEconomy.gov' : "No EPA figures: this generation wasn't sold in the US."}
                </p>
              </aside>
            </div>

            {siblings.length > 0 && (
              <nav aria-label="Other generations" className="pt-8">
                <h2 className="cond mb-3 text-[30px] leading-tight font-extrabold">Other generations</h2>
                <ul className="flex flex-wrap gap-2">
                  {siblings.map(c => (
                    <li key={c.id}>
                      <Link to={`/cars/${c.id}`} className="block border-2 border-ink bg-white px-3 py-2 font-semibold hover:bg-ink hover:text-white">
                        {c.generation ?? c.model} <span className="font-normal">{yearRange(c.years)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            )}

            {car.description && (
              <section className="max-w-[68ch] pt-8">
                <h2 className="cond mb-2 text-[30px] leading-tight font-extrabold">About the {car.model}</h2>
                <p className="mb-3 text-[17px] leading-relaxed">{car.description}</p>
                {car.wikipediaUrl && <a href={car.wikipediaUrl} className="font-semibold text-blue underline">Read more on Wikipedia</a>}
              </section>
            )}
          </>
        )}
      </div>
    </main>
  )
}
