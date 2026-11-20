import { CalendarClock, Check, GitBranch, Layers2, MapPin, ShieldCheck, Wallet, type LucideIcon } from 'lucide-react'
import campusMap from '../assets/central-campus.svg'

function MapSample() {
  return (
    <figure
      className="map-sample"
      aria-label="Ross School of Business with a student’s example housing brief"
    >
      <div className="map-paper">
        <div className="map-surface">
          <img className="map-art" src={campusMap} alt="" />
          <div className="ross-point">
            <span className="pin-shadow" />
            <svg width="34" height="43" viewBox="0 0 34 43" aria-hidden="true">
              <path
                d="M17 41.5S1.5 25.6 1.5 17a15.5 15.5 0 1 1 31 0c0 8.6-15.5 24.5-15.5 24.5Z"
                fill="#f2c451"
                stroke="#293e34"
                strokeWidth="1.7"
              />
              <circle cx="17" cy="17" r="5.5" fill="#384d3f" />
            </svg>
            <strong>Ross School of Business</strong>
          </div>
        </div>
        <div className="map-corner">
          <span className="map-crosshair" />
          Central Campus
        </div>
        <div className="north" aria-hidden="true">
          <b>N</b>
          <svg viewBox="0 0 20 24">
            <path d="M10 1 17 22 10 16Z" fill="#fdfbf1" />
            <path d="M10 1 3 22 10 16Z" fill="currentColor" />
            <path d="M10 1 17 22 10 16 3 22Z" stroke="currentColor" fill="none" strokeLinejoin="round" />
          </svg>
        </div>
        <div className="scale" aria-hidden="true">
          <span />
          100 m
        </div>
        <a
          className="map-credit"
          href="https://www.openstreetmap.org/copyright"
          target="_blank"
          rel="noreferrer"
        >
          © OpenStreetMap contributors
        </a>
      </div>
      <div className="brief-preview">
        <div className="preview-caption">
          <GitBranch size={17} /> Example housing brief
        </div>
        <blockquote>“I need my own room. I’d give up a gym for a shorter walk.”</blockquote>
        <div className="preview-nodes">
          <span>
            <Check size={13} /> Private bedroom
          </span>
          <span>
            <MapPin size={13} /> Shorter walk
          </span>
        </div>
      </div>
    </figure>
  )
}

const guide: { icon: LucideIcon; title: string; copy: string }[] = [
  {
    icon: Wallet,
    title: 'Build your preferences',
    copy: 'Set your per-person budget, pin a spot and rank your travel modes. Pick your requirements, then describe the place you’d love.'
  },
  {
    icon: MapPin,
    title: 'Find your shortlist',
    copy: 'See sourced floor plans ranked by fit, monthly cost per person, commute and details to confirm.'
  },
  {
    icon: Layers2,
    title: 'Test the tradeoffs',
    copy: 'Change one assumption, compare finalists side by side and see exactly what changes the recommendation.'
  }
]

export default function Home({ signedIn }: { signedIn: boolean }) {
  return (
    <main id="main" className="home view">
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-copy">
          <div className="hero-locator">
            <MapPin size={14} strokeWidth={1.8} aria-hidden="true" />
            Housing decision system · Ann Arbor
          </div>
          <h1 id="hero-title" tabIndex={-1}>
            Find the apartment that fits your actual week.
          </h1>
          <p>
            Turn your budget, commute and daily routines into a sourced shortlist—with the tradeoffs and unknowns shown before you sign.
          </p>
          <a className="btn-primary hero-action" href={signedIn ? '/dashboard' : '/login'}>
            Find my best-fit apartments
          </a>
          <a className="btn-secondary hero-timeline" href="/timeline">
            <CalendarClock size={18} aria-hidden="true" />
            See your leasing timeline
          </a>
          <p className="hero-time"><Check size={15} aria-hidden="true" /> Takes about 2 minutes · Built for U-M students</p>
          {signedIn && (
            <a className="dashboard-return text-button" href="/dashboard">
              Open dashboard
            </a>
          )}
        </div>
        <MapSample />
      </section>
      <section className="research-proof" id="research" aria-label="Research coverage">
        <div><strong>1,500+</strong><span>apartment floor plans</span></div>
        <div><strong>12</strong><span>requirement categories</span></div>
        <div><strong>1,900+</strong><span>room and lease offers</span></div>
        <p><ShieldCheck size={18} aria-hidden="true" /><span><strong>Independent and evidence-first.</strong> U-M portal inclusion is a source boundary, not University endorsement.</span></p>
      </section>
      <section className="how" id="how-it-works" aria-labelledby="how-title">
        <div className="section-heading">
          <h2 id="how-title">A shortlist you can interrogate.</h2>
        </div>
        <ol>
          {guide.map(({ icon: Icon, title, copy }, index) => (
            <li key={title}>
              <div className={'guide-icon guide-icon-' + index} aria-hidden="true">
                <Icon size={28} strokeWidth={1.55} />
              </div>
              <div>
                <span className="step-label">Step {index + 1}</span>
                <h3>{title}</h3>
                <p>{copy}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
      <footer className="project-note">
        <strong>Ann Arbor Housing Board</strong> · Independent student project built for Hack the Lease. Not operated or endorsed by the University of Michigan. Confirm availability and lease terms with each property.
      </footer>
    </main>
  )
}
