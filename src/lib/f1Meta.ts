/** Shared F1 calendar, scoring and team meta used across the simulation. */

import calendarData from "@/data/seasonCalendars.json";
import driverData from "@/data/driverSeasons.json";
import type { DriverDataFile } from "@/types";

export const POINTS_TABLE = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1] as const;
export const SPRINT_POINTS_TABLE = [8, 7, 6, 5, 4, 3, 2, 1] as const;

/** Fallback modern calendar used for years beyond our historical data. */
export const GRAND_PRIX_CALENDAR = [
  "Bahrain GP",
  "Saudi Arabian GP",
  "Australian GP",
  "Japanese GP",
  "Chinese GP",
  "Miami GP",
  "Emilia Romagna GP",
  "Monaco GP",
  "Canadian GP",
  "Spanish GP",
  "Austrian GP",
  "British GP",
  "Belgian GP",
  "Hungarian GP",
  "Dutch GP",
  "Italian GP",
  "Azerbaijan GP",
  "Singapore GP",
  "United States GP",
  "Mexico City GP",
  "São Paulo GP",
  "Las Vegas GP",
  "Qatar GP",
  "Abu Dhabi GP",
] as const;

export const RACES_PER_SEASON = GRAND_PRIX_CALENDAR.length;

/** Rounds (1-based) that run a sprint on Saturday in the modern fallback calendar. */
export const SPRINT_ROUNDS = new Set([5, 6, 12, 19, 21, 23]);

interface SeasonCalendarFile {
  generatedAt: string;
  source: string;
  years: number[];
  seasons: {
    year: number;
    races: number;
    calendar: string[];
    sprintRounds: number[];
  }[];
}

const calendars = calendarData as SeasonCalendarFile;
const driverMeta = driverData as DriverDataFile;

const calendarByYear = new Map(
  calendars.seasons.map((season) => [season.year, season]),
);

/** Years the player can debut into (dataset coverage). */
export const AVAILABLE_START_YEARS = [...driverMeta.years].sort((a, b) => a - b);

export const LATEST_START_YEAR =
  AVAILABLE_START_YEARS[AVAILABLE_START_YEARS.length - 1] ?? 2026;

/**
 * Last season with a finished World Championship in the dataset.
 * The latest start year is the live/in-progress grid, so it has no historical
 * champion to rewrite yet.
 */
export const LAST_COMPLETED_HISTORY_YEAR = LATEST_START_YEAR - 1;

export interface SeasonRules {
  year: number;
  calendar: string[];
  sprintRounds: Set<number>;
  pointsTable: readonly number[];
  sprintPointsTable: readonly number[];
  /** Multiplier on chaotic-weekend chance (classic eras run hotter). */
  chaosMul: number;
  /** Multiplier on constructor reliability (classic eras break more). */
  reliabilityMul: number;
}

export type EraBucket = "classic" | "refuel" | "v8" | "hybrid" | "modern";

export interface EraFlavor {
  bucket: EraBucket;
  label: string;
  blurb: string;
  chaosMul: number;
  reliabilityMul: number;
}

/** Lightweight era toy — one vibe line + sim knobs for the start-year picker. */
export function eraFlavorForYear(year: number): EraFlavor {
  if (year < 1994) {
    return {
      bucket: "classic",
      label: "Turbo / pre-safety net",
      blurb: "Higher attrition · the car can bite back",
      chaosMul: 1.35,
      reliabilityMul: 0.88,
    };
  }
  if (year < 2006) {
    return {
      bucket: "refuel",
      label: "V10 / refuelling",
      blurb: "Messy strategy · overtaking still means something",
      chaosMul: 1.18,
      reliabilityMul: 0.94,
    };
  }
  if (year < 2014) {
    return {
      bucket: "v8",
      label: "V8 / frozen regs",
      blurb: "Stable pecking order · weekends still decide careers",
      chaosMul: 1.05,
      reliabilityMul: 0.98,
    };
  }
  if (year < LATEST_START_YEAR) {
    return {
      bucket: "hybrid",
      label: "Hybrid era",
      blurb: "Long calendars · sprints arrive · power unit chess",
      chaosMul: 1,
      reliabilityMul: 1,
    };
  }
  return {
    bucket: "modern",
    label: "Current grid",
    blurb: "Full modern calendar · new constructors in the mix",
    chaosMul: 1,
    reliabilityMul: 1,
  };
}

/** Championship points scale for a given season. */
export function pointsTableForYear(year: number): readonly number[] {
  if (year >= 2010) return POINTS_TABLE;
  if (year >= 2003) return [10, 8, 6, 5, 4, 3, 2, 1];
  if (year >= 1991) return [10, 6, 4, 3, 2, 1];
  return [9, 6, 4, 3, 2, 1];
}

export function sprintPointsTableForYear(year: number): readonly number[] {
  if (year < 2021) return [];
  if (year === 2021) return [3, 2, 1];
  if (year === 2022) return [8, 7, 6, 5, 4, 3, 2, 1];
  return SPRINT_POINTS_TABLE;
}

/** Calendar + scoring rules for a season year. Future years reuse the modern set. */
export function rulesForYear(year: number): SeasonRules {
  const flavor = eraFlavorForYear(year);
  // Keep the hand-tuned modern calendar for the current/future game year —
  // Jolpica's 2026 feed is still provisional and shorter than our balance set.
  if (year >= LATEST_START_YEAR) {
    return {
      year,
      calendar: [...GRAND_PRIX_CALENDAR],
      sprintRounds: new Set(SPRINT_ROUNDS),
      pointsTable: POINTS_TABLE,
      sprintPointsTable: SPRINT_POINTS_TABLE,
      chaosMul: flavor.chaosMul,
      reliabilityMul: flavor.reliabilityMul,
    };
  }

  const known = calendarByYear.get(year);
  if (known) {
    return {
      year,
      calendar: known.calendar,
      sprintRounds: new Set(known.sprintRounds),
      pointsTable: pointsTableForYear(year),
      sprintPointsTable: sprintPointsTableForYear(year),
      chaosMul: flavor.chaosMul,
      reliabilityMul: flavor.reliabilityMul,
    };
  }

  return {
    year,
    calendar: [...GRAND_PRIX_CALENDAR],
    sprintRounds: new Set(SPRINT_ROUNDS),
    pointsTable: pointsTableForYear(year),
    sprintPointsTable: sprintPointsTableForYear(year),
    chaosMul: flavor.chaosMul,
    reliabilityMul: flavor.reliabilityMul,
  };
}

export interface TeamBlueprint {
  name: string;
  /** Car performance on a ~55-98 scale. */
  power: number;
  /** 0-1; higher means fewer mechanical failures. */
  reliability: number;
  /** 0-1 budget, facilities and staff — drives long-run car development. */
  resources: number;
}

/**
 * Starting 2026 constructors, ordered by expected early-season form.
 * Power is a relative scale: the ~26 point spread here stands in for the
 * couple of percent of lap time that separates the best car from the worst.
 */
export const TEAM_BLUEPRINTS_2026: TeamBlueprint[] = [
  { name: "Mercedes", power: 92, reliability: 0.86, resources: 0.94 },
  { name: "Ferrari", power: 91, reliability: 0.8, resources: 0.97 },
  { name: "McLaren", power: 89, reliability: 0.85, resources: 0.93 },
  { name: "Red Bull", power: 87, reliability: 0.82, resources: 0.9 },
  { name: "Racing Bulls", power: 81, reliability: 0.78, resources: 0.6 },
  { name: "Alpine", power: 79, reliability: 0.7, resources: 0.64 },
  { name: "Haas", power: 76, reliability: 0.75, resources: 0.5 },
  { name: "Williams", power: 75, reliability: 0.72, resources: 0.58 },
  { name: "Audi", power: 72, reliability: 0.68, resources: 0.82 },
  { name: "Aston Martin", power: 70, reliability: 0.71, resources: 0.86 },
  { name: "Cadillac", power: 68, reliability: 0.62, resources: 0.74 },
];

export const TEAM_NAMES_2026 = TEAM_BLUEPRINTS_2026.map((t) => t.name);

/** Seasons where the regulations reset and the pecking order can scramble. */
export function isRegulationReset(year: number): boolean {
  if (
    year === 1998 ||
    year === 2005 ||
    year === 2009 ||
    year === 2014 ||
    year === 2022 ||
    year === 2026
  ) {
    return true;
  }
  return year > 2026 && (year - 2026) % 5 === 0;
}

/** Competitive tier (1 = best) from a team's rank in the power order. */
export function tierFromRank(rank: number): number {
  return Math.min(5, Math.floor(rank / 2) + 1);
}

export function racePoints(
  position: number,
  table: readonly number[] = POINTS_TABLE,
): number {
  if (position < 1 || position > table.length) return 0;
  return table[position - 1]!;
}

export function sprintPoints(
  position: number,
  table: readonly number[] = SPRINT_POINTS_TABLE,
): number {
  if (position < 1 || position > table.length) return 0;
  return table[position - 1]!;
}
