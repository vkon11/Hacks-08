import { lazy, Suspense, useEffect, useRef } from 'react'
import { AlertCircle, ArrowLeft } from 'lucide-react'
import Budget from './Budget'
import Summary from './Summary'
import { routePath, stepNames, steps, type Route } from './routing'
import { useQuestionnaire } from './useQuestionnaire'
import { useBuilder } from '../ideal/useBuilder'
import { choiceLabel, requirementLabels, type RequirementId } from '../ideal/contracts'
import { TRAVEL_LABELS } from '../model/inputs'

const Location = lazy(() => import('../location/Location'))
const Essentials = lazy(() => import('../ideal/Essentials').then((m) => ({ default: m.Essentials })))
const Builder = lazy(() => import('../ideal/Builder').then((m) => ({ default: m.Builder })))
const titles = {
  budget: 'What’s your maximum monthly housing budget?',
  location: 'Where do you want to be close to?',
  essentials: 'What does your apartment need?',
  builder: 'Describe your ideal apartment',
  saved: 'Your housing brief is saved',
  home: 'Dashboard'
}
const instructions = {
  budget: 'Include your share of rent and required recurring housing fees.',
  location:
    'Think about where you go most, like class, work or the gym. Pick a spot between those places, or pin the one you visit most. Then rank how you get around.',
  essentials:
    'Pick any details that matter. Mark one as required if you’d rule out a place without it. You can also skip straight to your brief.',
  builder:
    'A few words are enough. Tell us what an ordinary day, a good night in, or having friends over looks like for you.'
}
export default function Journey({ accountId }: { accountId: string }) {
  const {
    record,
    live,
    route,
    navigate,
    edit,
    changeSetup,
    patch,
    confirmStep,
    finish,
    setResult,
    failure,
    retry
  } = useQuestionnaire(accountId)
  const d = record.draft
  const builder = useBuilder(route === 'builder', d, live, patch)
  const previous = useRef<Route | null>(null)
  useEffect(() => {
    document.title = titles[route] + ' · Ann Arbor Housing Board'
    if (previous.current && previous.current !== route) {
      document.querySelector<HTMLElement>('main h1')?.focus({ preventScroll: true })
      window.scrollTo(0, 0)
    }
    previous.current = route
  }, [route])
  useEffect(() => {
    if (import.meta.env.PROD && 'serviceWorker' in navigator)
      void navigator.serviceWorker.register('/sw.js').catch(() => {})
  }, [])
  const ask = route !== 'home' && route !== 'saved'
  const back = ask ? (steps[steps.indexOf(route) - 1] ?? 'home') : 'home'
  const mode = d.rankedTravelModes[0] ?? 'walk'
  const summary = Object.entries(d.choices)
    .map(
      ([id, c]) =>
        requirementLabels[id as RequirementId] +
        ' · ' +
        choiceLabel(id as RequirementId, c.value) +
        (c.required ? ' (required)' : ' (flexible)')
    )
    .join(' • ')
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      {failure && (
        <aside className="storage-error" role="alert">
          <AlertCircle size={19} />
          <span>Changes couldn’t be saved on this device</span>
          <button className="text-button" onClick={retry}>
            Retry
          </button>
        </aside>
      )}
      {ask && (
        <main className={'question view question-' + route} id="main">
          <div className="step-nav">
            <a
              className="back-link"
              href={back === 'home' ? '/dashboard' : routePath(back)}
              onClick={(event) => {
                if (back !== 'home' && !event.metaKey && !event.ctrlKey && !event.shiftKey) {
                  event.preventDefault()
                  navigate(back)
                }
              }}
            >
              <ArrowLeft size={16} />
              Back
            </a>
            <ol className="step-ticks" aria-label="Questionnaire progress">
              {steps.map((s, i) => (
                <li
                  key={s}
                  aria-current={s === route ? 'step' : undefined}
                  className={i <= steps.indexOf(route) ? 'step-reached' : ''}
                  aria-label={stepNames[s]}
                />
              ))}
            </ol>
          </div>
          <header className="question-intro">
            <span className="step-label">
              {steps.indexOf(route) + 1} of {steps.length} · {stepNames[route]}
            </span>
            <h1 tabIndex={-1}>{titles[route]}</h1>
            <p>{instructions[route]}</p>
          </header>
          <Suspense fallback={<p role="status">Loading {stepNames[route].toLowerCase()}…</p>}>
            {route === 'budget' && (
              <Budget
                value={d.budgetInput}
                onChange={(budgetInput) => changeSetup({ budgetInput, budgetConfirmed: false })}
                onContinue={confirmStep}
              />
            )}
            {route === 'location' && (
              <Location
                pin={d.idealLocation}
                ranking={d.rankedTravelModes}
                onPin={(idealLocation) => changeSetup({ idealLocation, locationConfirmed: false })}
                onRanking={(rankedTravelModes) =>
                  changeSetup({ rankedTravelModes, locationConfirmed: false })
                }
                onContinue={confirmStep}
              />
            )}
            {route === 'essentials' && (
              <Essentials
                choices={d.choices}
                mode={mode}
                onChange={(choices) => changeSetup({ choices, essentialsConfirmed: false })}
                onContinue={confirmStep}
              />
            )}
            {route === 'builder' && (
              <Builder
                {...builder}
                messages={d.messages}
                criteria={d.criteria}
                checkpoint={d.checkpoint}
                checkpointBase={d.checkpointBase}
                clarification={d.clarification}
                setupLabel={
                  '$' +
                  Number(d.budgetInput).toLocaleString() +
                  '/person · ' +
                  TRAVEL_LABELS[mode] +
                  ' to ' +
                  d.idealLocation?.label
                }
                essentialsLabel={summary || 'Budget and location only'}
                onResults={finish}
              />
            )}
          </Suspense>
        </main>
      )}
      {route === 'saved' && record.completed && (
        <Summary profile={record.completed} onEdit={edit} setResult={setResult} />
      )}
    </>
  )
}
