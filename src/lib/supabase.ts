import { createClient } from '@supabase/supabase-js'

/**
 * Connection defaults, committed on purpose.
 *
 * Both values are *publishable* client credentials: Vite inlines them into the
 * JavaScript bundle, so they are visible to anyone who opens the site either way.
 * Row-level security in Postgres is what actually protects the data — these only
 * identify which project to talk to. Baking them in means the site builds and runs
 * anywhere with no deploy-time configuration.
 *
 * Set VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY to point a build at a different
 * Supabase project (a staging copy, or a future season on its own database).
 */
const DEFAULT_URL = 'https://cnchsowyukaioujfrups.supabase.co'
const DEFAULT_ANON_KEY = 'sb_publishable_mQPA6yhSEzwr1wflWoserQ_eaXFsdcU'

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || DEFAULT_URL
const key = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) || DEFAULT_ANON_KEY

/**
 * Only reachable if the defaults above are removed. Kept because the previous
 * version threw here at module-import time — before React mounted, so the error
 * boundary never saw it and the deployed site rendered as a blank page.
 */
export const configError: string | null =
  !url || !key ? 'The Supabase connection is not configured for this build.' : null

export const supabase = createClient(url, key)
