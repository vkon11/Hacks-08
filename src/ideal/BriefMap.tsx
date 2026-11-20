import { Home } from 'lucide-react'
import type { Criterion, Message } from './contracts'
import './ui.css'

interface BriefMapProps {
  criteria: Criterion[]
  messages: Message[]
  previewMessageId?: string
  setupLabel?: string
  essentialsLabel?: string
}

export function BriefMap({ criteria, messages, previewMessageId, setupLabel, essentialsLabel }: BriefMapProps) {
  const grouped = new Map<string, Criterion[]>()
  const words = new Map(messages.filter(message => message.role === 'student').map(message => [message.id, message.text]))

  criteria.forEach(criterion => {
    const theme = criterion.theme.trim()
    const group = grouped.get(theme)
    if (group) group.push(criterion)
    else grouped.set(theme, [criterion])
  })

  return <div className="brief-map">
    <div className="brief-root">
      <Home size={21} strokeWidth={1.7} aria-hidden="true" />
      <strong>Your ideal place</strong>
    </div>
    {criteria.length === 0 && <div className="brief-setup-note">
      {setupLabel ? <p><strong>{setupLabel}</strong></p> : <p>Your search starts with the setup you chose.</p>}
      {essentialsLabel && <p>{essentialsLabel}</p>}
    </div>}
    {[...grouped].map(([theme, group]) => <section className="brief-branch" key={theme}>
      <h3><span aria-hidden="true" />{theme}</h3>
      <div className="brief-leaves">
        {group.map(criterion => <article className="brief-leaf" key={criterion.id}
          data-preview-idea={previewMessageId && criterion.sourceMessageIds.includes(previewMessageId) ? true : undefined}>
          <div className="brief-leaf-copy">
            <span className="brief-type">We’ll look for</span>
            <h4>{criterion.label}</h4>
            {criterion.importance === 'strong' && <span className="brief-strong">High priority</span>}
            {criterion.evidenceNeeded && <p>{criterion.evidenceNeeded}</p>}
            {criterion.sourceMessageIds.filter(id => words.has(id)).map(id => <blockquote key={id}>
              <span className="brief-type">{id === previewMessageId ? 'Draft idea' : 'You said'}</span>
              <span>“{words.get(id)}”</span>
            </blockquote>)}
          </div>
        </article>)}
      </div>
    </section>)}
  </div>
}
