import { useState } from 'react'
import { teamLogoUrl } from '../lib/logos'

/** A team's logo, or its abbreviation when the image cannot be loaded. */
export default function TeamLogo({
  abbr,
  name,
  size = 32,
}: {
  abbr: string
  name?: string
  size?: number
}) {
  const [failed, setFailed] = useState(false)

  if (failed) {
    return <span className="team-abbr">{abbr}</span>
  }
  return (
    <img
      className="team-logo"
      src={teamLogoUrl(abbr)}
      alt={name ?? abbr}
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  )
}
