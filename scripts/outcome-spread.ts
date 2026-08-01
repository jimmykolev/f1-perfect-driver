/**
 * One-shot: 100 random draft → career sims, print tier spread.
 * Run: node scripts/run-balance.mjs outcome-spread.ts
 */
import data from "../src/data/driverSeasons.json";
import {
  ATTRIBUTE_KEYS,
  type AttributeKey,
  type DriverDataFile,
  type LockedAttribute,
} from "../src/types";
import { pickRandom, simulateCareer } from "../src/lib/game";

const RUNS = Number(process.env.OUTCOME_RUNS ?? 100);
const pool = (data as DriverDataFile).seasons.filter((s) => s.races >= 5);

function randomDraft(seed: number): LockedAttribute[] {
  let state = seed >>> 0;
  const rand = () => {
    state += 0x6d2b79f5;
    let r = Math.imul(state ^ (state >>> 15), 1 | state);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };

  const locked: LockedAttribute[] = [];
  const used = new Set<string>();

  for (const key of ATTRIBUTE_KEYS) {
    let season = pickRandom(pool, rand);
    let guard = 0;
    while (used.has(season.id) && guard++ < 40) {
      season = pickRandom(pool, rand);
    }
    used.add(season.id);
    locked.push({ key, value: season.attributes[key as AttributeKey], from: season });
  }
  return locked;
}

const tiers: Record<string, number> = {
  legend: 0,
  champion: 0,
  raceWinner: 0,
  podiumThreat: 0,
  pointsRegular: 0,
  nobody: 0,
};

const overalls: number[] = [];
const titles: number[] = [];
const wins: number[] = [];

for (let i = 0; i < RUNS; i++) {
  const locked = randomDraft(10_000 + i * 17);
  const career = simulateCareer(locked, 50_000 + i * 31);
  tiers[career.tier] = (tiers[career.tier] ?? 0) + 1;
  overalls.push(career.overall);
  titles.push(career.titles);
  wins.push(career.wins);
}

const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const pct = (n: number) => `${((n / RUNS) * 100).toFixed(0)}%`;

const order = [
  "legend",
  "champion",
  "raceWinner",
  "podiumThreat",
  "pointsRegular",
  "nobody",
] as const;

console.log(`\nOutcome spread — ${RUNS} random drafts → careers\n`);
console.log("Tier".padEnd(16), "Count".padStart(6), "Chance".padStart(8));
console.log("-".repeat(32));
for (const tier of order) {
  const n = tiers[tier] ?? 0;
  console.log(tier.padEnd(16), String(n).padStart(6), pct(n).padStart(8));
}
console.log("-".repeat(32));
console.log(
  `\nAvg OVR ${avg(overalls).toFixed(1)} · avg titles ${avg(titles).toFixed(2)} · avg wins ${avg(wins).toFixed(1)}`,
);
const titleSpread = new Map<number, number>();
for (const count of titles) {
  titleSpread.set(count, (titleSpread.get(count) ?? 0) + 1);
}
console.log(
  "Title spread:",
  [...titleSpread.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([count, total]) => `${count}=${total}`)
    .join(" · "),
);
console.log("");
