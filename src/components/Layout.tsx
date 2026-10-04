import { Form, Link, Outlet, useLocation, useSearchParams } from 'react-router'

export default function Layout() {
  const { pathname } = useLocation()
  const q = useSearchParams()[0].get('q') ?? ''
  return (
    <>
      <header className="flex flex-col gap-3 border-b-4 border-ink bg-white px-4 pt-4 pb-3 sm:flex-row sm:items-end sm:justify-between sm:px-8 sm:pt-6 sm:pb-4">
        <Link to="/" className="xcond text-[40px] leading-[.9] font-black tracking-tight no-underline">Just Cars</Link>
        {/* The home page has the full filter bar; everywhere else gets a quick search that opens the grid. */}
        {pathname !== '/' && (
          <Form action="/" role="search" className="flex border-2 border-ink sm:w-80">
            <label className="flex flex-1 flex-col px-3 py-1.5 text-[13px] text-muted">
              Find a car
              <input key={q} type="search" name="q" defaultValue={q} placeholder="Make or model, like Hilux"
                className="w-full bg-transparent text-base font-semibold text-ink placeholder:font-normal placeholder:text-[#8A949C]" />
            </label>
            <button className="cond bg-ink px-4 font-bold text-white">Search</button>
          </Form>
        )}
      </header>
      <div className="min-h-svh"><Outlet /></div>
      <footer className="mt-16 flex flex-wrap justify-between gap-2 border-t border-ink px-4 py-6 text-sm text-muted sm:px-8">
        <span>Data from FuelEconomy.gov, Wikipedia and Sketchfab.</span>
        <Link to="/credits" className="font-semibold text-ink underline">Credits and licenses</Link>
      </footer>
    </>
  )
}
