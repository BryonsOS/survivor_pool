/**
 * Only http(s) links are allowed through. The payment URL comes from an
 * admin-editable settings row and ends up in an href on every player's page, so
 * an unchecked value would let a `javascript:` URL run in their browser.
 */
export function safePaymentUrl(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.toString() : null
  } catch {
    return null
  }
}
