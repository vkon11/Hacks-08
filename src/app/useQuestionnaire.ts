import { useCallback, useEffect, useRef, useState } from 'react'
import { completeRecord, draftFromProfile, firstIncomplete, freshRecord, loadRecord, saveRecord, type Draft, type GuestRecord, type Step } from '../model'
import { currentRoute, guardRoute, routePath, steps, type Route } from './routing'

type Failure = 'read' | 'write' | 'complete' | null

export function useQuestionnaire(accountId?: string) {
  const [initial] = useState(() => {
    try { return { record: loadRecord(accountId), failure: null as Failure } }
    catch { return { record: freshRecord(), failure: 'read' as Failure } }
  })
  const [record, setRecord] = useState(initial.record)
  const live = useRef(record)
  const [failure, setFailure] = useState<Failure>(initial.failure)
  const [route, setRoute] = useState<Route>(() => guardRoute(currentRoute(), firstIncomplete(record.draft), !!record.completed))

  const apply = useCallback((next: GuestRecord) => {
    live.current = next
    setRecord(next)
  }, [])

  const storeDraft = useCallback((draft: Draft) => {
    const next = { ...live.current, draft }
    apply(next)
    try {
      saveRecord(next, accountId)
      setFailure(null)
    } catch { setFailure('write') }
  }, [accountId, apply])

  const navigate = useCallback((requested: Route, replace = false) => {
    const { draft, completed } = live.current
    const next = guardRoute(requested, firstIncomplete(draft), !!completed)
    if (next !== 'home' && next !== 'saved') {
      const switchingEdit = completed && draft.editing !== next
      if (switchingEdit || draft.step !== next || !draft.started) {
        const base = switchingEdit ? draftFromProfile(completed) : draft
        storeDraft({ ...base, started: true, step: next, editing: completed ? next : null })
      }
    }
    const path = routePath(next)
    if (window.location.pathname !== path) {
      if (replace) window.history.replaceState(null, '', path)
      else window.history.pushState(null, '', path)
    }
    setRoute(next)
  }, [storeDraft])

  useEffect(() => {
    const sync = () => navigate(currentRoute(), true)
    sync()
    window.addEventListener('popstate', sync)
    return () => window.removeEventListener('popstate', sync)
  }, [navigate])

  function patch(patch: Partial<Draft>) {
    storeDraft({ ...live.current.draft, ...patch })
  }

  function finish(draft = live.current.draft) {
    const working = { ...live.current, draft }
    const next = completeRecord(working)
    try {
      saveRecord(next, accountId)
    } catch {
      apply(working)
      setFailure('complete')
      return
    }
    apply(next)
    setFailure(null)
    navigate('saved')
  }

  function editSection(step: Step) {
    const { draft, completed } = live.current
    if (completed && draft.editing !== step) {
      storeDraft({ ...draftFromProfile(completed), step, editing: step })
    }
    navigate(step)
  }

  function confirmStep() {
    const current = live.current.draft
    const draft = { ...current, ...(route === 'budget' ? { budgetConfirmed: true } : { locationConfirmed: true }) }
    if (current.editing) return finish(draft)
    const nextStep = route === 'budget' ? 'location' : 'board'
    storeDraft({ ...draft, step: nextStep })
    navigate(nextStep)
  }

  function retry() {
    if (failure === 'complete') return finish()
    if (failure === 'read') {
      try {
        apply(loadRecord(accountId))
        setFailure(null)
        navigate(currentRoute(), true)
      } catch { setFailure('read') }
      return
    }
    storeDraft(live.current.draft)
  }

  const resume = record.completed && !record.draft.editing
    ? 'saved' : guardRoute(record.draft.step, firstIncomplete(record.draft), !!record.completed)
  const back: Route = record.draft.editing ? 'saved' : steps[steps.indexOf(record.draft.step) - 1] ?? 'home'
  return { record, route, navigate, editSection, patch, confirmStep, finish, retry, failure, resume, back }
}
