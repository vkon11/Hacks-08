import { useCallback, useEffect, useRef, useState } from 'react'
import {
  completeRecord,
  firstIncomplete,
  freshRecord,
  loadRecord,
  MATCH_RESULT_VERSION,
  pendingIdeas,
  saveRecord,
  storageKey,
  type Draft,
  type HousingRecord,
  type Step
} from '../model'
import { currentRoute, guardRoute, routePath, steps, type Route } from './routing'
import type { MatchResult } from '../../server/matching'

export function useQuestionnaire(accountId: string) {
  const [initial] = useState(() => {
    try {
      return { record: loadRecord(accountId), error: false }
    } catch {
      return { record: freshRecord(), error: true }
    }
  })
  const [record, setRecord] = useState(initial.record)
  const live = useRef(record)
  const [failure, setFailure] = useState<'read' | 'write' | 'complete' | null>(initial.error ? 'read' : null)
  const [route, setRoute] = useState(() =>
    guardRoute(currentRoute(), firstIncomplete(record.draft), !!record.completed)
  )
  const apply = useCallback((next: HousingRecord) => {
    live.current = next
    setRecord(next)
  }, [])
  const store = useCallback(
    (next: HousingRecord) => {
      apply(next)
      try {
        saveRecord(next, accountId)
        setFailure(null)
      } catch {
        setFailure('write')
      }
    },
    [accountId, apply]
  )
  const patch = useCallback(
    (changes: Partial<Draft>) => {
      const r = live.current
      store({ ...r, draft: { ...r.draft, ...changes } })
    },
    [store]
  )
  const navigate = useCallback(
    (requested: Route, replace = false) => {
      const r = live.current
      const next = guardRoute(requested, firstIncomplete(r.draft), !!r.completed)
      if (
        next !== 'home' &&
        next !== 'saved' &&
        (next !== r.draft.step || !r.draft.started || (r.completed && !r.draft.editing))
      ) {
        patch({ step: next, started: true, editing: !!r.completed })
      }
      if (window.location.pathname !== routePath(next))
        window.history[replace ? 'replaceState' : 'pushState'](null, '', routePath(next))
      setRoute(next)
    },
    [patch]
  )
  useEffect(() => {
    const sync = () => navigate(currentRoute(), true)
    sync()
    window.addEventListener('popstate', sync)
    return () => window.removeEventListener('popstate', sync)
  }, [navigate])
  useEffect(() => {
    function syncAccount(event: StorageEvent) {
      if (event.key !== storageKey(accountId)) return
      try {
        const nextRecord = loadRecord(accountId)
        apply(nextRecord)
        const next = guardRoute(currentRoute(), firstIncomplete(nextRecord.draft), !!nextRecord.completed)
        if (window.location.pathname !== routePath(next))
          window.history.replaceState(null, '', routePath(next))
        setRoute(next)
      } catch {
        setFailure('read')
      }
    }
    window.addEventListener('storage', syncAccount)
    return () => window.removeEventListener('storage', syncAccount)
  }, [accountId, apply])
  function edit(step: Step) {
    const r = live.current
    if (r.completed && !r.draft.editing) patch({ ...r.completed.brief, editing: true })
    navigate(step)
  }
  function changeSetup(changes: Partial<Draft>) {
    const d = live.current.draft
    const newMode = changes.rankedTravelModes
    if (newMode && newMode[0] !== d.rankedTravelModes[0] && d.choices.commute) {
      const { commute: _, ...choices } = d.choices
      changes = { ...changes, choices, essentialsConfirmed: false }
    }
    patch({ ...changes, checkpoint: false, accepted: false })
  }
  function confirmStep() {
    if (route === 'home' || route === 'saved') return
    const next = steps[steps.indexOf(route) + 1]
    if (!next) return
    patch(
      route === 'budget'
        ? { budgetConfirmed: true }
        : route === 'location'
          ? { locationConfirmed: true }
          : { essentialsConfirmed: true }
    )
    navigate(next)
  }
  function finish() {
    const current = live.current
    if (firstIncomplete(current.draft) !== 'builder' || !current.draft.checkpoint || pendingIdeas(current.draft))
      return
    const next = completeRecord(current)
    try {
      saveRecord(next, accountId)
    } catch {
      setFailure('complete')
      return
    }
    apply(next)
    setFailure(null)
    navigate('saved')
  }
  const setResult = useCallback(
    (revision: string, result: MatchResult) => {
      const r = live.current
      if (r.completed?.revision === revision)
        store({ ...r, completed: { ...r.completed, rankingVersion: MATCH_RESULT_VERSION, result } })
    },
    [store]
  )
  function retry() {
    if (failure === 'complete') return finish()
    if (failure === 'read') {
      try {
        apply(loadRecord(accountId))
        setFailure(null)
        navigate(currentRoute(), true)
      } catch {
        setFailure('read')
      }
    } else store(live.current)
  }
  return {
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
  }
}
