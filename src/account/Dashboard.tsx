import { lazy, Suspense, useState, useEffect } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from './client'
import { firstIncomplete, loadRecord } from '../model'
import { guardRoute, routePath } from '../app/routing'
const Recommendations = lazy(() => import('./Recommendations'))

export default function Dashboard({ user }: { user: User }) {
  const [record] = useState(() => { try { return loadRecord(user.id) } catch { return null } })
  const [account, setAccount] = useState<{ full_name: string; move_in_date: string; roommate_count: number } | null>(null)
  useEffect(() => {
    let current = true
    void supabase?.from('profiles').select('full_name,move_in_date,roommate_count').eq('id', user.id).maybeSingle()
      .then(({ data }) => { if (current) setAccount(data) })
    return () => { current = false }
  }, [user.id])
  const profile = record?.completed
  const draft = record?.draft
  const resume = draft && (draft.started && !profile || draft.editing)
  const step = draft ? guardRoute(draft.step, firstIncomplete(draft), !!profile) : 'budget'
  return <main id="main" className="summary view dashboard">
    <h1>Your dashboard</h1>
    <section className="summary-section"><h2>Your profile</h2><p>{account?.full_name || user.user_metadata.full_name || user.email} {user.user_metadata.full_name && user.email && <> · {user.email}</>}</p>{account && <p>Move-in date · {account.move_in_date} &nbsp; Roommates · {account.roommate_count}</p>}</section>
    <section className="summary-section"><h2>Housing preferences</h2>
      {profile ? <><p>Up to ${(profile.budget.maxMonthlyCents / 100).toLocaleString()} per month · {profile.idealLocation.label}</p><a className="btn-secondary" href="/preferences/saved">View my priorities</a></> : <p>Set your budget, choose a spot and tell us what matters in your apartment.</p>}
      {(!profile || resume) && <a className="btn-primary" href={routePath(step)}>{resume ? 'Continue questionnaire' : 'Start questionnaire'}</a>}
    </section>
    <section className="summary-section"><h2>Your recommendations</h2>{profile ? <Suspense fallback={<p>Loading recommendations…</p>}><Recommendations userId={user.id} profile={profile} /></Suspense> : <p>Complete your questionnaire to see apartments that fit your preferences.</p>}</section>
  </main>
}
