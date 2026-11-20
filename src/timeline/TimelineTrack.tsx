import type { Milestone } from './timeline'
import { addDays } from './timeline'

const DAY = 86_400_000
const time = (iso: string) => Date.parse(iso + 'T00:00:00Z')
const display = (iso: string) =>
  new Date(iso + 'T00:00:00Z').toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' })
const monthLabel = (iso: string) =>
  new Date(iso + 'T00:00:00Z').toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short' })

const MARKERS: Record<string, { label: string; mine?: boolean }> = {
  renewals: { label: 'Renewal offers' },
  showings: { label: 'Tours open' },
  'move-in': { label: 'Move in' },
  checklist: { label: 'Checklist due' },
  'my-renewal': { label: 'Your renewal', mine: true },
  'my-showings': { label: 'Your unit shown', mine: true },
}

/** A month-by-month map of the timeline: phases, key dates and today. Clicking a marker jumps to its step. */
export default function TimelineTrack({ milestones, today }: { milestones: Milestone[]; today: string }) {
  const byId = new Map(milestones.map((m) => [m.id, m]))
  const showings = byId.get('showings')
  const moveIn = byId.get('move-in')
  if (!showings || !moveIn) return null

  const dates = milestones.map((m) => m.date).concat(today)
  const start = dates.reduce((a, b) => (a < b ? a : b))
  const end = addDays(dates.reduce((a, b) => (a > b ? a : b)), 10)
  const span = time(end) - time(start)
  const at = (iso: string) => `${((time(iso) - time(start)) / span) * 100}%`
  const width = (from: string, to: string) => `${((time(to) - time(from)) / span) * 100}%`

  const months: string[] = []
  for (let d = new Date(time(start)); d.getTime() <= time(end); d.setUTCMonth(d.getUTCMonth() + 1, 1)) {
    const iso = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString().slice(0, 10)
    if (iso >= start) months.push(iso)
  }
  const markers = milestones.filter((m) => MARKERS[m.id])
  // Dots that land within a few days of each other stack upward instead of overlapping.
  const levels: number[] = []
  markers.forEach((m, i) => {
    const prev = markers[i - 1]
    levels.push(prev && (time(m.date) - time(prev.date)) / span < 0.03 ? levels[i - 1] + 1 : 0)
  })
  const days = Math.round((time(showings.date) - time(today)) / DAY)

  return (
    <figure className="track" aria-label={`Timeline from today to move-in. Tours open ${days > 0 ? `in ${days} days` : 'already'}.`}>
      <div className="track-scroll">
        <div className="track-body">
          <div className="track-phases">
            <span className="phase phase-ready" style={{ left: at(start), width: width(start, showings.date) }}>Get ready</span>
            <span className="phase phase-sign" style={{ left: at(showings.date), width: width(showings.date, moveIn.date) }}>Tour &amp; sign</span>
            <span className="phase phase-move" style={{ left: at(moveIn.date), width: width(moveIn.date, end) }}>Move in</span>
          </div>
          <div className="track-line">
            {months.map((m) => (
              <span key={m} className="track-month" style={{ left: at(m) }}>
                {monthLabel(m)}
                {m.slice(5, 7) === '01' && <b>{m.slice(0, 4)}</b>}
              </span>
            ))}
            <span className="track-today" style={{ left: at(today) }}>Today</span>
            {markers.map((m, i) => (
              <a
                key={m.id}
                href={'#step-' + m.id}
                className={'track-dot' + (MARKERS[m.id].mine ? ' is-mine' : '')}
                style={{ left: at(m.date), marginTop: -levels[i] * 22 }}
                aria-label={`${i + 1}. ${MARKERS[m.id].label}`}
              >
                {i + 1}
              </a>
            ))}
          </div>
        </div>
      </div>
      <ol className="track-legend">
        {markers.map((m) => (
          <li key={m.id} className={MARKERS[m.id].mine ? 'is-mine' : undefined}>
            <a href={'#step-' + m.id}>
              <b>{MARKERS[m.id].label}</b> · {display(m.date)}
            </a>
          </li>
        ))}
      </ol>
    </figure>
  )
}
