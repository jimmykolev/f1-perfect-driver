import data from "@/data/driverSeasons.json";
import { LATEST_START_YEAR, TEAM_BLUEPRINTS_2026, rulesForYear } from "@/lib/f1Meta";
import type { DriverDataFile, DriverSeason } from "@/types";

const dataset = data as DriverDataFile;

export const CAR_ATTRIBUTE_KEYS = [
  "aerodynamics",
  "chassis",
  "powertrain",
  "durability",
] as const;

export type CarAttributeKey = (typeof CAR_ATTRIBUTE_KEYS)[number];

export type CarAttributes = Record<CarAttributeKey, number>;

export const CAR_ATTRIBUTE_META: Record<
  CarAttributeKey,
  { label: string; short: string; blurb: string }
> = {
  aerodynamics: {
    label: "Aerodynamics",
    short: "AERO",
    blurb: "Downforce and efficiency — how the car makes lap time.",
  },
  chassis: {
    label: "Chassis",
    short: "CHAS",
    blurb: "Platform balance and development base.",
  },
  powertrain: {
    label: "Powertrain",
    short: "PWR",
    blurb: "Engine / ERS punch and driveability.",
  },
  durability: {
    label: "Durability",
    short: "DURA",
    blurb: "How often the car finishes Sundays.",
  },
};

/** One constructor in one championship year — a spin card for Perfect Team. */
export interface ConstructorSeason {
  id: string;
  team: string;
  year: number;
  attributes: CarAttributes;
  overall: number;
  /** Drivers who raced for this team that year (for flavour). */
  drivers: string[];
}

export interface LockedCarAttribute {
  key: CarAttributeKey;
  value: number;
  from: ConstructorSeason;
}

export type TeamSeatId = "first" | "second" | "reserve";

export const TEAM_SEAT_ORDER: TeamSeatId[] = ["first", "second", "reserve"];

export const TEAM_SEAT_LABEL: Record<TeamSeatId, string> = {
  first: "1st seat",
  second: "2nd seat",
  reserve: "Reserve",
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function ratingFromUnit(unit: number, lo = 55, hi = 99): number {
  return Math.round(clamp(lo + unit * (hi - lo), lo, hi));
}

/** Map blueprint-style stats into four draftable car ratings. */
export function deriveCarAttributes(input: {
  power: number;
  reliability: number;
  resources: number;
  bestOverall: number;
}): CarAttributes {
  const powerU = clamp((input.power - 56) / 40, 0, 1);
  const reliU = clamp((input.reliability - 0.55) / 0.37, 0, 1);
  const resU = clamp((input.resources - 0.4) / 0.57, 0, 1);
  const bestU = clamp((input.bestOverall - 55) / 44, 0, 1);

  const aerodynamics = ratingFromUnit(powerU * 0.7 + bestU * 0.3);
  const chassis = ratingFromUnit(resU * 0.55 + powerU * 0.25 + bestU * 0.2);
  const powertrain = ratingFromUnit(powerU * 0.85 + resU * 0.15);
  const durability = ratingFromUnit(reliU * 0.8 + resU * 0.2);

  return { aerodynamics, chassis, powertrain, durability };
}

export function carOverall(attrs: CarAttributes): number {
  const sum = CAR_ATTRIBUTE_KEYS.reduce((n, k) => n + attrs[k], 0);
  return Math.round(sum / CAR_ATTRIBUTE_KEYS.length);
}

export function remainingCarAttributes(
  locked: CarAttributeKey[],
): CarAttributeKey[] {
  const taken = new Set(locked);
  return CAR_ATTRIBUTE_KEYS.filter((k) => !taken.has(k));
}

type YearTeamBucket = {
  points: number;
  races: number;
  dnfs: number;
  starts: number;
  best: number;
  drivers: Set<string>;
};

function bucketsForYear(year: number): Map<string, YearTeamBucket> {
  const byTeam = new Map<string, YearTeamBucket>();
  for (const row of dataset.seasons) {
    if (row.year !== year || !row.team?.trim()) continue;
    const bucket = byTeam.get(row.team) ?? {
      points: 0,
      races: 0,
      dnfs: 0,
      starts: 0,
      best: 0,
      drivers: new Set<string>(),
    };
    bucket.points += row.points;
    bucket.races = Math.max(bucket.races, row.races);
    bucket.dnfs += row.dnfs;
    bucket.starts += row.races;
    bucket.best = Math.max(bucket.best, row.overall);
    bucket.drivers.add(row.name);
    byTeam.set(row.team, bucket);
  }
  return byTeam;
}

function blueprintsForYear(year: number): {
  name: string;
  power: number;
  reliability: number;
  resources: number;
  best: number;
  drivers: string[];
}[] {
  if (year === LATEST_START_YEAR) {
    const live = bucketsForYear(year);
    return TEAM_BLUEPRINTS_2026.map((t) => {
      const bucket = live.get(t.name);
      return {
        name: t.name,
        power: t.power,
        reliability: t.reliability,
        resources: t.resources,
        best: bucket?.best ?? 80,
        drivers: bucket ? [...bucket.drivers].sort() : [],
      };
    });
  }

  const byTeam = bucketsForYear(year);
  const calendarLen = rulesForYear(year).calendar.length;
  const minRaces = Math.max(3, Math.floor(calendarLen * 0.25));
  let ranked = [...byTeam.entries()]
    .map(([name, stats]) => ({ name, ...stats }))
    .filter((t) => t.races >= minRaces || t.points > 0)
    .sort(
      (a, b) =>
        b.points - a.points || b.best - a.best || a.name.localeCompare(b.name),
    );

  if (ranked.length < 8) {
    ranked = [...byTeam.entries()]
      .map(([name, stats]) => ({ name, ...stats }))
      .sort(
        (a, b) =>
          b.points - a.points || b.best - a.best || a.name.localeCompare(b.name),
      );
  }

  const n = ranked.length;
  return ranked.map((team, i) => {
    const t = n <= 1 ? 0 : i / (n - 1);
    const power = Math.round(94 - t * 26);
    const reliability = clamp(
      0.88 - (team.dnfs / Math.max(1, team.starts)) * 1.15,
      0.55,
      0.92,
    );
    const resources = clamp(0.96 - t * 0.52, 0.4, 0.97);
    return {
      name: team.name,
      power,
      reliability,
      resources,
      best: team.best,
      drivers: [...team.drivers].sort(),
    };
  });
}

let cachedPool: ConstructorSeason[] | null = null;

/** All draftable constructor-year cards (unique team + year). */
export function buildConstructorSeasonPool(): ConstructorSeason[] {
  if (cachedPool) return cachedPool;

  const years = [...new Set(dataset.seasons.map((s) => s.year))].sort(
    (a, b) => a - b,
  );
  const pool: ConstructorSeason[] = [];

  for (const year of years) {
    for (const team of blueprintsForYear(year)) {
      if (!team.name.trim()) continue;
      const attributes = deriveCarAttributes({
        power: team.power,
        reliability: team.reliability,
        resources: team.resources,
        bestOverall: team.best,
      });
      pool.push({
        id: `${year}-${team.name.toLowerCase().replace(/\s+/g, "-")}`,
        team: team.name,
        year,
        attributes,
        overall: carOverall(attributes),
        drivers: team.drivers,
      });
    }
  }

  cachedPool = pool;
  return pool;
}

export function pickConstructorSeason(
  pool: ConstructorSeason[],
  usedIds: string[],
  rand: () => number = Math.random,
): ConstructorSeason {
  const available = pool.filter((c) => !usedIds.includes(c.id));
  const source = available.length ? available : pool;
  return source[Math.floor(rand() * source.length)]!;
}

export function pickDriverSeasonForSeat(
  pool: DriverSeason[],
  usedDriverIds: number[],
  rand: () => number = Math.random,
): DriverSeason {
  const available = pool.filter((s) => !usedDriverIds.includes(s.driverId));
  const source = available.length ? available : pool;
  return source[Math.floor(rand() * source.length)]!;
}
