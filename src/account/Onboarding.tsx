import { useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from './client'

export interface AccountDetails { full_name: string; move_in_date: string; roommate_count: number }

/** One-time account details. Stores only what the housing timeline needs, with explicit consent. */
export default function Onboarding({ user, initial, onSaved }: { user: User; initial: AccountDetails | null; onSaved: (details: AccountDetails) => void }) {
  const [name, setName] = useState(initial?.full_name ?? user.user_metadata.full_name ?? '')
  const [moveIn, setMoveIn] = useState(initial?.move_in_date ?? '')
  const [roommates, setRoommates] = useState(String(initial?.roommate_count ?? 0))
  const [consent, setConsent] = useState(!!initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function save(event: React.FormEvent) {
    event.preventDefault()
    const details = { full_name: name.trim(), move_in_date: moveIn, roommate_count: Number(roommates) }
    if (!details.full_name || details.full_name.length > 100 || !/^\d{4}-\d{2}-\d{2}$/.test(moveIn)
      || !Number.isInteger(details.roommate_count) || details.roommate_count < 0 || details.roommate_count > 10 || !consent) {
      setError('Fill in every field and check the consent box.')
      return
    }
    if (!supabase) return
    setBusy(true)
    setError('')
    const { error } = await supabase.from('profiles').upsert({ id: user.id, ...details })
    setBusy(false)
    if (error) setError('Couldn’t save your details. Please try again.')
    else onSaved(details)
  }

  return <section className="summary-section onboarding">
    <h2>{initial ? 'Edit your details' : 'A few basics'}</h2>
    <p>Your move-in date drives your housing timeline. We save these three details and nothing else.</p>
    {error && <p role="alert">{error}</p>}
    <form onSubmit={save} className="onboarding-form">
      <label>Name<input value={name} onChange={e => setName(e.target.value)} maxLength={100} required /></label>
      <label>Target move-in date<input type="date" value={moveIn} onChange={e => setMoveIn(e.target.value)} required /></label>
      <label>Roommates (not counting you)<input type="number" min={0} max={10} value={roommates} onChange={e => setRoommates(e.target.value)} required /></label>
      <label className="consent"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} />
        <span>Save these details to my account. Questionnaire answers stay on this device. I can delete my account anytime.</span></label>
      <button className="btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Continue'}</button>
    </form>
  </section>
}
