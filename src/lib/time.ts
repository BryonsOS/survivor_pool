/** "Picks lock in 2d 4h" / "…in 3h 12m" / "…in 14m" / past-due message. */
export function countdownText(locksAtIso: string | null, nowMs: number): string {
  if (!locksAtIso) return 'Deadline not set yet'
  const remaining = new Date(locksAtIso).getTime() - nowMs
  if (Number.isNaN(remaining)) return 'Deadline not set yet'
  if (remaining <= 0) return 'Kickoff — picks lock any minute'
  const mins = Math.floor(remaining / 60_000)
  const days = Math.floor(mins / 1440)
  const hours = Math.floor((mins % 1440) / 60)
  const m = mins % 60
  if (days > 0) return `Picks lock in ${days}d ${hours}h`
  if (hours > 0) return `Picks lock in ${hours}h ${m}m`
  return `Picks lock in ${m}m`
}

/** "Sun, Sep 13, 1:00 PM" in Eastern time, which is how the pool states deadlines. */
export function formatDeadline(iso: string | null): string {
  if (!iso) return 'TBD'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return 'TBD'
  return date.toLocaleString('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

/** Value for a datetime-local input, in Eastern time. */
export function toDatetimeLocal(iso: string | null): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date)
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '00'
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`
}
