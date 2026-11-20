import { createClient } from '@supabase/supabase-js'
const url = import.meta.env.VITE_SUPABASE_URL || import.meta.env.NEXT_PUBLIC_SUPABASE_URL || 'https://olguszfrdrseguaqajst.supabase.co'
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_eZ75M4mpp34NzAwpYrs0RA_tFqPWSQQ'
export const supabase = url && key ? createClient(url, key, { auth: { flowType: 'pkce' } }) : null
