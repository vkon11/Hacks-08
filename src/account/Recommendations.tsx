import { useEffect, useState } from 'react'
import type { PreferenceProfileV1 } from '../model'
import { rank, type Match, type Property } from '../match/engine'

// Housing data (567 properties) loads as its own chunk the first time recommendations are shown.
let data: Promise<Property[]> | null = null
const loadProperties = () => (data ??= import('../../data/export/properties.json').then(m => (m.default as unknown as { properties: Property[] }).properties))

export default function Recommendations({ profile }: { profile: PreferenceProfileV1; userId: string }) {
  const [matches, setMatches] = useState<Match[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [attempt, retry] = useState(0)
  useEffect(() => {
    let current = true
    setMatches(null)
    setFailed(false)
    loadProperties().then(properties => { if (current) setMatches(rank(profile, properties)) })
      .catch(() => { data = null; if (current) setFailed(true) })
    return () => { current = false }
  }, [profile, attempt])
  if (failed) return <p role="status">Couldn’t load your recommendations. <button className="text-button" onClick={() => retry(attempt + 1)}>Retry</button></p>
  if (!matches) return <p role="status">Ranking apartments…</p>
  if (!matches.length) return <p>No apartments fit your budget and must-haves. Try raising your budget or moving a must-have to Nice to have.</p>
  return <ol className="matches">{matches.map(match => <li key={match.propertyId}>
    {/^https?:\/\//i.test(match.url) ? <a href={match.url} rel="noreferrer" target="_blank">{match.title}</a> : <strong>{match.title}</strong>}
    <span>{match.reason}</span>
    <span className="match-meta">{match.planName}</span>
    {match.confirm.length > 0 && <span className="match-confirm">Confirm with the landlord: {match.confirm.join(', ')}</span>}
  </li>)}</ol>
}
