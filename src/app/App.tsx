import { lazy, Suspense, useEffect, useRef } from 'react'
import { AlertCircle, ArrowLeft } from 'lucide-react'
import Budget from './Budget'
import Summary from './Summary'
import { routePath, stepNames, steps, type Route } from './routing'
import { useQuestionnaire } from './useQuestionnaire'

const Location = lazy(() => import('../location/Location'))
const Board = lazy(() => import('../board/Board'))

const titles = {
  budget: 'What’s your maximum monthly housing budget?',
  location: 'Where do you want to be close to?',
  board: 'What matters in your apartment?',
  saved: 'Your priorities are saved',
  home: 'Ann Arbor Housing Board',
}
const instructions = {
  budget: 'Include your share of rent and required recurring housing fees.',
  location: 'Think about where you go most, like class, work or the gym. Pick one spot between those places, or pin the one you visit most. Search for a place or tap the map.',
  board: 'Choose what matters. Put your highest priorities first in each group.',
}

export default function Journey({ accountId }: { accountId: string }) {
  const { record, route, navigate, editSection, patch, confirmStep, finish, failure, retry, back } = useQuestionnaire(accountId)
  const { draft, completed } = record
  const previous = useRef<Route | null>(null)
  useEffect(() => {
    document.title = route === 'home' ? titles.home : titles[route] + ' · Ann Arbor Housing Board'
    const changed = previous.current !== null && previous.current !== route
    if (changed) {
      document.querySelector<HTMLElement>('main h1')?.focus({ preventScroll: true })
      window.scrollTo(0, 0)
    }
    previous.current = route
  }, [route])

  useEffect(() => {
    if (route !== 'home' && import.meta.env.PROD && 'serviceWorker' in navigator) {
      // First entry into the questionnaire prepares the locally hosted app for offline refresh.
      void navigator.serviceWorker.register('/sw.js').catch(() => {})
    }
  }, [route])

  function routeLink(target: Route) {
    return {
      href: target === 'home' ? '/dashboard' : routePath(target),
      onClick: (event: React.MouseEvent<HTMLAnchorElement>) => {
        if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0) return
        event.preventDefault()
        if (target === 'home') window.location.assign('/dashboard')
        else navigate(target)
      },
    }
  }
  const isQuestion = route === 'budget' || route === 'location' || route === 'board'
  return <>
    <a className="skip-link" href="#main">Skip to content</a>
    {failure && <aside className="storage-error" role="alert"><AlertCircle size={19} />
      <span>Changes couldn’t be saved on this device</span><button className="text-button" onClick={retry}>Retry</button></aside>}
    {isQuestion && <main className={'question view question-' + route} id="main">
      <div className="step-nav"><a {...routeLink(back)} className="back-link"><ArrowLeft size={16} />Back</a>
        <ol className="step-ticks" aria-label="Questionnaire progress">{steps.map((step, i) => <li key={step} aria-current={route === step ? 'step' : undefined}
          className={i <= steps.indexOf(route) ? 'step-reached' : ''} aria-label={stepNames[step]} />)}</ol>
      </div>
      <div className="question-intro"><span className="step-label">{steps.indexOf(route) + 1} of 3 · {stepNames[route]}</span>
        <h1 tabIndex={-1}>{titles[route]}</h1><p>{instructions[route]}</p></div>
      <Suspense fallback={<p role="status">Loading {stepNames[route].toLowerCase()}…</p>}>
        {route === 'budget' && <Budget value={draft.budgetInput} onChange={budgetInput => patch({ budgetInput, budgetConfirmed: false })} onContinue={confirmStep} />}
        {route === 'location' && <Location pin={draft.idealLocation} ranking={draft.rankedTravelModes}
          onPin={idealLocation => patch({ idealLocation, locationConfirmed: false })}
          onRanking={rankedTravelModes => patch({ rankedTravelModes, locationConfirmed: false })} onContinue={confirmStep} />}
        {route === 'board' && <Board placements={draft.placements} mode={draft.rankedTravelModes[0]}
          onChange={placements => patch({ placements })} onSave={() => finish()} />}
      </Suspense>
    </main>}
    {route === 'saved' && completed && <Summary profile={completed} onEdit={editSection} editInProgress={draft.editing} />}
  </>
}
