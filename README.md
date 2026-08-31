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
| `survivor_picks` | write own **only while that week is open**; see others' only once the week is locked | full control |

Two rules are enforced by constraints rather than policies, so they hold even if the UI is
bypassed:

- `survivor_picks_one_time_use` — a partial unique index on `(user_id, team)` makes it
  physically impossible to use the same team twice in a season.
- `survivor_pick_shape` — a pick is either a team or a BYE, never both and never neither.
- `survivor_picks_playable` — a trigger rejects any pick for a team that has no game that
  week, so a bye-week team cannot be picked even by a client that skips the UI.

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

## Development

```bash
npm install
npm run dev
```

Connection details go in `.env` (copy `.env.example`). `VITE_SUPABASE_ANON_KEY` is a
publishable client key — it ships in the bundle by design, and RLS is what protects the
data.

```bash
npm test     # the scoring engine: strikes, ties, eliminations, BYEs, champion detection
npm run build
```

`uicheck.mjs` renders every page against stubbed Supabase responses and screenshots them,
so the UI can be checked without a login or any writes to the live database:

```bash
npm i -D playwright && npx playwright install chromium
npm run build && npx vite preview --port 4174 &
SHOT_DIR=/tmp node uicheck.mjs
```

## Commissioner notes

- The invite code is in **Admin → Invite Code** (initial code: `SURVIVE2026`).
- Week 1 ships open; the rest are upcoming.
- Each week locks at **its own first kickoff**, so nobody can pick after seeing a result.
  For most weeks that is Thursday night; Week 1 is Wednesday Sept 9, and Week 18 uses the
  earliest slot the league printed (Sat Jan 9) until those games are scheduled. Any week's
  deadline can be overridden in Admin → Weeks.
- Marking a week **final** automatically opens the next one.
- Only teams somebody actually picked appear in the results list — you never enter 32
  results for a week.
- Results are visible as soon as you enter them, but nothing costs a strike until you mark
  the week final. That makes "final" the deliberate sign-off.
