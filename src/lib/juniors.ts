/** Real F2 / F3 / F4 / GP2 / GP3 juniors and F1 pipeline names. */

import juniorData from "@/data/juniorDrivers.json";
import type { Rng } from "@/lib/ratings";

export interface JuniorDriver {
  name: string;
  series: string;
  yearFrom: number;
  yearTo: number;
  baseline: number;
  ceiling: number;
  /** Last calendar year this driver may appear (in-season death, etc.). */
  diedYear?: number;
  sources?: string[];
}

/** Last year a driver may enter the pool when not set on the JSON row. */
const DEATH_YEAR: Record<string, number> = {
  "Anthoine Hubert": 2019,
  "Jules Bianchi": 2015,
};

/** Max age for feeder-to-F1 promotion in the target season year. */
export const MAX_JUNIOR_PROMOTION_AGE = 28;

/** Years after a driver's last feeder season they may still be picked. */
const FEEDER_WINDOW_SLACK = 2;

/** Post-dataset intake only recycles this many years of recent graduates. */
const POST_HORIZON_COHORT_YEARS = 4;

function diedYearFor(j: JuniorDriver): number | undefined {
  return j.diedYear ?? DEATH_YEAR[j.name];
}

/** Latest feeder year used for window scoring (death caps activity). */
function activeThrough(j: JuniorDriver): number {
  const died = diedYearFor(j);
  if (died != null) return Math.min(j.yearTo, died);
  return j.yearTo;
}

export function isJuniorActiveInYear(j: JuniorDriver, year: number): boolean {
  const died = diedYearFor(j);
  return died == null || year <= died;
}

interface JuniorDataFile {
  generatedAt: string;
  count: number;
  drivers: JuniorDriver[];
}

/** Strip Wikipedia disambiguation suffixes like "(racing driver, born 2003)". */
export function cleanJuniorName(name: string): string {
  return name
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const juniors = (juniorData as JuniorDataFile).drivers.map((j) => ({
  ...j,
  name: cleanJuniorName(j.name),
}));

/** Last year the feeder-series dataset actually covers. */
const DATA_HORIZON = juniors.reduce(
  (max, j) => Math.max(max, activeThrough(j)),
  2026,
);

function seriesRank(series: string): number {
  if (series === "f2" || series === "gp2") return 5;
  if (series === "f3" || series === "gp3" || series === "f1-pipeline") return 4;
  return 2;
}

/** Stable pseudo-random rookie age for post-dataset debuts of recent cohort names. */
function rookieAge(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return 18 + (Math.abs(hash) % 5);
}

export interface Prospect {
  name: string;
  age: number;
  baseline: number;
  ceiling: number;
  series?: string;
}

/** Approximate age while racing as a junior in `year`. */
export function juniorAgeInYear(j: JuniorDriver, year: number): number {
  // Treat yearFrom as roughly an 18–20 year old season.
  const debutAge = j.series === "f4" ? 17 : 19;
  return Math.max(17, Math.min(MAX_JUNIOR_PROMOTION_AGE, debutAge + (year - j.yearFrom)));
}

function prospectAge(j: JuniorDriver, year: number): number {
  if (year <= DATA_HORIZON) return juniorAgeInYear(j, year);
  // Post-dataset: latest-cohort names only, debuts at a stable young age.
  return rookieAge(j.name);
}

/**
 * Whether a feeder driver may be promoted or listed as a prospect in `year`.
 * Applies death caps, feeder-career window, and promotion age limits.
 */
export function isJuniorEligibleInYear(j: JuniorDriver, year: number): boolean {
  if (!isJuniorActiveInYear(j, year)) return false;
  if (year < j.yearFrom) return false;

  const through = activeThrough(j);
  const age = prospectAge(j, year);
  if (age > MAX_JUNIOR_PROMOTION_AGE) return false;

  if (year <= DATA_HORIZON) {
    return year <= through + FEEDER_WINDOW_SLACK;
  }

  // Past the dataset horizon only the latest feeder graduates may recycle in.
  return through >= DATA_HORIZON - POST_HORIZON_COHORT_YEARS;
}

/**
 * Real feeder drivers available around `year` who are not already on the books.
 * Prefers the highest series, then championship potential.
 */
export function juniorsForYear(
  year: number,
  taken: Set<string>,
  limit = 24,
): Prospect[] {
  // Past the end of the feeder dataset the ladder obviously keeps running, so
  // unused real names from the latest cohort become the next intake.
  if (year > DATA_HORIZON) return futureIntake(year, taken, limit);

  const scored = juniors
    .filter((j) => !taken.has(j.name) && isJuniorEligibleInYear(j, year))
    .map((j) => {
      const through = activeThrough(j);
      // Allow a little slack so a 2024 F2 graduate can still appear in 2026.
      const inWindow = year >= j.yearFrom - 1 && year <= through + FEEDER_WINDOW_SLACK;
      const recency = inWindow
        ? 10 - Math.min(10, Math.abs(year - (j.yearFrom + through) / 2))
        : year > through
          ? Math.max(0, 3 - (year - through))
          : Math.max(0, 2 - (j.yearFrom - year));
      return { j, score: seriesRank(j.series) * 3 + recency + j.baseline / 25 };
    })
    .filter((row) => row.score >= 6)
    .sort((a, b) => b.score - a.score || b.j.ceiling - a.j.ceiling);

  const out: Prospect[] = [];
  for (const row of scored) {
    if (out.length >= limit) break;
    out.push({
      name: row.j.name,
      age: prospectAge(row.j, year),
      baseline: row.j.baseline,
      ceiling: row.j.ceiling,
      series: row.j.series,
    });
  }
  return out;
}

function futureIntake(
  year: number,
  taken: Set<string>,
  limit: number,
): Prospect[] {
  return juniors
    .filter((j) => !taken.has(j.name) && isJuniorEligibleInYear(j, year))
    .map((j) => ({ j, score: seriesRank(j.series) * 3 + j.baseline / 25 }))
    .sort((a, b) => b.score - a.score || b.j.ceiling - a.j.ceiling)
    .slice(0, limit)
    .map(({ j }) => ({
      name: j.name,
      age: prospectAge(j, year),
      baseline: j.baseline,
      ceiling: j.ceiling,
      series: j.series,
    }));
}

/** Pull one real junior, preferring stronger feeder form. */
export function pickJunior(
  year: number,
  taken: Set<string>,
  rand: Rng,
): Prospect | null {
  const pool = juniorsForYear(year, taken, 40);
  // A seat must never go unfilled just because this year's window is thin.
  const fallback = pool.length ? pool : futureIntake(year, taken, 40);
  if (!fallback.length) return null;
  const top = fallback.slice(0, Math.min(12, fallback.length));
  return top[Math.floor(rand() * top.length)] ?? null;
}

export function allJuniorNames(): Set<string> {
  return new Set(juniors.map((j) => j.name));
}

/** @internal Audit helper — juniors eligible under legacy loose rules for `year`. */
export function legacyEligibleJuniorNames(year: number): string[] {
  return juniors
    .filter((j) => {
      if (!isJuniorActiveInYear(j, year)) return false;
      const age = juniorAgeInYear(j, year);
      if (age > 26) return false;
      const through = activeThrough(j);
      const recency =
        year > through ? Math.max(0, 3 - (year - through)) : 2;
      const score = seriesRank(j.series) * 3 + recency + j.baseline / 25;
      return score >= 6;
    })
    .map((j) => j.name);
}

/** @internal Audit helper — juniors eligible under current rules for `year`. */
export function eligibleJuniorNames(year: number): string[] {
  return juniors.filter((j) => isJuniorEligibleInYear(j, year)).map((j) => j.name);
}
