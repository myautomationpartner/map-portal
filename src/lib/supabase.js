import { createClient } from '@supabase/supabase-js'

const FALLBACK_SUPABASE_URL = 'https://zgkxrlednyovuytaejok.supabase.co'
const FALLBACK_SUPABASE_ANON_KEY = 'sb_publishable_xwASGbwUsZhX5CFNizTAmg_U50hkD7o'

export const supabaseUrl =
  import.meta.env.NEXT_PUBLIC_SUPABASE_URL
  || import.meta.env.VITE_SUPABASE_URL
  || FALLBACK_SUPABASE_URL
const supabaseAnonKey =
  import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  || import.meta.env.VITE_SUPABASE_ANON_KEY
  || FALLBACK_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase environment variables. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.',
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
