import { useEffect, useRef, useState } from 'react'
import { ArrowRight, Check, Database, Pencil, ShieldCheck } from 'lucide-react'
import { TRAVEL_LABELS, type Profile, type Step } from '../model'
import type { MatchResult } from '../../server/matching'
import { BriefMap } from '../ideal/BriefMap'
import { choiceLabel, requirementLabels, roommateCountLabel, type RequirementId } from '../ideal/contracts'
import { matchResultSchema } from '../ideal/matchResult'
import { requestHousing } from '../ideal/api'
import { DecisionStudio } from '../ideal/DecisionStudio'
import FinalRound from '../ideal/FinalRound'
import { loadRound, standings, TOP_PICKS, totalPairs } from '../ideal/elo'

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

export default function Summary({ profile, onEdit, setResult }: {
  profile: Profile
  onEdit: (step: Step) => void
  setResult: (revision: string, result: MatchResult) => void
}) {
  const [attempt, setAttempt] = useState(0)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(!profile.result)
  const [comparing, setComparing] = useState(() => window.location.hash === '#compare')
  useEffect(() => {
    const update = () => setComparing(window.location.hash === '#compare')
    window.addEventListener('hashchange', update)
    return () => window.removeEventListener('hashchange', update)
  }, [])
  const { setup, brief, revision, result } = profile
  const currentProfile = useRef(profile)
  currentProfile.current = profile

  useEffect(() => {
    if (!attempt && currentProfile.current.result) return
    const { setup, brief } = currentProfile.current
    const controller = new AbortController()
    setLoading(true)
    setError('')
    const sources = new Set(brief.criteria.flatMap(criterion => criterion.sourceMessageIds))
    const messages = brief.messages.filter(message => message.role === 'student' && sources.has(message.id))
    void requestHousing<MatchResult>('rank', { setup, criteria: brief.criteria, messages }, controller.signal)
      .then((response) => {
        if (!controller.signal.aborted) setResult(revision, matchResultSchema.parse(response))
      })
      .catch((reason) => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Could not update matches.')
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [revision, attempt, setResult])

  if (comparing && result && result.matches.length >= 2) {
    return <FinalRound matches={result.matches} revision={revision}
      onExit={() => { window.location.hash = 'shortlist' }} />
  }

  const round = result && loadRound(revision, result.matches)
  const roundFinished = round != null && round.picks.length > 0 && round.picks.length === totalPairs(round.ids.length)
  const personalized = roundFinished && round.picks.some(pick => 'winner' in pick)
  const studioMatches = result
    ? (personalized
        ? standings(round.ids, round.picks).map(id => result.matches.find(match => match.layoutId === id)!)
        : result.matches).slice(0, TOP_PICKS)
    : []

  function edit(step: Step, label: string) {
    return <button className="edit-link" onClick={() => onEdit(step)}><Pencil size={14} />Edit {label}</button>
  }

  return <main className="summary decision-page view" id="main">
    <header className="decision-hero">
      <div><div className="saved-stamp"><Check size={16} /> Brief saved on this device</div><h1 tabIndex={-1}>Your apartment decision studio</h1><p>See what fits, what you would trade off, and which facts still need confirmation before you sign.</p></div>
      <div className="decision-trust"><ShieldCheck size={21} /><p><strong>Evidence before confidence</strong><span>Every ranked fact stays tied to a source and checked date.</span></p></div>
    </header>

    <section className="decision-context" aria-label="Search summary">
      <span><strong>{money.format(setup.maxMonthlyCents / 100)}</strong> per person</span>
      {setup.householdSize && <span><strong>{setup.householdSize}</strong> {setup.householdSize === 1 ? 'person' : 'people'}</span>}
      <span><strong>{TRAVEL_LABELS[setup.travelModes[0]]}</strong> to {setup.pin.label}</span>
      <span><strong>{Object.values(setup.choices).filter((choice) => choice.required).length}</strong> must-haves</span>
      <button className="text-button" onClick={() => onEdit('budget')}>Edit search</button>
    </section>

    <section className="summary-section studio-section" id="shortlist">
      <div className="studio-heading">
        <div><span className="eyebrow">{personalized ? 'Ranked from your picks' : 'Ranked from your brief'}</span><h2>{personalized ? 'Your top picks' : 'Best-fit floor plans'}</h2></div>
        {result && result.matches.length >= 2
          ? <a className="btn-primary" href="#compare">Compare head to head <ArrowRight size={17} /></a>
          : <div className="source-note"><Database size={17} /><span>Listing sources and checked dates</span></div>}
      </div>
      {loading && !result && <div className="results-loading" role="status" aria-label="Checking current listings"><span className="spinner" aria-hidden="true" /><div><p className="results-loading-title">Finding your finalists…</p><p>Checking current listings and evidence. This usually takes a few seconds.</p></div><div className="results-loading-cards" aria-hidden="true"><span /><span /></div></div>}
      {loading && result && <p className="results-refreshing" role="status"><span className="spinner is-small" aria-hidden="true" /> Refreshing your shortlist…</p>}
      {error && <p role="alert">{error} {result && 'Showing your last saved results.'}</p>}
      {result && <DecisionStudio result={{ ...result, matches: studioMatches }} setup={setup} onEdit={onEdit} />}
      <button className="text-button" disabled={loading} onClick={() => setAttempt((value) => value + 1)}>{error ? 'Retry shortlist' : 'Refresh shortlist'}</button>
    </section>

    <section className="summary-section"><div className="summary-heading"><h2>Budget and roommates</h2>{edit('budget', 'budget')}</div><p>{money.format(setup.maxMonthlyCents / 100)} per person, including required recurring fees.</p>{setup.householdSize !== undefined && <p>{roommateCountLabel(setup.householdSize - 1)}</p>}</section>
    <section className="summary-section"><div className="summary-heading"><h2>Location &amp; travel</h2>{edit('location', 'location & travel')}</div><p>{setup.pin.label} · {setup.pin.lat.toFixed(5)}, {setup.pin.lng.toFixed(5)}</p><p>{setup.travelModes.map((mode) => TRAVEL_LABELS[mode]).join(' → ')}</p></section>
    <section className="summary-section"><div className="summary-heading"><h2>Requirements</h2>{edit('essentials', 'requirements')}</div>{Object.keys(setup.choices).length === 0 ? <p>No additional requirements selected.</p> : <ul>{Object.entries(setup.choices).map(([id, choice]) => <li key={id}>{requirementLabels[id as RequirementId]} · {choiceLabel(id as RequirementId, choice.value)}</li>)}</ul>}</section>
    <section className="summary-section"><div className="summary-heading"><h2>Your housing brief</h2>{edit('builder', 'brief')}</div>{brief.criteria.length ? <BriefMap criteria={brief.criteria} messages={brief.messages} /> : <p>You chose to match from your setup alone.</p>}</section>
    <aside className="independence-note"><ShieldCheck size={18} /><p><strong>Independent student project.</strong> Properties are privately operated. A listing on U-M’s off-campus portal is a source boundary, not University ownership, endorsement, or a guarantee. Confirm availability and lease terms directly with the property.</p></aside>
  </main>
}
