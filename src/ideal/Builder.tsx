import { useEffect, useRef, useState, type FormEvent, type ReactNode, type Ref } from 'react'
import { ArrowRight, ArrowUp, Check, CircleAlert, GitFork, Home, X } from 'lucide-react'
import { BriefMap } from './BriefMap'
import type { Criterion, Message } from './contracts'
import './ui.css'

const suggestionSets = [
  ['Living room for friends', 'Space for a desk', 'In-unit laundry'],
  ['No carpet', 'Natural light', 'Somewhere to keep my bike'],
  ['Kitchen prep space', 'A quiet bedroom', 'A balcony or patio'],
] as const
const mobileBriefQuery = '(max-width: 730px)'

interface BuilderProps {
  setupLabel: string
  essentialsLabel: string
  messages: Message[]
  criteria: Criterion[]
  checkpoint: boolean
  checkpointBase: Criterion[]
  resultReady: boolean
  clarification?: string | null
  busy: boolean
  error: string
  unreadMessageIds: string[]
  filterStatus: string
  ideaText: string
  onIdeaChange: (text: string) => void
  preview: { criteria: Criterion[]; message: Message; clarification: string | null } | null
  previewStatus: 'updating' | 'ready' | 'failed' | null
  onSend: (text: string) => void
  onReview: () => void
  onUseSetup: () => void
  onResults: () => void
  onRetry: () => void
  onDiscardPending?: () => void
}

export function Builder({
  setupLabel, essentialsLabel, messages, criteria, checkpoint, checkpointBase, resultReady, clarification, busy, error, unreadMessageIds,
  filterStatus, ideaText, onIdeaChange, preview, previewStatus,
  onSend, onReview, onUseSetup, onResults, onRetry, onDiscardPending,
}: BuilderProps) {
  const [mobile, setMobile] = useState(() => window.matchMedia(mobileBriefQuery).matches)
  const dialog = useRef<HTMLDialogElement>(null)
  const composer = useRef<HTMLTextAreaElement>(null)
  const briefComposer = useRef<HTMLTextAreaElement>(null)
  const briefContent = useRef<HTMLDivElement>(null)
  const log = useRef<HTMLDivElement>(null)
  const review = useRef<HTMLHeadingElement>(null)
  const lastOpenedCheckpoint = useRef<Criterion[] | null>(null)
  const hasUnsentIdea = !!ideaText.trim()
  const studentCount = messages.filter(message => message.role === 'student').length
  const suggestions = suggestionSets[studentCount % suggestionSets.length]
  const unread = new Set(unreadMessageIds)
  const reading = busy && unread.size > 0
  const readingLabel = 'Reading ' + (unread.size === 1 ? 'your new idea' : unread.size + ' new ideas') + '…'

  useEffect(() => {
    if (log.current) log.current.scrollTop = log.current.scrollHeight
  }, [messages, busy, error])

  useEffect(() => {
    const media = window.matchMedia(mobileBriefQuery)
    const update = () => setMobile(media.matches)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    if (!checkpoint || busy || error || lastOpenedCheckpoint.current === checkpointBase) return
    lastOpenedCheckpoint.current = checkpointBase
    if (mobile) {
      if (dialog.current && !dialog.current.open) dialog.current.showModal()
    } else {
      review.current?.scrollIntoView({ behavior: 'instant', block: 'nearest' })
    }
  }, [checkpoint, checkpointBase, busy, error, mobile])

  useEffect(() => {
    if (!preview) return
    const container = briefContent.current
    const updatedCard = container?.querySelector('[data-preview-idea]')
    if (!container || !updatedCard) return
    const card = updatedCard.getBoundingClientRect()
    const panel = container.getBoundingClientRect()
    if (card.bottom > panel.bottom || card.top < panel.top) container.scrollTop += card.top - panel.top
  }, [preview])

  function send(text: string) {
    if (!text.trim()) return
    onSend(text)
    focusComposer()
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    send(ideaText)
  }

  function focusComposer() {
    const input = dialog.current?.open ? briefComposer.current : composer.current
    input?.focus()
  }

  function composerInput(id: string, ref: Ref<HTMLTextAreaElement>) {
    return <>
      <label className="ideal-sr-only" htmlFor={id}>Your ideas</label>
      <div className="builder-input">
        <textarea id={id} ref={ref} rows={2} maxLength={4000} value={ideaText}
          onChange={event => onIdeaChange(event.target.value)}
          placeholder={checkpoint ? 'Add an idea or tell us what to change…' : 'Drop your thoughts here. Fragments are fine.'}
          onKeyDown={event => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault()
              send(ideaText)
            }
          }} />
        <button className="btn-primary builder-send" type="submit" disabled={!hasUnsentIdea}>
          <span className="ideal-sr-only">Send</span><ArrowUp size={20} aria-hidden="true" />
        </button>
      </div>
    </>
  }

  function errorNotice() {
    return error && <div className="builder-error" role="alert">
      <CircleAlert size={19} aria-hidden="true" /><span>{error}</span>
      <div className="builder-error-actions">
        <button className="text-button" type="button" disabled={busy} onClick={onRetry}>Retry</button>
        {onDiscardPending && <button className="text-button" type="button" disabled={busy} onClick={onDiscardPending}>Set aside unprocessed messages</button>}
      </div>
    </div>
  }

  function matchesButton() {
    const waiting = reading || (unread.size > 0 && !error)
    return <button className="btn-primary" type="button" disabled={!resultReady} onClick={() => {
      dialog.current?.close()
      onResults()
    }}>
      {waiting ? <><span className="spinner is-small" aria-hidden="true" />Waiting for your brief…</>
        : <>Show my matches <ArrowRight size={17} aria-hidden="true" /></>}
    </button>
  }

  function panel(mobile: boolean): ReactNode {
    return <>
      <div className="builder-brief-heading">
        <span className="builder-mark"><GitFork size={17} aria-hidden="true" /></span>
        <h2 ref={mobile ? undefined : review} id={mobile ? 'mobile-brief-heading' : undefined}>{checkpoint ? 'What I’m hearing' : 'Your housing brief'}</h2>
        {mobile && <button className="brief-close" aria-label="Close housing brief" type="button"
          onClick={() => dialog.current?.close()}><X size={21} aria-hidden="true" /></button>}
      </div>
      {checkpoint ? <>
        <p className={'brief-preview-status' + (reading ? ' is-reading' : '')} role="status">
          {reading ? <><span className="spinner is-small" aria-hidden="true" />{readingLabel}</>
            : previewStatus === 'ready' ? 'Preview · Send to keep your idea.'
              : previewStatus === 'updating' ? <><span className="spinner is-small" aria-hidden="true" />Previewing your idea…</>
                : previewStatus === 'failed' ? 'Preview unavailable. Send to try again.'
                  : unread.size === 0 ? <><Check size={14} aria-hidden="true" /> Brief up to date · {criteria.length} {criteria.length === 1 ? 'idea' : 'ideas'}</> : ''}
        </p>
        <div ref={briefContent} className="builder-brief-content" role="region" aria-label="Brief details" tabIndex={0}>
          <BriefMap criteria={preview?.criteria ?? criteria}
            messages={preview ? [...messages, preview.message] : messages} previewMessageId={preview?.message.id}
            setupLabel={setupLabel} essentialsLabel={essentialsLabel} />
          {clarification && !hasUnsentIdea && <div className="brief-clarification"><strong>A detail you can add</strong><p>{clarification}</p></div>}
        </div>
        {mobile && <>
          {errorNotice()}
          <div className="builder-mobile-controls">
            <form className="builder-brief-composer" onSubmit={submit}>{composerInput('brief-ideas', briefComposer)}</form>
            {matchesButton()}
          </div>
        </>}
      </> : <div className="builder-empty-brief">
        <div className="builder-empty-graph" aria-hidden="true">
          <i /><Home size={23} strokeWidth={1.5} /><i />
        </div>
        <p>{criteria.length > 0 ? 'A few ideas are taking shape. Add more or review what you’ve shared.' : 'Your ideas will come together here after you send a few thoughts.'}</p>
      </div>}
    </>
  }

  return <div className="ideal-builder">
    <div className="builder-setup">
      <Home size={18} aria-hidden="true" />
      <p><strong>{setupLabel}</strong><span>{essentialsLabel}</span></p>
      {mobile && <button className="builder-mobile-open text-button" type="button" onClick={() => dialog.current?.showModal()}>Open brief</button>}
    </div>
    <div className="builder-columns">
      <section className="builder-chat" aria-label="Ideal place conversation">
        <div className="builder-chat-log" ref={log} role="log" aria-label="Conversation" aria-relevant="additions" tabIndex={0}>
          <div className="builder-message builder-guide">
            <span className="builder-avatar"><Home size={15} aria-hidden="true" /></span>
            <div>
              <p className="builder-opening">What would make this place feel like yours?</p>
              <p>Try a daily routine, a detail you loved somewhere else, or something you’d hate to live without.</p>
            </div>
          </div>
          {messages.map(message => <div key={message.id} className={'builder-message builder-' + message.role}>
            <span className="ideal-sr-only">{message.role === 'student' ? 'You' : 'Housing guide'} </span>
            <p>{message.text}</p>
            {message.role === 'student' && <span className={'message-state' + (unread.has(message.id) ? ' is-unread' : '')}>
              {!unread.has(message.id) ? <><Check size={12} aria-hidden="true" /> In your brief</>
                : busy ? <><span className="spinner is-small" aria-hidden="true" />Reading…</> : 'Not read yet'}
            </span>}
          </div>)}
          {reading && !checkpoint && <p className="builder-working" role="status"><span className="spinner is-small" aria-hidden="true" />{readingLabel}</p>}
          {!busy && !error && !checkpoint && studentCount > 0 && <p className="builder-working">What else would make a place feel right for you?</p>}
        </div>
        {errorNotice()}
        <form className="builder-composer" onSubmit={submit}>
          {composerInput('builder-ideas', composer)}
          <div className="builder-suggestions" role="group" aria-label="Ideas to get started">
            {suggestions.map(text => <button key={text} type="button" onClick={() => send(text)}>
              {text}<ArrowUp size={12} className="builder-suggestion-arrow" aria-hidden="true" />
            </button>)}
          </div>
          {!checkpoint && <div className="builder-review-buttons">
            {studentCount > 0 && <button className="text-button" type="button" disabled={busy} onClick={onReview}>Review what I’ve said</button>}
            {studentCount === 0 && <button className="text-button" type="button" disabled={busy} onClick={onUseSetup}>Use my setup</button>}
          </div>}
        </form>
      </section>
      {!mobile && <aside className="builder-brief" aria-label="Housing brief">{panel(false)}</aside>}
    </div>
    {mobile && <dialog ref={dialog} className="builder-mobile-dialog" aria-labelledby="mobile-brief-heading">
      <div className="builder-brief">{panel(true)}</div>
    </dialog>}
    <div className="builder-footer">
      <div>
        {filterStatus && <p className="builder-filter-status" role="status">{filterStatus}</p>}
        {!checkpoint && <p>Your matches will be available once your brief appears.</p>}
      </div>
      {matchesButton()}
    </div>
  </div>
}
