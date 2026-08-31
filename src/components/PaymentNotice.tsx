import { formatMoney } from '../lib/survivor'
import { safePaymentUrl } from '../lib/payments'
import type { PoolSettings } from '../lib/types'

/** Shown to a player whose entry fee has not been marked received yet. */
export default function PaymentNotice({
  settings,
  compact = false,
}: {
  settings: PoolSettings
  compact?: boolean
}) {
  const href = safePaymentUrl(settings.payment_url)

  return (
    <div className="payment-notice">
      <div className="payment-notice-head">
        <span className="payment-amount">{formatMoney(settings.entry_fee)} due</span>
        <span className="payment-status">Entry fee not received</span>
      </div>
      {!compact && (
        <p className="payment-copy">
          {settings.payment_instructions}
          {settings.payment_handle ? ` Send it to ${settings.payment_handle}.` : ''}
          {settings.require_payment_to_pick
            ? ' Your picks are locked until the commissioner records it.'
            : ' You can still make picks in the meantime.'}
        </p>
      )}
      {href && (
        <a className="btn btn-primary btn-sm" href={href} target="_blank" rel="noreferrer noopener">
          Pay now
        </a>
      )}
    </div>
  )
}
