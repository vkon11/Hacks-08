import { useEffect, useMemo, useState } from 'react'
import { ArrowUpRight, Image, RotateCcw, Trophy, Undo2 } from 'lucide-react'
import type { MatchResult } from '../../server/matching'
import { firstPassLength, loadPicks, nextPair, savePicks, standings, totalPairs, type Choice } from './elo'
import './final-round.css'

type Match = MatchResult['matches'][number]

const estimated = (m: Match) => (m.routeBasis?.startsWith('Estimate') ? ' (estimate)' : '')
const money = (cents: number) =>
  (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

/** Reserved space for a listing photo. The listing data has no photos yet. */
function PhotoSlot({ m, large }: { m: Match; large?: boolean }) {
  return (
    <div className={'photo-slot' + (large ? ' is-large' : '')} role="img" aria-label={`Photo of ${m.buildingName} coming soon`}>
      <Image size={large ? 28 : 22} aria-hidden="true" />
      <span>Photo coming soon</span>
    </div>
  )
}

function Contender({ m, onPick }: { m: Match; onPick: () => void }) {
  return (
    <article className="contender">
      <PhotoSlot m={m} />
      <h3>{m.buildingName}</h3>
      <p className="contender-layout">{m.layoutName} · {m.optionName}</p>
      <dl>
        <div><dt>Rent</dt><dd><strong>{money(m.monthlyCents)}</strong> per person / month</dd></div>
        <div><dt>Trip to your pin</dt><dd>{m.commuteMinutes === null ? 'Not verified' : m.commuteMinutes + ' min' + estimated(m)}</dd></div>
      </dl>
      <details className="contender-more">
        <summary>More details</summary>
        <dl>
          <div><dt>Available</dt><dd>{m.availableFrom ?? 'Start date unlisted'}</dd></div>
          <div><dt>Address</dt><dd>{m.address}</dd></div>
        </dl>
        {m.reasons.length > 0 && <ul className="contender-reasons">{m.reasons.map(r => <li key={r}>{r}</li>)}</ul>}
        {m.unknowns.length > 0 && <p className="contender-unknowns">To confirm · {m.unknowns.join(' · ')}</p>}
        <a href={m.sourceUrl} target="_blank" rel="noreferrer">Offer source <ArrowUpRight size={13} /></a>
      </details>
      <button className="btn-primary contender-pick" onClick={onPick}>Pick {m.buildingName}</button>
    </article>
  )
}

/** Head-to-head picks between the shortlisted floor plans. Elo decides the order; only the order is shown. */
export default function FinalRound({ matches, revision }: { matches: Match[]; revision: string }) {
  const ids = useMemo(() => matches.map(m => m.layoutId), [matches])
  const byId = useMemo(() => new Map(matches.map(m => [m.layoutId, m])), [matches])
  const [picks, setPicks] = useState<Choice[]>(() => loadPicks(revision, ids))
  const [announcement, setAnnouncement] = useState('')
  const [finished, setFinished] = useState(false)
  useEffect(() => { setPicks(loadPicks(revision, ids)); setFinished(false) }, [revision, ids])

  const update = (next: Choice[], message: string) => {
    setPicks(next)
    savePicks(revision, ids, next)
    setAnnouncement(message)
  }
  if (ids.length < 2) return null

  const pair = nextPair(ids, picks)
  const table = standings(ids, picks)
  const firstPass = firstPassLength(ids.length)
  const leader = byId.get(table[0].id)!
  const pick = (winner: string, loser: string) => {
    const next = [...picks, { winner, loser }]
    const top = byId.get(standings(ids, next)[0].id)!
    update(next, `${byId.get(winner)!.buildingName} moves on. Current favorite: ${top.buildingName}.`)
  }

  return (
    <section className="final-round" aria-labelledby="final-round-title">
      <h2 id="final-round-title">Final round</h2>
      <p className="final-round-intro">Pick the one you’d rather live in. The winner moves on to the next finalist.</p>

      {pair && !finished ? (
        <>
          <p className="final-round-progress">
            {picks.length < firstPass
              ? `Matchup ${picks.length + 1} of ${firstPass}`
              : `Keep comparing · ${totalPairs(ids.length) - picks.length} matchups left · stop whenever you’re happy`}
          </p>
          {picks.length >= firstPass && (
            <p className="final-round-leader">
              <Trophy size={16} aria-hidden="true" /> Current favorite · <strong>{leader.buildingName}</strong>
              <button className="text-button" onClick={() => { setFinished(true); setAnnouncement(`Your pick: ${leader.buildingName}.`) }}>Choose my favorite</button>
            </p>
          )}
          <div className="matchup">
            <Contender m={byId.get(pair[0])!} onPick={() => pick(pair[0], pair[1])} />
            <span className="matchup-vs" aria-hidden="true">vs</span>
            <Contender m={byId.get(pair[1])!} onPick={() => pick(pair[1], pair[0])} />
          </div>
        </>
      ) : (
        <article className="winner">
          <PhotoSlot m={leader} large />
          <div className="winner-body">
            <p className="winner-label"><Trophy size={16} aria-hidden="true" /> Your pick</p>
            <h3>{leader.buildingName}</h3>
            <p className="contender-layout">{leader.layoutName} · {leader.optionName} · {leader.address}</p>
            <p className="winner-rent"><strong>{money(leader.monthlyCents)}</strong> per person / month
              {leader.commuteMinutes !== null && <> · {leader.commuteMinutes} min to your pin{estimated(leader)}</>}</p>
            <a href={leader.sourceUrl} target="_blank" rel="noreferrer">View the listing <ArrowUpRight size={13} /></a>
            {pair && <button className="text-button" onClick={() => setFinished(false)}>Keep comparing</button>}
          </div>
        </article>
      )}

      <div className="final-round-actions">
        <button className="text-button" disabled={!picks.length}
          onClick={() => { setFinished(false); update(picks.slice(0, -1), 'Last pick undone.') }}><Undo2 size={15} aria-hidden="true" /> Undo last pick</button>
        <button className="text-button" disabled={!picks.length}
          onClick={() => { setFinished(false); update([], 'Final round restarted.') }}><RotateCcw size={15} aria-hidden="true" /> Start over</button>
      </div>

      <h3 className="standings-title">Standings</h3>
      <ol className="standings">
        {table.map(({ id }, i) => {
          const m = byId.get(id)!
          return (
            <li key={id} className={i === 0 && picks.length ? 'is-leader' : undefined}>
              <strong>{m.buildingName}</strong>
              <span>{m.layoutName} · {money(m.monthlyCents)}</span>
            </li>
          )
        })}
      </ol>
      <p className="visually-hidden" aria-live="polite">{announcement}</p>
    </section>
  )
}
