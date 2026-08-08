/**
 * Probe whether a Perfect Team clean sweep is achievable.
 * Run: node scripts/run-balance.mjs team-chase-probe.ts
 */
import { rulesForYear } from "../src/lib/f1Meta";
import { mulberry32 } from "../src/lib/ratings";
import {
  carAttrsToBlueprint,
  simulateTeamSeasonChase,
} from "../src/lib/teamSeason";
import type { DriverSeason } from "../src/types";

const TRIALS_PER_YEAR = Number(process.env.CHASE_TRIALS ?? 2000);

function fakeSeason(name: string, overall: number): DriverSeason {
  const attr = Math.min(99, Math.max(55, overall));
  return {
    year: 2024,
    id: name.toLowerCase().replace(/\s+/g, "-"),
    driverId: name.length * 97,
    name,
    slug: name.toLowerCase().replace(/\s+/g, "-"),
    team: "X",
    position: 1,
    points: 400,
    races: 24,
    wins: 12,
    poles: 10,
    podiums: 20,
    fastestLaps: 8,
    dnfs: 0,
    sharpRating: overall,
    sharpChange: 0,
    image: null,
    attributes: {
      qualifying: attr,
      racePace: attr,
      raceCraft: attr,
      frontRunning: attr,
      scoring: attr,
      mentality: attr,
      reliability: attr,
      momentum: attr,
    },
    overall,
  };
}

const car = {
  aerodynamics: 99,
  chassis: 99,
  powertrain: 99,
  durability: 99,
};
const blueprint = carAttrsToBlueprint(car);
console.log("Max car blueprint", blueprint);

const first = fakeSeason("Ace One", 99);
const second = fakeSeason("Ace Two", 99);

// createWorld only populates grids from ~1990 onward in this dataset.
const years = [
  1990, 1991, 1992, 1993, 1994, 1995, 1996, 1997, 1998, 1999, 2000, 2005,
  2010, 2015, 2020, 2021, 2022, 2023, 2024,
];

type Best = {
  year: number;
  seed: number;
  wins: number;
  cal: number;
  rate: number;
  brokenAt: number | null;
};

let best: Best | null = null;
let perfect: Best | null = null;
let trials = 0;
const hist: number[] = [];

for (const year of years) {
  const cal = rulesForYear(year).calendar.length;
  let yearBest = 0;
  let yearSum = 0;
  let yearPerfect = 0;

  for (let i = 0; i < TRIALS_PER_YEAR; i++) {
    const seed = (year * 1_000_003 + i * 7919 + 13) >>> 0;
    const result = simulateTeamSeasonChase({
      teamName: "God Mode",
      car,
      first,
      second,
      year,
      rand: mulberry32(seed),
    });
    trials++;
    yearSum += result.teamWins;
    yearBest = Math.max(yearBest, result.teamWins);
    hist.push(result.teamWins / result.calendarLength);

    const row: Best = {
      year,
      seed,
      wins: result.teamWins,
      cal: result.calendarLength,
      rate: result.teamWins / result.calendarLength,
      brokenAt: result.brokenAtRound,
    };

    if (
      !best ||
      row.rate > best.rate ||
      (row.rate === best.rate && row.wins > best.wins)
    ) {
      best = row;
    }

    if (result.perfect) {
      yearPerfect++;
      perfect = row;
      console.log("\n*** PERFECT SEASON ***", row);
      break;
    }
  }

  console.log(
    `${year}: cal=${cal} best=${yearBest}/${cal} avg=${(
      yearSum / TRIALS_PER_YEAR
    ).toFixed(2)} perfects=${yearPerfect}`,
  );

  if (perfect) break;
}

hist.sort((a, b) => a - b);
const p50 = hist[Math.floor(hist.length * 0.5)] ?? 0;
const p90 = hist[Math.floor(hist.length * 0.9)] ?? 0;
const p99 = hist[Math.floor(hist.length * 0.99)] ?? 0;

console.log("\n--- summary ---");
console.log("trials", trials);
console.log("win-rate percentiles", {
  p50: p50.toFixed(3),
  p90: p90.toFixed(3),
  p99: p99.toFixed(3),
  max: (hist[hist.length - 1] ?? 0).toFixed(3),
});
console.log("best season", best);
console.log(
  perfect
    ? `FOUND perfect: year=${perfect.year} seed=${perfect.seed}`
    : "NO perfect season found with maxed god-mode roster.",
);
