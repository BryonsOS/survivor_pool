import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

const missing = [
  !url && 'VITE_SUPABASE_URL',
  !key && 'VITE_SUPABASE_ANON_KEY',
].filter(Boolean) as string[]

/**
 * Missing config used to `throw` right here, at module-import time — which runs
 * before React mounts, so the ErrorBoundary never saw it and the page rendered
 * blank with no clue why. Report it as a value instead and let the app show the
 * reader what to fix.
 *
 * These are build-time values: Vite inlines them into the bundle, so a deploy
 * built without them stays broken until they are set and the site is rebuilt.
 */
export const configError: string | null = missing.length
  ? `${missing.join(' and ')} ${missing.length > 1 ? 'were' : 'was'} not set when this site was built.`
  : null

// Placeholders keep createClient from throwing. Nothing is reachable through them,
// but the app gets to render the setup screen instead of dying on import.
export const supabase = createClient(
  url || 'https://placeholder.supabase.co',
  key || 'placeholder-key',
)
