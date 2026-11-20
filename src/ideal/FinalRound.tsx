import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowUpRight, Building2, Undo2 } from 'lucide-react'
import type { Match } from '../../server/matching'
import { loadRound, nextPair, roundSignature, saveRound, standings, TOP_PICKS, totalPairs, type Choice } from './elo'
import './final-round.css'

const money = new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 2
})

function PlanCard({ match, onPick }: { match: Match; onPick?: () => void }) {
  const m = match
  const facts = [
    m.beds == null ? null : m.beds === 0 ? 'Studio' : m.beds + (m.beds === 1 ? ' bed' : ' beds'),
    m.baths == null ? null : m.baths + (m.baths === 1 ? ' bath' : ' baths'),
    m.apartmentSqFt == null ? null : m.apartmentSqFt.toLocaleString('en-US') + ' sq ft'
  ].filter(Boolean)
  const uncertain = [...new Set([...(m.provisionalReasons ?? []), ...m.unknowns])]
  return (
    <article className="contender" aria-label={m.layoutName + ' at ' + m.buildingName}>
      <div className="photo-slot"><Building2 size={28} aria-hidden="true" />
        {facts.length > 0 && <span>{facts.join(' · ')}</span>}
      </div>
      <h2>{m.buildingName}</h2>
      <p className="contender-layout">{m.layoutName}{m.layoutName !== m.optionName && ' · ' + m.optionName}</p>
      <dl>
        <div><dt>Monthly cost</dt><dd>{m.priceEstimated && 'Est. '}<strong>{money.format(m.monthlyCents / 100)}</strong> per person</dd></div>
        <div><dt>Trip to your pin</dt><dd>{m.commuteMinutes === null
          ? 'Unconfirmed'
          : m.commuteMinutes + ' min' + (m.routeBasis?.startsWith('Estimate') ? ' (est.)' : '')}</dd></div>
      </dl>
      <details className="contender-more">
        <summary>Plan details</summary>
        <p>{m.address}</p>
        {m.layoutDescription && <p>{m.layoutDescription}</p>}
        {m.buildingDescription && m.buildingDescription !== m.layoutDescription && <p>{m.buildingDescription}</p>}
        {m.reasons.length > 0 && <ul className="contender-reasons">{m.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul>}
        {uncertain.length > 0 && <div className="contender-unknowns"><strong>Still to confirm</strong><ul>{uncertain.map(note => <li key={note}>{note}</li>)}</ul></div>}
        {m.availableFrom && <p>Listed start date {m.availableFrom.slice(0, 10)}. Check current availability with the property.</p>}
        <a href={m.planUrl || m.sourceUrl} target="_blank" rel="noreferrer">View floor plan <ArrowUpRight size={14} aria-hidden="true" /></a>
        {m.planUrl && m.planUrl !== m.sourceUrl &&
          <a href={m.sourceUrl} target="_blank" rel="noreferrer">View offer <ArrowUpRight size={14} aria-hidden="true" /></a>}
      </details>
      {onPick && <button type="button" className="btn-primary contender-pick" onClick={onPick}
        aria-label={'Choose ' + m.layoutName + ' at ' + m.buildingName}>Choose this plan</button>}

    </article>
  )
}

interface RoundProps {
  matches: Match[]
  revision: string
  onExit: () => void
}

function Round({ matches, revision, onExit }: RoundProps) {
  const [round, setRound] = useState(() => loadRound(revision, matches))
  const [saved, setSaved] = useState(true)
  const title = useRef<HTMLHeadingElement>(null)
  const { ids, picks } = round
  const pair = nextPair(ids, picks)
  const byId = new Map(matches.map(m => [m.layoutId, m]))
  const skipped = picks.filter(pick => 'skipped' in pick).length
  const votes = picks.length - skipped
  const winners = pair ? [] : standings(ids, picks).slice(0, TOP_PICKS)
  const resultTitle = ids.length === 0 ? 'No floor plans to compare'
    : ids.length === 1 ? 'Your floor plan'
    : votes === 0 ? 'Your shortlist picks'
    : winners.length === TOP_PICKS ? 'Your personal top three' : 'Your personal top two'

  useEffect(() => {
    title.current?.focus({ preventScroll: true })
    window.scrollTo(0, 0)
  }, [picks.length])

  function update(next: Choice[]) {
    setSaved(saveRound(revision, matches, ids, next))
    setRound({ ids, picks: next })
  }
  return (
    <main id="main" className="final-round comparison-page view">
      <nav className="comparison-nav" aria-label="Comparison navigation">
        <button type="button" className="text-button" onClick={onExit}><ArrowLeft size={16} aria-hidden="true" /> Back to results</button>
        {pair && <span>Comparison {picks.length + 1} of {totalPairs(ids.length)}</span>}
      </nav>
      <h1 ref={title} tabIndex={-1}>
        {pair ? 'Which place would you rather live in?' : resultTitle}
        {pair && <span className="visually-hidden"> Comparison {picks.length + 1} of {totalPairs(ids.length)}.</span>}
      </h1>
      {!saved && <p role="alert" className="error-text">Your browser couldn’t save this choice. Keep this page open to finish.</p>}
      {pair ? (
        <div className="matchup" key={JSON.stringify(pair)}>
          <PlanCard match={byId.get(pair[0])!} onPick={() => update([...picks, { winner: pair[0], loser: pair[1] }])} />
          <span className="matchup-vs" aria-hidden="true">vs</span>
          <PlanCard match={byId.get(pair[1])!} onPick={() => update([...picks, { winner: pair[1], loser: pair[0] }])} />
        </div>
      ) : (
        <>
          <p className="final-round-intro">
            {ids.length === 0 ? 'Return to your results to review your requirements.'
              : ids.length === 1 ? 'One floor plan matched your search.'
              : votes === 0 ? 'You skipped every comparison. These plans follow your original match order.'
              : 'Ranked from your ' + votes + (votes === 1 ? ' pick.' : ' picks.') +
                  (skipped ? ' You skipped ' + skipped + (skipped === 1 ? ' pair.' : ' pairs.') : '') +
                  ' Tied plans follow your original match order.'}
          </p>
          {winners.length > 0 && <ol className="final-podium">
            {winners.map((id, index) => <li key={id}>
              <span className="final-position" aria-hidden="true">{index + 1}</span>
              <PlanCard match={byId.get(id)!} />
            </li>)}
          </ol>}
        </>
      )}
      {(pair || picks.length > 0) && <div className="final-round-actions">
        {pair && <button type="button" className="text-button" onClick={() => update([...picks, { skipped: pair }])}>Skip this pair</button>}
        <button type="button" className="text-button" disabled={!picks.length} onClick={() => update(picks.slice(0, -1))}>
          <Undo2 size={15} aria-hidden="true" /> Undo last choice
        </button>
      </div>}
    </main>
  )
}

export default function FinalRound(props: RoundProps) {
  return <Round key={JSON.stringify([props.revision, roundSignature(props.matches)])} {...props} />
}
