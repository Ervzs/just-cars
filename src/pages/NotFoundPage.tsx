import { useEffect } from 'react'
import { Link } from 'react-router'

export default function NotFoundPage() {
  useEffect(() => { document.title = 'Page not found | Just Cars' }, [])
  return (
    <main className="px-4 py-10 sm:px-8">
      <div className="border-2 border-dashed border-ink bg-white px-6 py-12 text-center">
        <h1 className="cond mb-1.5 text-[34px] font-extrabold">We don't have that car</h1>
        <p className="mx-auto mb-5 max-w-[46ch] text-muted">This page doesn't exist. The link may be mistyped, or the car isn't in the catalog.</p>
        <Link to="/" className="inline-block bg-ink px-5 py-3 font-bold text-white">Browse all cars</Link>
      </div>
    </main>
  )
}
