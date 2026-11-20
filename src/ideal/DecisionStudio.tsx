import { useMemo, useState } from 'react'
import { Bath, BedDouble, Building2, Check, CircleHelp, ExternalLink, GitCompareArrows, MapPin, Ruler, SlidersHorizontal, X } from 'lucide-react'
import type { Match, MatchResult } from '../../server/matching'
import { choiceLabel, requirementLabels, requirementValues, type RequirementId, type SearchSetup } from './contracts'
import type { Step } from '../model'
import { requestHousing } from './api'
import './decision.css'

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 2 })
const date = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
const MAP = { west: -83.77, east: -83.70, south: 42.255, north: 42.31 }

function checkedLabel(value: string) {
  const parsed = new Date(value)
  return Number.isNaN(parsed.valueOf()) ? value : date.format(parsed)
}

function planFacts(match: Match) {
  return [
    match.beds == null ? null : { label: match.beds === 0 ? 'Studio' : `${match.beds} ${match.beds === 1 ? 'bed' : 'beds'}`, Icon: BedDouble },
    match.baths == null ? null : { label: `${match.baths} ${match.baths === 1 ? 'bath' : 'baths'}`, Icon: Bath },
    match.apartmentSqFt == null ? null : { label: `${match.apartmentSqFt.toLocaleString()} sq ft`, Icon: Ruler },
  ].filter(fact => fact !== null)
}

function tradeoffs(match: Match, budget: number) {
  const notes = [...match.provisionalReasons ?? []]
  if (match.monthlyCents > budget * .9) notes.push('Uses most of your monthly ceiling')
  if (match.commuteMinutes === null) notes.push('Commute still needs a live route check')
  if (match.coverage !== null && match.coverage < .75) notes.push('Some preferences lack exact-unit evidence')
  if (match.unknowns.length) notes.push(`${match.unknowns.length} preference ${match.unknowns.length === 1 ? 'detail' : 'details'} unconfirmed`)
  return notes.slice(0, Math.max(match.provisionalReasons?.length ?? 0, 2))
}

function EvidenceDrawer({ match }: { match: Match }) {
  return <details className="evidence-drawer">
    <summary>Evidence and assumptions <span>{match.evidence.length} sources</span></summary>
    <div className="evidence-list">
      {match.evidence.length === 0 ? <p>No source excerpt was attached to this ranking detail.</p> : match.evidence.map(item => <article key={item.id}>
        <div><strong>{item.label}</strong><span>Checked {checkedLabel(item.checkedAt)}</span></div>
        <p>{item.text}</p>
        <a href={item.sourceUrl} target="_blank" rel="noreferrer">Open source <ExternalLink size={14} aria-hidden="true" /></a>
      </article>)}
    </div>
  </details>
}

function ResultMap({ matches, active, onActive }: { matches: Match[]; active: string | null; onActive: (id: string) => void }) {
  return <aside className="result-map" aria-label="Shortlist map">
    <div className="result-map-heading"><span><MapPin size={17} aria-hidden="true" /> Your shortlist</span><small>Central Ann Arbor</small></div>
    <div className="result-map-canvas">
      <div className="campus-shape campus-central">Central Campus</div>
      <div className="campus-shape campus-south">South Campus</div>
      {matches.map((match, index) => match.buildingLat != null && match.buildingLng != null && <button
        key={match.layoutId} type="button" aria-label={`${index + 1}. ${match.buildingName}`}
        className={active === match.layoutId ? 'is-active' : ''}
        style={{ left: `${Math.max(5, Math.min(95, (match.buildingLng - MAP.west) / (MAP.east - MAP.west) * 100))}%`, top: `${Math.max(7, Math.min(93, (MAP.north - match.buildingLat) / (MAP.north - MAP.south) * 100))}%` }}
        onClick={() => onActive(match.layoutId)}>{index + 1}</button>)}
      <span className="map-destination"><MapPin size={15} aria-hidden="true" /> Approximate locations</span>
    </div>
    <p>Select a marker to find its result.</p>
  </aside>
}

function ComparePanel({ matches, onRemove, onClear }: { matches: Match[]; onRemove: (id: string) => void; onClear: () => void }) {
  if (!matches.length) return null
  return <section className="compare-panel" aria-labelledby="compare-title">
    <header><div><span className="eyebrow">Decision table</span><h3 id="compare-title">Compare your finalists</h3></div><button type="button" className="text-button" onClick={onClear}>Clear comparison</button></header>
    <div className="compare-scroll"><table><thead><tr><th scope="col">Detail</th>{matches.map(match => <th key={match.layoutId} scope="col">{match.buildingName}<button type="button" aria-label={`Remove ${match.buildingName} from comparison`} onClick={() => onRemove(match.layoutId)}><X size={15} /></button></th>)}</tr></thead>
      <tbody>
        <tr><th scope="row">Floor plan</th>{matches.map(match => <td key={match.layoutId}>{match.layoutName}</td>)}</tr>
        <tr><th scope="row">Monthly cost per person</th>{matches.map(match => <td key={match.layoutId}><strong>{match.priceEstimated && 'Est. '}{money.format(match.monthlyCents / 100)}</strong></td>)}</tr>
        <tr><th scope="row">Commute</th>{matches.map(match => <td key={match.layoutId}>{match.commuteMinutes === null ? 'Needs route check' : `${match.commuteMinutes} min${match.routeBasis?.startsWith('Estimate') ? ' (est.)' : ''}`}</td>)}</tr>
        <tr><th scope="row">Evidence coverage</th>{matches.map(match => <td key={match.layoutId}>{match.coverage === null ? 'Core facts only' : `${Math.round(match.coverage * 100)}%`}</td>)}</tr>
        <tr><th scope="row">Still unknown</th>{matches.map(match => <td key={match.layoutId}>{match.unknowns.length || 'None in your brief'}</td>)}</tr>
      </tbody>
    </table></div>
  </section>
}

function SensitivityPanel({ setup, baseline }: { setup: SearchSetup; baseline: MatchResult }) {
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState('')
  const scenarios = [
    { id: 'budget', label: 'Add $100 to budget', setup: { ...setup, maxMonthlyCents: setup.maxMonthlyCents + 10_000 } }
  ]
  const commute = setup.choices.commute
  const nextCommute = requirementValues.commute.find(value => Number(value) > Number(commute?.value))
  if (commute && nextCommute) scenarios.push({
    id: 'commute', label: 'Allow 10 more commute minutes',
    setup: { ...setup, choices: { ...setup.choices, commute: { value: nextCommute, required: true } } }
  })

  const firstRequired = Object.entries(setup.choices).find(([, choice]) => choice.required)
  if (firstRequired) {
    const [id, choice] = firstRequired
    const choices = { ...setup.choices }
    delete choices[id as RequirementId]
    scenarios.push({ id: 'requirement', label: 'Try without ' + requirementLabels[id as RequirementId].toLowerCase() +
      ' (' + choiceLabel(id as RequirementId, choice.value).toLowerCase() + ')', setup: { ...setup, choices } })
  }

  async function testScenario(id: string, candidate: SearchSetup) {
    setBusy(id)
    setMessage('')
    try {
      const result = await requestHousing<{ qualifiedLayouts: number }>('filter', { setup: candidate })
      const count = result.qualifiedLayouts
      const delta = count - baseline.qualifiedLayouts
      const change = delta === 0 ? 'same as your saved search' : Math.abs(delta) + (delta > 0 ? ' more' : ' fewer')
      setMessage(count + (count === 1 ? ' eligible floor plan' : ' eligible floor plans') + ' (' + change + ').')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not test that scenario.')
    } finally {
      setBusy('')
    }
  }
  return <section className="sensitivity-panel" aria-labelledby="sensitivity-title">
    <div className="sensitivity-copy"><span className="insight-icon"><SlidersHorizontal size={19} /></span><div><span className="eyebrow">What changes the answer?</span><h3 id="sensitivity-title">Test a tradeoff without changing your brief</h3><p>Check how many floor plans pass with one change.</p></div></div>
    <div className="sensitivity-actions">{scenarios.map(scenario => <button key={scenario.id} type="button" disabled={!!busy} onClick={() => testScenario(scenario.id, scenario.setup)}>{busy === scenario.id ? 'Checking…' : scenario.label}</button>)}</div>
    {message && <p className="sensitivity-result" role="status">{message}</p>}
  </section>
}

export function DecisionStudio({ result, setup, onEdit }: { result: MatchResult; setup: SearchSetup; onEdit: (step: Step) => void }) {
  const [compare, setCompare] = useState<string[]>([])
  const [active, setActive] = useState<string | null>(result.matches[0]?.layoutId ?? null)
  const compared = useMemo(() => compare.flatMap(id => result.matches.find(match => match.layoutId === id) ?? []), [compare, result.matches])
  const coverage = result.matches.flatMap(match => match.coverage ?? [])
  const averageCoverage = coverage.length ? Math.round(coverage.reduce((sum, value) => sum + value, 0) * 100 / coverage.length) : null
  const confirmationCount = result.needsConfirmationCount ?? result.needsConfirmation.length
  const hasMatches = result.matches.length > 0
  const hasMap = result.matches.some(match => match.buildingLat != null && match.buildingLng != null)
  if (result.status === 'no_inventory') return <div className="result-empty"><CircleHelp size={25} /><h3>Apartment listings are unavailable.</h3><p>Your brief is saved. Refresh the shortlist to try again.</p></div>
  return <div className="decision-studio">
    <div className="result-stats">
      <div><strong>{result.matches.length}</strong><span>best-fit layouts</span></div>
      <div><strong>{result.qualifiedLayouts}</strong><span>eligible layouts</span></div>
      <div><strong>{averageCoverage == null ? '—' : averageCoverage + '%'}</strong><span>average preference evidence</span></div>
      <div><strong>{confirmationCount}</strong><span>offers to verify</span></div>
    </div>
    {!hasMatches && <div className="result-empty">
      <CircleHelp size={25} /><h3>No floor plan clears every must-have yet.</h3>
      <div className="result-empty-actions"><button className="btn-primary" type="button" onClick={() => onEdit('essentials')}>Review must-haves</button><button className="btn-secondary" type="button" onClick={() => onEdit('budget')}>Adjust budget</button></div>
    </div>}
    {result.qualitativeStatus === 'unavailable' && <p>Model review was incomplete. Your results use the available listing evidence and weighted preferences.</p>}
    <SensitivityPanel setup={setup} baseline={result} />
    {hasMatches && <div className={hasMap ? 'results-layout' : undefined}>
      {hasMap && <ResultMap matches={result.matches} active={active} onActive={id => { setActive(id); document.getElementById(`match-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }) }} />}
      <ol className="shortlist result-cards">
        {result.matches.map((match, index) => {
          const selected = compare.includes(match.layoutId)
          const notes = tradeoffs(match, setup.maxMonthlyCents)
          return <li id={`match-${match.layoutId}`} key={match.layoutId} className={active === match.layoutId ? 'is-active' : ''} onMouseEnter={() => setActive(match.layoutId)}>
            <article className="match-card">
              <div className="match-art" aria-hidden="true"><Building2 size={34} /><span>{String(index + 1).padStart(2, '0')}</span></div>
              <div className="match-card-body">
                <header><div>{index === 0 && <span className="best-fit"><Check size={13} /> Top match</span>}<p className="match-address">{match.address}</p><h3>{match.buildingName}</h3><p className="match-plan">{match.layoutName}{match.layoutName !== match.optionName && ' · ' + match.optionName}</p></div><div className="match-price"><strong>{match.priceEstimated && 'Est. '}{money.format(match.monthlyCents / 100)}</strong><span>per person / month</span></div></header>
                <div className="fact-row">{planFacts(match).map(({ label, Icon }) => <span key={label}><Icon aria-hidden="true" />{label}</span>)}{match.commuteMinutes !== null && <span><MapPin />{match.commuteMinutes} min to your pin{match.routeBasis?.startsWith('Estimate') && ' (est.)'}</span>}</div>
                <div className="match-explanation"><section><h4>Match details</h4><ul>{match.reasons.slice(0, 3).map(reason => <li key={reason}><Check size={14} />{reason}</li>)}</ul></section><section className="tradeoff-list"><h4>Tradeoffs to notice</h4>{notes.length ? <ul>{notes.map(note => <li key={note}>{note}</li>)}</ul> : <p>Review the listing for current lease terms.</p>}</section></div>
                <div className="confidence-row">{match.coverage !== null && <span className="coverage"><i style={{ width: `${Math.round(match.coverage * 100)}%` }} />Evidence coverage {Math.round(match.coverage * 100)}%</span>}<span>Checked {checkedLabel(match.checkedAt)}</span>{match.availableFrom && <span>Listed start {checkedLabel(match.availableFrom)}</span>}</div>
                <div className="match-actions"><button type="button" className={selected ? 'compare-selected' : ''} onClick={() => setCompare(current => selected ? current.filter(id => id !== match.layoutId) : [...current, match.layoutId])}><GitCompareArrows size={17} />{selected ? 'Added to compare' : `Compare${compared.length ? ` · ${compared.length}/3` : ''}`}</button><a href={match.sourceUrl} target="_blank" rel="noreferrer">View source listing <ExternalLink size={15} /></a>{match.planUrl && <a href={match.planUrl} target="_blank" rel="noreferrer">Floor plan <ExternalLink size={15} /></a>}</div>
                <EvidenceDrawer match={match} />
              </div>
            </article>
          </li>
        })}
      </ol>
    </div>}
    <ComparePanel matches={compared} onRemove={id => setCompare(current => current.filter(value => value !== id))} onClear={() => setCompare([])} />
    {result.needsConfirmation.length > 0 && <details className="confirmation-list"><summary>{confirmationCount} offers need confirmation</summary>{confirmationCount > result.needsConfirmation.length && <p>Showing {result.needsConfirmation.length} offers.</p>}<ul>{result.needsConfirmation.map(item => <li key={item.offerId}><strong>{item.buildingName} · {item.layoutName}</strong><span>{item.reasons.join(' · ')}</span></li>)}</ul></details>}
  </div>
}
