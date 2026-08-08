# Perfect Grid

F1 career simulation from real ratings. Modes on the landing page:

- **Perfect Driver** — draft attributes from real driver-seasons, simulate a full career
- **Weekly Grid** — same eight seasons for everyone, one weekly board
- **Perfect Team** — build a car from constructor-years, sign 1st / 2nd / reserve (season chase next)

Inspired by attribute-draft builders like [38-0-0 Build a Player](https://38-0-0.com/) / Build a Hooper.

## How to play

1. Open **Perfect Grid**, pick a mode from the selector.
2. **Spin seasons**, lock one attribute at a time, fill all eight slots.
3. On reveal, **Start career** — pick debut year and seat. Autopilot runs by default; seat decisions stay under Advanced.
4. Results: tier, moments, rival, then **Share** or **New driver**. Museum, season log, alt-history, and DNA live under **Receipts**.
5. A quiet **Beat this** line tracks your best local Perfect Driver run.

### Weekly Grid

Every ISO week, everyone gets the **same eight** eligible driver-seasons (3 classic / 5 modern). No passes. After the career, **Submit run** posts your best result to that week's board (anonymous display name + a silent device id — one best run per browser per week). Share with `#PerfectGrid` / `#PDGrid`. The grid rolls over automatically next Monday.

Ranking: tier → titles → wins → points.

Expert and Playground sit under **Also try** for Perfect Driver (Playground is off during Weekly Grid). Decisions-mode progress saves in the browser for that tab session.

## Play locally

```bash
npm install
npm run dev
```

Vite-only (`npm run dev`) serves the board from **localStorage** when the API is unavailable. To exercise the Netlify function + Blobs store locally:

```bash
npm run dev:netlify
```

## Deploy (Netlify)

`netlify.toml` publishes `dist` and `netlify/functions`. The weekly board uses **Netlify Blobs** (`weekly-leaderboard` store) — enabled automatically on Netlify; no extra env vars for the basic board.

## Data

Driver-season stats are pulled from [DriverDB](https://www.driverdb.com/championships/formula-1/2024/standings) standings **and** statistics pages (wins, poles, podiums, fastest laps, Sharp rating, DNFs, points — not standings alone).

The draft pool covers **1988–2026**. Pre-hybrid years (**before 2014**) only
contribute the championship **top 10**. Among those, a curated set of icons
(Senna, Schumacher, Alonso, …) get the **Legend** badge when they land on a spin.

Refresh locally:

```bash
npm run fetch-data
# optional: npm run fetch-data -- 1988 2026
```

Missing standings-team values are resolved through Jolpica/Ergast driver
standings first, then each driver's DriverDB career endpoint, then a small
manual override list. Re-run `npm run patch-teams` to backfill teams without
re-fetching the full dataset.

Attributes are derived per season within that year's field:

| Attribute | Source signal |
| --- | --- |
| Qualifying | Poles / races |
| Race Pace | Fastest laps / races |
| Race Craft | Win rate + pole conversion |
| Front Running | Podium rate |
| Scoring | Points vs season leader |
| Mentality | DriverDB Sharp rating |
| Reliability | Race starts vs season length + Sharp rating stability |
| Momentum | Sharp rating change |

Ratings use **field percentiles** scaled to **55–99** (midfield ~low-70s), so random drafts stay playable without everyone becoming a race winner.

## Stack

React · Vite · TypeScript · Tailwind CSS · Zustand · Netlify Functions / Blobs

## Balance / simulation testing

The career sim uses a coherent weekend model (qualifying → grid/pole → race finish → points).

```bash
npm test          # invariant checks
npm run balance   # Monte Carlo tier / anomaly report
```

Tune with `BALANCE_RUNS` / `SEASON_RUNS` env vars.
