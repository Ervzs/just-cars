import { Link, Outlet } from 'react-router'

export default function Layout() {
  return (
    <>
      <header className="border-b-4 border-ink bg-white px-4 pt-4 pb-3 sm:px-8 sm:pt-6 sm:pb-4">
        <Link to="/" className="xcond text-[40px] leading-[.9] font-black tracking-tight no-underline">Just Cars</Link>
      </header>
      <div className="min-h-svh"><Outlet /></div>
      <footer className="mt-16 flex flex-wrap justify-between gap-2 border-t border-ink px-4 py-6 text-sm text-muted sm:px-8">
        <span>Data from FuelEconomy.gov, Wikipedia and Sketchfab.</span>
        <Link to="/credits" className="font-semibold text-ink underline">Credits and licenses</Link>
      </footer>
    </>
  )
}
