import { Link, Outlet } from 'react-router'
import { useIndex } from '../data'

export default function Layout() {
  const { data: cars } = useIndex()
  const years = cars?.flatMap(c => [c.years[0], c.years.at(-1)!])
  return (
    <>
      <header className="flex flex-col items-start gap-1 border-b-4 border-ink bg-white px-4 pt-4 pb-3 sm:flex-row sm:items-end sm:justify-between sm:px-8 sm:pt-6 sm:pb-4">
        <Link to="/" className="xcond text-[40px] leading-[.9] font-black tracking-tight no-underline">Just Cars</Link>
        {cars && years && (
          <p className="text-muted">
            <b className="text-ink">{cars.length.toLocaleString()}</b> cars sold in the US, {Math.min(...years)} to {Math.max(...years)}
          </p>
        )}
      </header>
      <Outlet />
      <footer className="mt-16 flex flex-wrap justify-between gap-2 border-t border-ink px-4 py-6 text-sm text-muted sm:px-8">
        <span>Data from FuelEconomy.gov, Wikipedia and Sketchfab.</span>
        <Link to="/credits" className="font-semibold text-ink underline">Credits and licenses</Link>
      </footer>
    </>
  )
}
