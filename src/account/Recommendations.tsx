import { useEffect, useState } from 'react'
import type { PreferenceProfileV1 } from '../model'
import { supabase } from './client'

interface Match { title: string; reason: string; listing_url: string }
export default function Recommendations({ profile, userId }: { profile: PreferenceProfileV1; userId: string }) {
  const [matches, setMatches] = useState<Match[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [attempt, retry] = useState(0)
  useEffect(() => {
    let current = true
    setMatches(null)
    setFailed(false)
    void supabase?.from('housing_recommendations').select('title,reason,listing_url')
      .eq('user_id', userId).eq('profile_id', profile.profileId).eq('preferences_updated_at', profile.updatedAt)
      .order('rank').then(({ data, error }) => {
        if (!current) return
        if (error && error.code !== 'PGRST205') setFailed(true)
        else setMatches(data ?? [])
      })
    return () => { current = false }
  }, [profile.profileId, profile.updatedAt, userId, attempt])
  if (failed) return <p role="status">Couldn’t load your recommendations. <button className="text-button" onClick={() => retry(attempt + 1)}>Retry</button></p>
  if (!matches) return <p role="status">Loading recommendations…</p>
  if (!matches.length) return <p>Your preferences are saved. There are no apartment recommendations for this profile yet.</p>
  return <ol className="matches">{matches.map((match, index) => <li key={index}>
    {/^https?:\/\//i.test(match.listing_url) ? <a href={match.listing_url} rel="noreferrer" target="_blank">{match.title}</a> : <strong>{match.title}</strong>}
    <span>{match.reason}</span></li>)}</ol>
}
