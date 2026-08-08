/**
 * Tune Perfect Team chase dominance toward ~1/250 perfects on spun rosters.
 * Run: node scripts/run-balance.mjs team-chase-balance.ts
 */
import data from "../src/data/driverSeasons.json";
import { isEligibleSeason } from "../src/lib/era";
import { mulberry32 } from "../src/lib/ratings";
import {
  buildConstructorSeasonPool,
  pickConstructorSeason,
  pickDriverSeasonForSeat,
  type CarAttributeKey,
  type CarAttributes,
} from "../src/lib/teamCarPool";
import {
  CHASE_BALANCE,
  simulateTeamSeasonChase,
} from "../src/lib/teamSeason";
import type { DriverDataFile, DriverSeason } from "../src/types";

const TRIALS = Number(process.env.CHASE_TRIALS ?? 5000);
const TARGET_PER = Number(process.env.CHASE_TARGET_PER ?? 250);
const YEARS = [1990, 1998, 2005, 2015, 2020, 2022, 2024];

const dataset = data as DriverDataFile;
const drivers = dataset.seasons.filter(isEligibleSeason);
const carPool = buildConstructorSeasonPool();
const ATTRS: CarAttributeKey[] = [
  "aerodynamics",
  "chassis",
  "powertrain",
  "durability",
];

function spinRoster(rand: () => number): {
  car: CarAttributes;
  first: DriverSeason;
  second: DriverSeason;
} {
  const usedCar: string[] = [];
  const car = {
    aerodynamics: 70,
    chassis: 70,
    powertrain: 70,
    durability: 70,
  } as CarAttributes;
  for (const key of ATTRS) {
    const card = pickConstructorSeason(carPool, usedCar, rand);
    usedCar.push(card.id);
    car[key] = card.attributes[key];
  }
  const usedDrivers: number[] = [];
  const first = pickDriverSeasonForSeat(drivers, usedDrivers, rand);
  usedDrivers.push(first.driverId);
  const second = pickDriverSeasonForSeat(drivers, usedDrivers, rand);
  return { car, first, second };
}

function measure(label: string) {
  let perfects = 0;
  let winSum = 0;
  let calSum = 0;

  for (let i = 0; i < TRIALS; i++) {
    const rand = mulberry32((i * 9973 + 17) >>> 0);
    const spun = spinRoster(rand);
    const year = YEARS[Math.floor(rand() * YEARS.length)]!;
    const result = simulateTeamSeasonChase({
      teamName: "Spun Team",
      car: spun.car,
      first: spun.first,
      second: spun.second,
      year,
      rand,
    });
    winSum += result.teamWins;
    calSum += result.calendarLength;
    if (result.perfect) perfects++;
  }

  const rate = perfects / TRIALS;
  const per = rate > 0 ? Math.round(1 / rate) : Infinity;
  console.log(
    `${label}: perfects=${perfects}/${TRIALS} (1 in ${per}) avgWinShare=${(
      winSum / calSum
    ).toFixed(3)} knobs=${JSON.stringify({
      powerBonus: CHASE_BALANCE.powerBonus,
      powerScale: CHASE_BALANCE.powerScale,
      reli: CHASE_BALANCE.reliabilityBonus,
      driver: CHASE_BALANCE.driverAttrBoost,
    })}`,
  );
  return { perfects, rate, per: rate > 0 ? 1 / rate : Infinity };
}

console.log(`target ~1 in ${TARGET_PER}; trials=${TRIALS}`);

const grid: Array<Partial<typeof CHASE_BALANCE>> = [
  { powerBonus: 10, powerScale: 4, reliabilityBonus: 0.05, driverAttrBoost: 2 },
  { powerBonus: 11, powerScale: 4, reliabilityBonus: 0.06, driverAttrBoost: 2 },
  { powerBonus: 11, powerScale: 5, reliabilityBonus: 0.06, driverAttrBoost: 2 },
  { powerBonus: 12, powerScale: 5, reliabilityBonus: 0.06, driverAttrBoost: 2 },
  { powerBonus: 12, powerScale: 5, reliabilityBonus: 0.07, driverAttrBoost: 3 },
  { powerBonus: 12.5, powerScale: 5.5, reliabilityBonus: 0.07, driverAttrBoost: 3 },
  { powerBonus: 13, powerScale: 5, reliabilityBonus: 0.07, driverAttrBoost: 3 },
  { powerBonus: 13, powerScale: 6, reliabilityBonus: 0.07, driverAttrBoost: 3 },
  { powerBonus: 13.5, powerScale: 5.5, reliabilityBonus: 0.075, driverAttrBoost: 3 },
];

let best: { per: number; cfg: Partial<typeof CHASE_BALANCE> } | null = null;

for (const cfg of grid) {
  Object.assign(CHASE_BALANCE, cfg);
  const row = measure("probe");
  const dist = Math.abs(row.per - TARGET_PER);
  if (!best || dist < Math.abs(best.per - TARGET_PER)) {
    best = { per: row.per, cfg: { ...cfg } };
  }
}

console.log("\nclosest to target", best);
Object.assign(CHASE_BALANCE, best?.cfg ?? {});
measure("confirm-best");
