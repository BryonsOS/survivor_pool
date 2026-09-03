/**
 * Turns a Supabase/Postgres error into something a player can act on.
 *
 * Raw `error.message` used to go straight to the screen, which leaked table and
 * constraint names and told the reader nothing useful. Map the codes this app can
 * actually produce, and fall back to a generic line rather than the driver's text.
 */

interface SupabaseishError {
  code?: string
  message?: string
}

/** Postgres codes this app raises on purpose. */
const UNIQUE_VIOLATION = '23505'
const CHECK_VIOLATION = '23514'
const FK_VIOLATION = '23503'
const INSUFFICIENT_PRIVILEGE = '42501'

export function pickErrorMessage(
  error: SupabaseishError | null | undefined,
  teamName?: string,
  week?: number,
): string {
  if (!error) return 'Something went wrong. Try again.'
  const team = teamName ?? 'That team'
  const raw = error.message ?? ''

  switch (error.code) {
    case UNIQUE_VIOLATION:
      return `You have already used ${team} this season. Teams are one-time use.`
    case CHECK_VIOLATION:
      // Both guards live in the same trigger, so the text distinguishes them.
      if (raw.includes('Entry fee')) {
        return 'Your entry fee has not been recorded yet, so picks are locked. Pay the commissioner and they will unlock it.'
      }
      return `${team} are on a bye${week ? ` in Week ${week}` : ''} — they cannot win, so the pick was not saved.`
    case FK_VIOLATION:
      return `${team} is not a valid pick for this week.`
    case INSUFFICIENT_PRIVILEGE:
      return 'Picks are closed for this week.'
    default:
      return 'Your pick could not be saved. Refresh and try again.'
  }
}

/** Generic form/settings failures — never surfaces the driver's text. */
export function actionErrorMessage(error: SupabaseishError | null | undefined): string {
  if (!error) return 'Something went wrong. Try again.'
  if (error.code === INSUFFICIENT_PRIVILEGE) {
    return 'You do not have permission to do that.'
  }
  return 'That did not save. Refresh and try again.'
}

/**
 * Sign-in and sign-up. Auth errors are written for end users already, but the
 * invite-code rejection comes from a database trigger and reads like a stack trace.
 */
export function authErrorMessage(error: SupabaseishError | null | undefined): string {
  if (!error) return 'Something went wrong. Try again.'
  const raw = error.message ?? ''

  if (/invalid invite code/i.test(raw)) {
    return 'That invite code is not valid. Ask the commissioner for the current code.'
  }
  if (/invalid login credentials/i.test(raw)) {
    return 'That email and password do not match an account.'
  }
  if (/already registered|already exists/i.test(raw)) {
    return 'An account already exists for that email. Sign in instead.'
  }
  if (/rate limit|too many/i.test(raw)) {
    return 'Too many attempts. Wait a minute and try again.'
  }
  // Supabase's own auth copy is user-facing; anything else is generic.
  return raw && !/database|relation|column|constraint|function/i.test(raw)
    ? raw
    : 'Could not sign you in. Try again.'
}
