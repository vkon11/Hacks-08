import { ArrowRight, Ban, Check, Heart, Layers2, MapPin, Wallet, type LucideIcon } from 'lucide-react'
import { FactorCard } from '../board/FactorCard'
import campusMap from '../assets/central-campus.svg'

function MapSample() {
  return <figure className="map-sample" aria-label="Ross School of Business with an example apartment priorities board">
    <div className="map-paper">
      <div className="map-surface">
        <img className="map-art" src={campusMap} alt="" />
        <div className="ross-point"><span className="pin-shadow" /><svg width="34" height="43" viewBox="0 0 34 43" aria-hidden="true"><path d="M17 41.5S1.5 25.6 1.5 17a15.5 15.5 0 1 1 31 0c0 8.6-15.5 24.5-15.5 24.5Z" fill="#f2c451" stroke="#293e34" strokeWidth="1.7"/><circle cx="17" cy="17" r="5.5" fill="#384d3f"/></svg><strong>Ross School of Business</strong></div>
      </div>
      <div className="map-corner"><span className="map-crosshair" />Central Campus</div>
      <div className="north" aria-hidden="true"><b>N</b><svg viewBox="0 0 20 24"><path d="M10 1 17 22 10 16Z" fill="#fdfbf1"/><path d="M10 1 3 22 10 16Z" fill="currentColor"/><path d="M10 1 17 22 10 16 3 22Z" stroke="currentColor" fill="none" strokeLinejoin="round"/></svg></div>
      <div className="scale" aria-hidden="true"><span />100 m</div>
      <a className="map-credit" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a>
    </div>
    <div className="sample-board">
      <div className="sample-title"><span><Layers2 size={18} /> Example board</span><span className="sample-grip" aria-hidden="true">⠿</span></div>
      <div className="sample-row sample-must"><div className="sample-lane"><Check />Must have</div><FactorCard factorId="private_bedroom" /></div>
      <div className="sample-row sample-want"><div className="sample-lane"><Heart />Nice to have</div><FactorCard factorId="laundry" value="in_unit" /></div>
      <div className="sample-row sample-forbid"><div className="sample-lane"><Ban />Dealbreaker</div><FactorCard factorId="floor_level" value="lower_level" /></div>
    </div>
  </figure>
}

const guide: { icon: LucideIcon; title: string; copy: string }[] = [
  { icon: Wallet, title: 'Set your budget', copy: 'Choose the most you’ll pay per month, including recurring fees.' },
  { icon: MapPin, title: 'Pick your spot', copy: 'Pin a spot close to the places you go most, then rank how you get around.' },
  { icon: Layers2, title: 'Sort your priorities', copy: 'Group apartment features by what you need, want or would avoid.' },
]

export default function Home({ signedIn }: { signedIn: boolean }) {
  return <main id="main" className="home view">
    <section className="hero" aria-labelledby="hero-title">
      <div className="hero-copy">
        <div className="hero-locator"><MapPin size={14} strokeWidth={2.2} />Ann Arbor, Michigan</div>
        <h1 id="hero-title" tabIndex={-1}>What matters in your next Ann Arbor apartment?</h1>
        <p>Set your budget, choose where you want to live and how you get around, then sort your housing priorities.</p>
        <a className="btn-primary hero-action" href={signedIn ? '/dashboard' : '/login'}>{signedIn ? 'Open dashboard' : 'Get started'}<ArrowRight size={19} /></a>
      </div>
      <MapSample />
    </section>
    <section className="how" id="how-it-works" aria-labelledby="how-title">
      <h2 id="how-title">How it works</h2>
      <ol>{guide.map(({ icon: Icon, title, copy }, index) => <li key={title}>
        <div className={'guide-icon guide-icon-' + index} aria-hidden="true"><Icon size={28} strokeWidth={1.55} /></div>
        <div><span className="step-label">Step {index + 1}</span><h3>{title}</h3><p>{copy}</p></div>
      </li>)}</ol>
    </section>
  </main>
}
