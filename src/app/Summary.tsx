import { useEffect, useRef, useState } from 'react'
import { ArrowUpRight, Check, ChevronDown, PanelRightClose, PanelRightOpen, Pencil } from 'lucide-react'
import { TRAVEL_LABELS, type Profile, type Step } from '../model'
import type { MatchResult } from '../../server/matching'
import { BriefMap } from '../ideal/BriefMap'
import { choiceLabel, requirementLabels, type RequirementId } from '../ideal/contracts'
import { matchResultSchema } from '../ideal/matchResult'
import { requestHousing } from '../ideal/api'
import FinalRound from '../ideal/FinalRound'

const money = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2
})
function OfferResults({ result }: { result: MatchResult }) {
  if (result.status === 'no_inventory')
    return <p>Apartment listings are coming soon. Your brief is ready to match when they arrive.</p>
  return (
    <>
      {result.matches.length === 0 ? (
        <p>No verified floor plan meets all your requirements.</p>
      ) : (
        <>
          <p>
            {result.matches.length} of {result.qualifiedLayouts} qualifying floor{' '}
            {result.qualifiedLayouts === 1 ? 'plan' : 'plans'}.{' '}
            {result.assessedLayouts > 0 &&
              result.assessedLayouts + ' layouts assessed for the details in your brief.'}
          </p>
          <ol className="shortlist">
            {result.matches.map((m) => (
              <li key={m.layoutId}>
                <details>
                  <summary className="shortlist-summary">
                    <h3>
                      {m.layoutName} <span>· {m.buildingName}</span>
                    </h3>
                    <span className="shortlist-price">
                      {money.format(m.monthlyCents / 100)} per person / month
                    </span>
                    <ChevronDown size={18} aria-hidden="true" />
                  </summary>
                  <p>
                    {m.address} · {m.optionName}
                  </p>
                  <p>Rent includes required recurring fees.</p>
                  {m.commuteMinutes !== null && (
                    <p>
                      Estimated trip to your pin · {m.commuteMinutes} min{' '}
                      {m.routeBasis && '· ' + m.routeBasis}
                    </p>
                  )}
                  {m.reasons.length > 0 && (
                    <ul>
                      {m.reasons.map((reason) => (
                        <li key={reason}>{reason}</li>
                      ))}
                    </ul>
                  )}
                  {m.coverage !== null && (
                    <p>Evidence covers {Math.round(m.coverage * 100)}% of your selected preference weight.</p>
                  )}
                  {m.unknowns.length > 0 && <p>Still to confirm · {m.unknowns.join(' · ')}</p>}
                  <p>
                    {m.availableFrom ? 'Listed start date ' + m.availableFrom : 'Start date unlisted'}
                    {m.availableUntil && ' · Listed end date ' + m.availableUntil} · Confirm current
                    availability with the property.
                  </p>
                  <a href={m.sourceUrl} target="_blank" rel="noreferrer">
                    Offer source <ArrowUpRight size={13} />
                  </a>{' '}
                  · Checked {m.checkedAt}
                  {m.evidence.length > 0 && (
                    <details>
                      <summary>Sources for this match</summary>
                      <ul>
                        {m.evidence.map((e) => (
                          <li key={e.id}>
                            <a href={e.sourceUrl} target="_blank" rel="noreferrer">
                              {e.label}
                            </a>{' '}
                            · {e.checkedAt}
                            <p>{e.text}</p>
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </details>
              </li>
            ))}
          </ol>
        </>
      )}
      {result.qualitativeStatus === 'unavailable' && (
        <p>Some details in your brief could not be assessed. The shortlist uses the evidence available.</p>
      )}
      {result.routingUnavailable && <p>Some trips could not be verified for your main travel mode.</p>}
      {result.needsConfirmation.length > 0 && (
        <details>
          <summary>Needs confirmation ({result.needsConfirmation.length} offers)</summary>
          <ul>
            {result.needsConfirmation.map((m) => (
              <li key={m.offerId}>
                <strong>
                  {m.buildingName} · {m.layoutName} · {m.optionName}
                </strong>
                <p>{m.reasons.join(' · ')}</p>
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  )
}
export default function Summary({
  profile,
  onEdit,
  setResult
}: {
  profile: Profile
  onEdit: (step: Step) => void
  setResult: (revision: string, result: MatchResult) => void
}) {
  const [attempt, setAttempt] = useState(0)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [inputsOpen, setInputsOpen] = useState(true)
  const { setup, brief, revision, result } = profile
  const currentProfile = useRef(profile)
  currentProfile.current = profile
  useEffect(() => {
    const { setup, brief } = currentProfile.current
    const controller = new AbortController()
    setLoading(true)
    setError('')
    void requestHousing<MatchResult>('rank', { setup, criteria: brief.criteria }, controller.signal)
      .then((r) => {
        if (!controller.signal.aborted) setResult(revision, matchResultSchema.parse(r))
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Could not update matches.')
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [revision, attempt, setResult])
  function edit(step: Step, label: string) {
    return (
      <button className="edit-link" onClick={() => onEdit(step)}>
        <Pencil size={14} />
        Edit {label}
      </button>
    )
  }
  return (
    <main className={'summary results-page view' + (inputsOpen ? ' has-inputs' : '')} id="main">
      <div className="results-top">
        <div className="saved-stamp">
          <Check size={16} /> Saved on this device
        </div>
        <button
          className="text-button inputs-toggle"
          aria-expanded={inputsOpen}
          aria-controls="your-inputs"
          onClick={() => setInputsOpen((open) => !open)}
        >
          {inputsOpen ? (
            <PanelRightClose size={17} aria-hidden="true" />
          ) : (
            <PanelRightOpen size={17} aria-hidden="true" />
          )}
          {inputsOpen ? 'Hide your inputs' : 'Show your inputs'}
        </button>
      </div>
      <h1 tabIndex={-1}>Your housing brief is saved</h1>
      <div className="results-layout">
        <div className="results-main">
          {result?.status === 'ready' && result.matches.length >= 2 && (
            <FinalRound matches={result.matches} revision={revision} />
          )}
          <section className="summary-section" id="shortlist">
            <h2>Your floor plan shortlist</h2>
            <p>
              {TRAVEL_LABELS[setup.travelModes[0]]} to {setup.pin.label}
              {setup.travelModes[0] === 'bus' && ' · representative weekday transit estimate'}
            </p>
            {loading && <p role="status">Checking current listings…</p>}
            {error && (
              <p role="alert">
                {error} {result && 'Showing your last saved results.'}
              </p>
            )}
            {result && <OfferResults result={result} />}
            <button className="text-button" disabled={loading} onClick={() => setAttempt((n) => n + 1)}>
              {error ? 'Retry shortlist' : 'Refresh shortlist'}
            </button>
          </section>
        </div>
        {inputsOpen && (
          <aside className="inputs-sidebar" id="your-inputs" aria-label="Your inputs">
            <p className="saved-next">
              Your budget, destination, travel order, requirements and housing brief are saved under your
              account in this browser.
            </p>
            <section className="summary-section">
              <div className="summary-heading">
                <h2>Monthly budget</h2>
                {edit('budget', 'budget')}
              </div>
              <p>
                {money.format(setup.maxMonthlyCents / 100)} per person, including required recurring fees.
              </p>
            </section>
            <section className="summary-section">
              <div className="summary-heading">
                <h2>Location &amp; travel</h2>
                {edit('location', 'location & travel')}
              </div>
              <p>
                {setup.pin.label} · {setup.pin.lat.toFixed(5)}, {setup.pin.lng.toFixed(5)}
              </p>
              <p>{setup.travelModes.map((m) => TRAVEL_LABELS[m]).join(' → ')}</p>
            </section>
            <section className="summary-section">
              <div className="summary-heading">
                <h2>Requirements &amp; preferences</h2>
                {edit('essentials', 'requirements')}
              </div>
              {Object.keys(setup.choices).length === 0 ? (
                <p>No additional requirements selected.</p>
              ) : (
                <ul>
                  {Object.entries(setup.choices).map(([id, c]) => (
                    <li key={id}>
                      {requirementLabels[id as RequirementId]} · {choiceLabel(id as RequirementId, c.value)} ·{' '}
                      {c.required ? 'Required' : 'Flexible'}
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section className="summary-section">
              <div className="summary-heading">
                <h2>Your housing brief</h2>
                {edit('builder', 'brief')}
              </div>
              {brief.criteria.length ? (
                <BriefMap criteria={brief.criteria} messages={brief.messages} />
              ) : (
                <p>You chose to match from your setup alone.</p>
              )}
            </section>
          </aside>
        )}
      </div>
    </main>
  )
}
