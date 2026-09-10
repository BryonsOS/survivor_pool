/**
 * Team logos, served from ESPN's public CDN.
 *
 * Nothing is bundled: the site never had a way to fetch the files, and a
 * hot-linked image that fails simply falls back to the abbreviation badge the
 * board had before. ESPN's codes match ours except for Washington.
 */
const ESPN_CODES: Record<string, string> = { WAS: 'wsh' }

export function teamLogoUrl(abbr: string): string {
  const code = ESPN_CODES[abbr] ?? abbr.toLowerCase()
  return `https://a.espncdn.com/i/teamlogos/nfl/500/${code}.png`
}
