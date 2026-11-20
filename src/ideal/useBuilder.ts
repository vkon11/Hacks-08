import { useEffect, useRef, useState } from 'react'
import { changedIdeas, newId, pendingIdeas, setupFromDraft, type Draft, type HousingRecord } from '../model'
import { hasProvenance, interpretationSchema, type Criterion, type Message } from './contracts'
import { requestHousing } from './api'

const checkpointIdeaCount = 4
const previewDelay = 800

type Interpretation = ReturnType<typeof interpretationSchema.parse>
type BriefPreview = {
  base: Draft
  message: Message
  output: Interpretation | null
}

async function requestInterpretation(before: Draft, messages: Message[], signal: AbortSignal, revisit = false) {
  const response = await requestHousing(
    'interpret',
    {
      setup: setupFromDraft(before),
      messages,
      criteria: before.criteria,
      interpretedThrough: revisit ? null : before.interpretedThrough
    },
    signal
  )
  const result = interpretationSchema.parse(response)
  if (!hasProvenance(result.criteria, messages))
    throw Error('The interpretation could not be verified. Retry to update your brief.')
  return result
}

export function useBuilder(
  active: boolean,
  draft: Draft,
  live: React.RefObject<HousingRecord>,
  patch: (v: Partial<Draft>) => void
) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [ideaText, setIdeaText] = useState('')
  const [preview, setPreview] = useState<BriefPreview | null>(null)
  const processing = useRef<AbortController | null>(null)
  const trimmedIdea = ideaText.trim()
  const previewEnabled = active && draft.checkpoint && !!trimmedIdea && !busy && !error && !pendingIdeas(draft)
  const currentPreview =
    previewEnabled && preview?.base === draft && preview.message.text === trimmedIdea ? preview : null
  const previewStatus = previewEnabled
    ? currentPreview ? currentPreview.output ? 'ready' as const : 'failed' as const : 'updating' as const
    : null
  const setupKey = active && draft.essentialsConfirmed ? JSON.stringify(setupFromDraft(draft)) : ''
  useEffect(() => {
    if (!setupKey) return
    const controller = new AbortController()
    setFilterStatus('Checking your budget and requirements…')
    void requestHousing<{ message: string }>(
      'filter',
      { setup: JSON.parse(setupKey) },
      controller.signal
    ).then(
      (data) => {
        if (!controller.signal.aborted) setFilterStatus(data.message)
      },
      () => {
        if (!controller.signal.aborted)
          setFilterStatus('We’ll check listings again when you open your shortlist.')
      }
    )
    return () => controller.abort()
  }, [setupKey])
  useEffect(() => {
    if (active) {
      setError(
        pendingIdeas(live.current.draft)
          ? 'Your last message still needs interpretation. Retry to update your brief.'
          : ''
      )
      setBusy(false)
    }
    return () => {
      processing.current?.abort()
      processing.current = null
    }
  }, [active, live])
  useEffect(() => {
    if (!previewEnabled) return
    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      const message: Message = { id: newId(), role: 'student', text: trimmedIdea }
      try {
        const output = await requestInterpretation(draft, [...draft.messages, message], controller.signal)
        if (!controller.signal.aborted) setPreview({ base: draft, message, output })
      } catch {
        if (!controller.signal.aborted) setPreview({ base: draft, message, output: null })
      }
    }, previewDelay)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [draft, previewEnabled, trimmedIdea])

  function applyInterpretation(before: Draft, messages: Message[], out: Interpretation, review: boolean) {
    const newCheckpoint =
      review || changedIdeas(before.checkpointBase, out.criteria) >= checkpointIdeaCount
    patch({
      messages,
      criteria: out.criteria,
      clarification: out.clarification,
      interpretedThrough: messages.filter((message) => message.role === 'student').at(-1)?.id ?? null,
      checkpoint: newCheckpoint || before.checkpoint,
      checkpointBase: newCheckpoint ? out.criteria : before.checkpointBase,
      accepted: false
    })
  }

  async function interpret(messages: Message[], review: boolean) {
    const before = live.current.draft
    const studentMessages = messages.filter((message) => message.role === 'student')
    // Read the opening messages together once the student has shared a few ideas.
    // Short fragments can be easier to interpret in the context of the whole conversation.
    const revisitOpening =
      !before.checkpoint && before.checkpointBase.length === 0 &&
      (studentMessages.length === checkpointIdeaCount || studentMessages.length === checkpointIdeaCount + 1)
    const controller = new AbortController()
    processing.current?.abort()
    processing.current = controller
    setBusy(true)
    setError('')
    try {
      const out = await requestInterpretation(before, messages, controller.signal, revisitOpening)
      if (controller.signal.aborted || live.current.draft.messages !== messages) return
      applyInterpretation(before, messages, out, review)
    } catch (e) {
      if (!controller.signal.aborted)
        setError(e instanceof Error ? e.message : 'Could not interpret that message. Please retry.')
    } finally {
      if (processing.current === controller) {
        processing.current = null
        setBusy(false)
      }
    }
  }
  function send(text: string) {
    const trimmed = text.trim()
    if (!trimmed) return
    const before = live.current.draft
    setIdeaText('')
    setPreview(null)
    // A send while the model is still reading never drops the message: it joins the conversation and the
    // interpretation restarts with every unread message (interpret aborts the request in flight).
    if (
      !processing.current &&
      currentPreview?.base === before &&
      currentPreview.message.text === trimmed &&
      currentPreview.output
    ) {
      applyInterpretation(before, [...before.messages, currentPreview.message], currentPreview.output, false)
      return
    }
    const messages: Message[] = [...before.messages, { role: 'student', text: trimmed, id: newId() }]
    patch({ messages, accepted: false })
    void interpret(messages, false)
  }
  function review() {
    const d = live.current.draft
    if (pendingIdeas(d)) {
      void interpret(d.messages, true)
      return
    }
    patch({ checkpoint: true, checkpointBase: d.criteria })
  }
  function discardPending() {
    const d = live.current.draft
    processing.current?.abort()
    processing.current = null
    const boundary = d.messages.findIndex((m) => m.id === d.interpretedThrough)
    patch({
      messages: d.messages.slice(0, boundary + 1),
      checkpoint: true,
      accepted: false,
      checkpointBase: d.criteria,
      clarification: null
    })
    setBusy(false)
    setError('')
  }
  const studentMessages = draft.messages.filter((message) => message.role === 'student')
  const readThrough = studentMessages.findIndex((message) => message.id === draft.interpretedThrough)
  return {
    busy,
    error,
    unreadMessageIds: studentMessages.slice(readThrough + 1).map((message) => message.id),
    filterStatus,
    resultReady: draft.checkpoint && !pendingIdeas(draft) && !busy && !error && !trimmedIdea,
    ideaText,
    onIdeaChange: setIdeaText,
    preview: currentPreview?.output ? { ...currentPreview.output, message: currentPreview.message } : null,
    previewStatus,
    onSend: send,
    onReview: review,
    onUseSetup: review,
    onDiscardPending: discardPending,
    onRetry: () => {
      void interpret(live.current.draft.messages, true)
    }
  }
}
