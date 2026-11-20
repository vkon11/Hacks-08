import { createClient } from '@supabase/supabase-js'
import { defaultProjectUrl, defaultPublishableKey } from './project'
const url = import.meta.env.VITE_SUPABASE_URL || import.meta.env.NEXT_PUBLIC_SUPABASE_URL || defaultProjectUrl
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || defaultPublishableKey
export const supabase = url && key ? createClient(url, key, { auth: { flowType: 'pkce' } }) : null
