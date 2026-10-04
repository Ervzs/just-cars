import { useEffect } from 'react'

const sources = [
  {
    name: 'FuelEconomy.gov',
    href: 'https://www.fueleconomy.gov/feg/ws/',
    text: 'Model years, engine, transmission, drive, fuel type, vehicle class, MPG and electric range. These are EPA estimates published by the US Department of Energy and the Environmental Protection Agency, and are in the public domain.',
  },
  {
    name: 'Wikipedia',
    href: 'https://en.wikipedia.org/',
    text: 'Car descriptions and photos. Text is available under the Creative Commons Attribution-ShareAlike license. Photos come from Wikimedia Commons under their individual licenses. Each car page links to its Wikipedia article.',
  },
  {
    name: 'Sketchfab',
    href: 'https://sketchfab.com/',
    text: '3D models, embedded with the Sketchfab viewer. Each model belongs to its author and is shared under the Creative Commons license shown below the viewer on its car page.',
  },
]

export default function CreditsPage() {
  useEffect(() => { document.title = 'Credits | Just Cars' }, [])
  return (
    <main className="max-w-[68ch] px-4 py-8 sm:px-8">
      <h1 className="xcond mb-6 text-[64px] leading-[.9] font-black">Credits</h1>
      <p className="mb-8 text-[17px] leading-relaxed">
        Just Cars is built from public data, collected once when the site is built. Nothing here is sold or sponsored.
      </p>
      {sources.map(s => (
        <section key={s.name} className="mb-6 border-t-2 border-ink pt-3">
          <h2 className="cond mb-1 text-[28px] font-extrabold">
            <a href={s.href} className="underline decoration-2 underline-offset-4">{s.name}</a>
          </h2>
          <p className="text-[17px] leading-relaxed">{s.text}</p>
        </section>
      ))}
    </main>
  )
}
