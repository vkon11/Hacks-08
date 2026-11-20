import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, ArrowUpRight, BellRing, CalendarClock, Check } from 'lucide-react'
import { buildTimeline, defaultMoveIn, isDate, nextKeyDate } from './timeline'
import TimelineTrack from './TimelineTrack'
import './timeline.css'

const storageKey = 'ann-arbor-housing-board:v2:timeline'
interface Saved { moveIn: string; rent: string; rentsNow: boolean; leaseStart: string }

const todayIso = () => new Date().toLocaleDateString('en-CA') // local YYYY-MM-DD
const display = (iso: string) =>
  new Date(iso + 'T00:00:00Z').toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' })

function load(today: string): Saved {
  const fallback = { moveIn: defaultMoveIn(today), rent: '', rentsNow: false, leaseStart: '' }
  try {
    const raw = JSON.parse(localStorage.getItem(storageKey) ?? 'null')
    if (!raw || !isDate(raw.moveIn)) return fallback
    return {
      moveIn: raw.moveIn,
      rent: typeof raw.rent === 'string' ? raw.rent : '',
      rentsNow: raw.rentsNow === true,
      leaseStart: isDate(raw.leaseStart) ? raw.leaseStart : '',
    }
  } catch {
    return fallback
  }
}

export default function TimelinePage() {
  const today = useMemo(todayIso, [])
  const [form, setForm] = useState(() => load(today))
  useEffect(() => {
    document.title = 'Your leasing timeline · Ann Arbor Housing Board'
  }, [])
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(form))
    } catch {
      // Storage denied: the timeline still works for this visit.
    }
  }, [form])

  const rent = Number(form.rent)
  const milestones = isDate(form.moveIn)
    ? buildTimeline({
        moveIn: form.moveIn,
        today,
        currentLeaseStart: form.rentsNow && isDate(form.leaseStart) ? form.leaseStart : null,
        monthlyRent: Number.isFinite(rent) && rent > 0 ? rent : null,
      })
    : []
  const key = nextKeyDate(milestones, today)
  const set = (patch: Partial<Saved>) => setForm((current) => ({ ...current, ...patch }))

  return (
    <main className="timeline-page view" id="main">
      <p className="timeline-eyebrow"><CalendarClock size={16} aria-hidden="true" /> Leasing timeline</p>
      <h1>When should you start looking?</h1>
      <p className="timeline-intro">
        Enter when you want to move in. We’ll map the dates that matter in Ann Arbor, from when places open for
        tours to what to do in your first week.
      </p>

      <form className="timeline-form" onSubmit={(e) => e.preventDefault()}>
        <label>
          Move-in date
          <input type="date" value={form.moveIn} min={today} onChange={(e) => set({ moveIn: e.target.value })} required />
        </label>
        <label>
          <span>Monthly rent per person <span className="optional">(optional)</span></span>
          <input
            type="number" inputMode="numeric" min={0} step={1} placeholder="e.g. 1200"
            value={form.rent} onChange={(e) => set({ rent: e.target.value })}
          />
        </label>
        <label className="timeline-check">
          <input type="checkbox" checked={form.rentsNow} onChange={(e) => set({ rentsNow: e.target.checked })} />
          I rent in Ann Arbor now
        </label>
        {form.rentsNow && (
          <label>
            My current lease started
            <input type="date" value={form.leaseStart} onChange={(e) => set({ leaseStart: e.target.value })} />
          </label>
        )}
      </form>

      {key && (
        <p className="timeline-countdown" role="status">
          <strong>{key.days} days</strong> until <strong>{key.milestone.title.toLowerCase()}</strong> · {display(key.milestone.date)}
        </p>
      )}

      {milestones.length > 0 && <TimelineTrack milestones={milestones} today={today} />}

      {milestones.length === 0 ? (
        <p role="alert">Choose a move-in date to see your timeline.</p>
      ) : (
        <ol className="timeline">
          {milestones.map((m) => (
            <li key={m.id} id={'step-' + m.id} className={'milestone is-' + m.status}>
              <span className="milestone-dot" aria-hidden="true">{m.status === 'done' && <Check size={12} />}</span>
              <div>
                <p className="milestone-date">
                  {m.id === 'brief' ? 'Now' : display(m.date)}
                  {m.status === 'done' && ' · passed'}
                </p>
                <h2>{m.title}</h2>
                <p>{m.detail}</p>
                {m.source && (
                  <a href={m.source.url} target="_blank" rel="noreferrer">
                    {m.source.label} <ArrowUpRight size={12} aria-hidden="true" />
                  </a>
                )}
                {m.id === 'brief' && (
                  <a className="btn-primary milestone-action" href="/dashboard">
                    Start your housing brief <ArrowRight size={16} aria-hidden="true" />
                  </a>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}

      <section className="timeline-alerts" aria-labelledby="alerts-title">
        <h2 id="alerts-title"><BellRing size={18} aria-hidden="true" /> Alerts · coming soon</h2>
        <p>Price changes and new buildings need listing history we don’t collect yet. Here is what an alert will look like.</p>
        <div className="alert-example">
          <span className="alert-tag">Example · not a live alert</span>
          <strong>Rent dropped at a building on your shortlist</strong>
          <span>A 2-bedroom you compared is now listed $75 lower per person.</span>
        </div>
      </section>

      <p className="timeline-note">
        Assumes the place you want has a 12-month lease that began a year before your move-in. Ann Arbor’s rules apply
        to leases of 8 months or more within city limits, entered after March 17, 2024. This is general information,
        not legal advice.
      </p>
    </main>
  )
}
