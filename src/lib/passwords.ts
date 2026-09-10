/**
 * The password rules Supabase Auth enforces, mirrored here so a rejection is
 * something the form says while you type rather than something the server tells
 * you after you press the button.
 *
 * These must match Authentication -> Sign In / Providers -> Email in the Supabase
 * dashboard. Supabase is the one actually enforcing them; this is only the hint.
 */
export const MIN_PASSWORD_LENGTH = 10

export const PASSWORD_RULE_TEXT =
  'At least 10 characters, with an uppercase letter, a lowercase letter and a number.'

/** Null when the password is acceptable, otherwise what is still missing. */
export function passwordProblem(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    const short = MIN_PASSWORD_LENGTH - password.length
    return `${short} more character${short === 1 ? '' : 's'} needed.`
  }
  const missing: string[] = []
  if (!/[a-z]/.test(password)) missing.push('a lowercase letter')
  if (!/[A-Z]/.test(password)) missing.push('an uppercase letter')
  if (!/[0-9]/.test(password)) missing.push('a number')

  if (missing.length === 0) return null
  if (missing.length === 1) return `Add ${missing[0]}.`
  return `Add ${missing.slice(0, -1).join(', ')} and ${missing[missing.length - 1]}.`
}
