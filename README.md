# NFL Survivor Pool

A private survivor (suicide) pool site. Members pick one NFL team to win each week.
Teams are one-time use, a loss is a strike, and two strikes ends your season.

Built to match the [fantasy wrestling pick'em](https://github.com/BryonsOS/fantasy_wrestling):
React + TypeScript + Vite, Supabase for data and auth with row-level security doing all
the enforcement, static SPA on Netlify. There is no server code.

## How it works

- **Join by invite code.** New players sign up with the pool's code. Anyone who already
  has a fantasy-wrestling account signs in with it and enters the code once to join —
  same login, both sites.
- **Week lifecycle**, driven from the admin panel:
  1. **Upcoming** — not open, no picks accepted
  2. **Picks open** — members pick a team; they can change it until the deadline
  3. **Locked** — picks freeze at kickoff and everyone's picks are revealed
  4. **Final** — commissioner enters results; strikes and eliminations apply
- **Scoring.** A win advances you. A loss is a strike. A tie survives by default. A missed
  pick is a strike. You are eliminated on your second strike. Last player standing wins.
- **One-time use.** Every pick burns that team for the rest of the season, win or lose.
- **Opponents and byes.** The full 2026 schedule is loaded, so the board shows each team's
  opponent and kickoff, and teams on their bye are unpickable — they cannot win.

## Rules are settings, not code

Every variation of the format is a row in `survivor_settings`, editable from Admin →
Rules: strikes to eliminate (1 = classic single elimination), whether a tie counts as a
loss, BYE weeks per player, whether a missed pick costs a strike, buy-backs, and the entry
fee. The rules page renders *from those settings*, so what's posted can never drift away
from what the scoring actually does.

## Security model (RLS)

All authorization is in the database. The browser talks to Supabase directly with a
publishable key; policies decide what it may see and write.

| Table | Members | Admin |
|---|---|---|
| `survivor_settings` | read | read/update |
| `survivor_invite` | **no access** | read/update |
| `survivor_teams` | read | read |
| `survivor_entrants` | entrants read the roster | full control |
| `survivor_weeks` / `survivor_results` / `survivor_games` | entrants read | full control |
| `survivor_picks` | write own **only while that week is open and its deadline has not passed**; see others' only once the week is locked | full control |

Two rules are enforced by constraints rather than policies, so they hold even if the UI is
bypassed:

- `survivor_picks_one_time_use` — a partial unique index on `(user_id, team)` makes it
  physically impossible to use the same team twice in a season.
- `survivor_pick_shape` — a pick is either a team or a BYE, never both and never neither.
- `survivor_picks_playable` — a trigger rejects any pick for a team that has no game that
  week, so a bye-week team cannot be picked even by a client that skips the UI.

The deadline is enforced by the database, not by the commissioner remembering to lock a
week. `survivor_week_accepts_picks()` requires both an open week and `now() < locks_at`,
so once the first kickoff arrives nobody can change a pick — no matter who is asleep.
Moving a deadline in Admin → Weeks still takes effect immediately, which is the escape
hatch when a week genuinely needs longer. Admins keep an unrestricted policy, because
correcting somebody's pick after the fact is a real need.

The pick board mirrors the same rule: when the countdown hits zero it stops offering the
teams rather than letting a click fail.

Signups run through the shared `handle_new_user` trigger, which accepts either the
wrestling code or the survivor code and enrols survivor signups in the pool. An unknown
code is still rejected.

## Database

This shares the **fantasy-wrestling** Supabase project (`cnchsowyukaioujfrups`) rather than
running its own, because the free tier allows two active projects and both were in use.
Everything here is prefixed `survivor_` and touches no existing table; identity is reused
from `public.profiles`, which is why one login works for both sites.

`supabase/migrations/001_survivor_schema.sql` is the applied schema and
`002_schedule.sql` loads the 2026 season, both kept for reference and disaster recovery.

## The schedule

All 272 regular-season games are in `survivor_games`, parsed from the league's published
2026 schedule PDF and checked on import: 272 games, every team plays 17, no team appears
twice in a week, and all 32 teams have exactly one bye (byes run weeks 5–14).

Games the NFL has not flexed yet — 4 in Week 16, 4 in Week 17, and all 16 of Week 18 —
have a known matchup but a null `kickoff_at`. The board shows those as "time TBD". When the
league sets them, update `kickoff_at` and the week's `locks_at`.

The season is single-year by design: `survivor_weeks.week` is the primary key and the
one-time-use index spans the whole table. Starting a new season means archiving and
clearing `survivor_picks` and `survivor_results`.

The wrestling repo's keepalive workflow already pings this database twice a week, so no
second keepalive is needed.

## Names

Two names, deliberately separate:

- **Team name** (`survivor_entrants.team_name`) — pool-only, what the standings show.
  Set it on the Account page. Blank falls back to the profile name.
- **Profile name** (`profiles.display_name`) — shared with the wrestling league, so
  changing it renames you there too.
- **Real first name** (`member_details.real_name`) — also shared, shown under the team
  name on the standings so the pool knows who is who.

Writes to `survivor_entrants` stay admin-only because `paid` lives on that table.
Players change their own team name through `survivor_set_team_name()`, a definer
function that touches only their row and only that column.

## Pick distribution

The pick board shows how the pool is leaning while picks are still open — which
teams are being taken and by what share — the way Splash Sports does it.

Individual picks stay hidden until a week locks. The distribution comes from
`survivor_pick_counts()`, a definer function that returns **counts per team and
nothing else**: no user ids, no names. An entrant can see that five people took
Philadelphia without being able to read a single rival's pick row.

Commissioners can switch it off (Admin → Rules → *Live pick counts*), which hides
it until a week locks; once locked the individual picks are public anyway, so
counts always show from that point.

## Win chances

Every playable team on the pick board carries the sportsbooks' consensus chance that
it wins its game this week — the number Splash Sports shows — next to the share of
the pool already on that team. The two are labelled ("62% win", "50% picked") because
side by side they are easy to confuse.

Where the number comes from:

- A scheduled Edge Function (`supabase/functions/refresh-odds`) pulls head-to-head
  moneylines from [The Odds API](https://the-odds-api.com) every three hours — 240
  calls a month against a 500-call free allowance. `pg_cron` triggers it; the function
  refuses to run twice within thirty minutes, so a retry storm cannot drain the quota.
- Books quote a margin: the two sides of a game imply more than 100% between them. Each
  book's pair is normalised back to 100% before it gets a vote, and the median across
  books is stored. That arithmetic is in `src/lib/odds.ts` and unit tested.
- Odds older than 36 hours are not shown at all. A wrong number is worse than no number,
  and a game with no price simply shows no percentage.
- **Admin → Odds feed** lists the last five runs. It exists so a feed that quietly
  stopped is visible rather than silently absent.

The key lives in Supabase (Edge Functions → Secrets, `ODDS_API_KEY`), never in this
repository. `pg_cron` authenticates to the function with a shared secret generated inside
the database by migration `008`, which is also never written down outside it.

## Who picked whom

Once a week locks, **Season → the week** groups that week's picks by team: how many
took each team, who they were, and how it turned out. Before a week locks it shows
nothing but counts (see *Pick distribution* above) — the reveal is the lock.

## Entry fees

The site never touches money. Players pay the commissioner directly through whatever
link is configured; the commissioner marks them paid, and the app does the bookkeeping:

- An unpaid player sees what they owe on their pick page, with a **Pay now** button
  pointing at the configured link (Venmo, Cash App, PayPal — anything http(s)).
- **Admin → Entry fees** shows collected, outstanding, unpaid count, and the full pot,
  and is where the handle, link, and instructions are set.
- Marking someone paid stamps `paid_at`, so "who paid and when" is answerable later.
  Un-marking clears the stamp and any note.
- Optionally, **unpaid players can be blocked from locking a pick**. That rule is
  enforced by a database trigger, not the UI, so it holds however a pick is submitted.
  It is off by default.

Payment links are validated: only `http:` and `https:` URLs are rendered, so a stray
`javascript:` value cannot end up in an href on every player's page.

## Hardening

- **Security headers** ship from `netlify.toml`: a CSP that allows scripts only from
  this origin and network calls only to this Supabase project, plus `X-Frame-Options:
  DENY`, HSTS, `nosniff`, a referrer policy, and a `Permissions-Policy` that turns off
  camera/mic/geolocation/payment. The build emits no inline scripts, so `script-src
  'self'` needs no unsafe escapes.
- **Invite codes cannot be probed.** `survivor_validate_invite` is no longer callable
  by `anon`; there is no endpoint that answers "is this code valid?" without an account.
  The signup trigger rejects a bad code and no account is created.
- **Database errors never reach players.** `src/lib/errors.ts` maps the codes this app
  raises to plain sentences; anything unrecognised becomes a generic line rather than
  the driver's text, which leaked table and constraint names.
- **Changing a locked-in pick asks first**, since a mis-tap on a phone can cost a season.

Still worth doing in the Supabase dashboard: enable **leaked password protection**
(Authentication → Policies) and confirm **email confirmation** is required on signup.

## Development

```bash
npm install
npm run dev
```

No configuration is needed to run or deploy this: the Supabase URL and publishable key
are committed as defaults in `src/lib/supabase.ts`. Both are inlined into the JavaScript
bundle by Vite, so they are public either way — RLS is what protects the data. Set
`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` only to point a build at a different
Supabase project.

```bash
npm test     # the scoring engine (strikes, ties, eliminations, champion detection)
             # and the odds maths (vig removal, missing odds, staleness)
npm run build
```

`uicheck.mjs` renders every page against stubbed Supabase responses and screenshots them,
so the UI can be checked without a login or any writes to the live database:

```bash
npx playwright install chromium
npm run build && npx vite preview --port 4174 &
SHOT_DIR=/tmp node uicheck.mjs
```

Set `CHROMIUM_PATH` if a Chromium is already on the machine and you would rather not
download Playwright's own build.

## Commissioner notes

- The invite code is in **Admin → Invite Code** (initial code: `SURVIVE2026`).
- Week 1 ships open; the rest are upcoming.
- Each week locks at **its own first kickoff**, so nobody can pick after seeing a result.
  For most weeks that is Thursday night; Week 1 is Wednesday Sept 9, and Week 18 uses the
  earliest slot the league printed (Sat Jan 9) until those games are scheduled. Any week's
  deadline can be overridden in Admin → Weeks.
- That deadline enforces itself. You still mark a week **locked** to reveal everyone's
  picks and **final** to score it, but picks close on the clock whether or not you are
  there.
- Marking a week **final** automatically opens the next one.
- Only teams somebody actually picked appear in the results list — you never enter 32
  results for a week.
- Results are visible as soon as you enter them, but nothing costs a strike until you mark
  the week final. That makes "final" the deliberate sign-off.
- The odds feed needs one thing done by hand, once: set `ODDS_API_KEY` in the Supabase
  dashboard under **Edge Functions → Secrets**, using a free key from
  [the-odds-api.com](https://the-odds-api.com). Until it is set, **Admin → Odds feed**
  says so and the board simply shows no percentages.
