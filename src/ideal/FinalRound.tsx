import { useEffect, useMemo, useState } from 'react'
import { RotateCcw, Trophy, Undo2 } from 'lucide-react'
import type { MatchResult } from '../../server/matching'
import { firstPassLength, loadPicks, nextPair, ratings, savePicks, standings, totalPairs, type Choice } from './elo'
import './final-round.css'

type Match = MatchResult['matches'][number]

const money = (cents: number) =>
  (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
const matchScore = (m: Match) => (m.score === null ? '—' : String(Math.round(m.score * 100)))

function Contender({ m, onPick }: { m: Match; onPick: () => void }) {
  return (
    <article className="contender">
      <h4>{m.buildingName}</h4>
      <p className="contender-layout">{m.layoutName} · {m.optionName}</p>
      <dl>
        <div><dt>Rent</dt><dd><strong>{money(m.monthlyCents)}</strong> per person / month</dd></div>
        <div><dt>Trip to your pin</dt><dd>{m.commuteMinutes === null ? 'Not verified' : m.commuteMinutes + ' min'}</dd></div>
        <div><dt>Match score</dt><dd>{matchScore(m)}</dd></div>
        <div><dt>Available</dt><dd>{m.availableFrom ?? 'Start date unlisted'}</dd></div>
      </dl>
      {m.reasons.length > 0 && <ul className="contender-reasons">{m.reasons.slice(0, 3).map(r => <li key={r}>{r}</li>)}</ul>}
      {m.unknowns.length > 0 && <p className="contender-unknowns">To confirm · {m.unknowns.join(' · ')}</p>}
      <button className="btn-primary contender-pick" onClick={onPick}>Pick {m.buildingName}</button>
    </article>
  )
}

/** Head-to-head picks between the shortlisted floor plans. Elo decides the final order. */
export default function FinalRound({ matches, revision }: { matches: Match[]; revision: string }) {
  const ids = useMemo(() => matches.map(m => m.layoutId), [matches])
  const byId = useMemo(() => new Map(matches.map(m => [m.layoutId, m])), [matches])
  const [picks, setPicks] = useState<Choice[]>(() => loadPicks(revision, ids))
  const [announcement, setAnnouncement] = useState('')
  useEffect(() => setPicks(loadPicks(revision, ids)), [revision, ids])

  const update = (next: Choice[], message: string) => {
    setPicks(next)
    savePicks(revision, ids, next)
    setAnnouncement(message)
  }
  if (ids.length < 2) return null

  const pair = nextPair(ids, picks)
  const table = standings(ids, picks)
  const elo = ratings(ids, picks)
  const record = (id: string) => [picks.filter(p => p.winner === id).length, picks.filter(p => p.loser === id).length]
  const firstPass = firstPassLength(ids.length)
  const leader = byId.get(table[0].id)!
  const pick = (winner: string, loser: string) => {
    const w = byId.get(winner)!
    const next = [...picks, { winner, loser }]
    const top = byId.get(standings(ids, next)[0].id)!
    update(next, `${w.buildingName} moves on. Current favorite: ${top.buildingName}.`)
  }

  return (
    <section className="final-round" aria-labelledby="final-round-title">
      <h3 id="final-round-title">Final round</h3>
      <p className="final-round-intro">
        Compare two at a time and pick the one you’d rather live in. The winner moves on to the next finalist.
        Every pick updates the ratings, so you can keep comparing until the order feels right.
      </p>

      {pair ? (
        <>
          <p className="final-round-progress">
            {picks.length < firstPass
              ? `Matchup ${picks.length + 1} of ${firstPass} · every finalist plays once`
              : `Refining · ${totalPairs(ids.length) - picks.length} matchups left · stop whenever you’re happy`}
          </p>
          {picks.length >= firstPass && (
            <p className="final-round-leader"><Trophy size={16} aria-hidden="true" /> Current favorite · <strong>{leader.buildingName}</strong></p>
          )}
          <div className="matchup">
            <Contender m={byId.get(pair[0])!} onPick={() => pick(pair[0], pair[1])} />
            <span className="matchup-vs" aria-hidden="true">vs</span>
            <Contender m={byId.get(pair[1])!} onPick={() => pick(pair[1], pair[0])} />
          </div>
        </>
      ) : (
        <p className="final-round-leader"><Trophy size={16} aria-hidden="true" /> You compared every pair. Your pick · <strong>{leader.buildingName}</strong></p>
      )}

      <div className="final-round-actions">
        <button className="text-button" disabled={!picks.length}
          onClick={() => update(picks.slice(0, -1), 'Last pick undone.')}><Undo2 size={15} aria-hidden="true" /> Undo last pick</button>
        <button className="text-button" disabled={!picks.length}
          onClick={() => update([], 'Final round restarted.')}><RotateCcw size={15} aria-hidden="true" /> Start over</button>
      </div>

      <table className="standings">
        <caption>Standings</caption>
        <thead><tr><th scope="col">#</th><th scope="col">Floor plan</th><th scope="col">Rating</th><th scope="col">W–L</th><th scope="col">Match score</th></tr></thead>
        <tbody>
          {table.map(({ id }, i) => {
            const m = byId.get(id)!
            const [w, l] = record(id)
            return (
              <tr key={id} className={i === 0 && picks.length ? 'is-leader' : undefined}>
                <td>{i + 1}</td>
                <td><strong>{m.buildingName}</strong><span>{m.layoutName} · {money(m.monthlyCents)}</span></td>
                <td>{Math.round(elo.get(id)!)}</td>
                <td>{w}–{l}</td>
                <td>{matchScore(m)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="final-round-note">Ratings use Elo: everyone starts at 1500, and beating a higher-rated finalist earns more points. Match score is the algorithm’s fit to your brief.</p>
      <p className="visually-hidden" aria-live="polite">{announcement}</p>
    </section>
  )
}
