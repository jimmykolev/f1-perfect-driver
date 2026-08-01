# Perfect Driver

Spin a real Formula 1 **driver + year**, lock **one attribute**, and build a frankenstein ace — then simulate their career and see if they become a **legend**, a **race winner**, or a **nobody**.

Inspired by attribute-draft builders like [38-0-0 Build a Player](https://38-0-0.com/) / Build a Hooper.

## How to play

1. **Name your driver** and start a draft (or turn on Admin / Expert for special builds).
2. **Spin seasons**, lock one attribute at a time, and fill all eight slots.
3. On the reveal screen, pick **Autopilot** (instant career) or **Decide your seats** (pause mid-career for contract talks).
4. Choose a **debut year** and a starting **seat**.
5. Watch the career play out. On the results page:
   - **Museum** — championship arc and career story
   - **Season log** — race-by-race evidence
   - **Alternate history** — only when you debut inside the recorded-history window

Decisions-mode progress is saved in the browser for that tab session. Refresh keeps you in the career; closing the tab may warn you first. Use **New driver** to clear it.

## Play locally

```bash
npm install
npm run dev
```

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

React · Vite · TypeScript · Tailwind CSS · Zustand

## Balance / simulation testing

The career sim uses a coherent weekend model (qualifying → grid/pole → race finish → points).

```bash
npm test          # invariant checks
npm run balance   # Monte Carlo tier / anomaly report
```

Tune with `BALANCE_RUNS` / `SEASON_RUNS` env vars.
