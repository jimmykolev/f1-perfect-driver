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
  sources?: string[];
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
const DATA_HORIZON = juniors.reduce((max, j) => Math.max(max, j.yearTo), 2026);

function seriesRank(series: string): number {
  if (series === "f2" || series === "gp2") return 5;
  if (series === "f3" || series === "gp3" || series === "f1-pipeline") return 4;
  return 2;
}

/** Stable pseudo-random rookie age so a name always debuts at the same age. */
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
  return Math.max(17, Math.min(28, debutAge + (year - j.yearFrom)));
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
  // unused real names become the next intake instead of the pool drying up.
  if (year > DATA_HORIZON) return futureIntake(taken, limit);

  const scored = juniors
    .filter((j) => !taken.has(j.name))
    .map((j) => {
      // Allow a little slack so a 2024 F2 graduate can still appear in 2026.
      const inWindow = year >= j.yearFrom - 1 && year <= j.yearTo + 2;
      const recency = inWindow
        ? 10 - Math.min(10, Math.abs(year - (j.yearFrom + j.yearTo) / 2))
        : year > j.yearTo
          ? Math.max(0, 3 - (year - j.yearTo))
          : Math.max(0, 2 - (j.yearFrom - year));
      return { j, score: seriesRank(j.series) * 3 + recency + j.baseline / 25 };
    })
    .filter((row) => row.score >= 6)
    .sort((a, b) => b.score - a.score || b.j.ceiling - a.j.ceiling);

  const out: Prospect[] = [];
  for (const row of scored) {
    if (out.length >= limit) break;
    const age = juniorAgeInYear(row.j, year);
    if (age > 26) continue;
    out.push({
      name: row.j.name,
      age,
      baseline: row.j.baseline,
      ceiling: row.j.ceiling,
      series: row.j.series,
    });
  }
  return out;
}

function futureIntake(taken: Set<string>, limit: number): Prospect[] {
  return juniors
    .filter((j) => !taken.has(j.name))
    .map((j) => ({ j, score: seriesRank(j.series) * 3 + j.baseline / 25 }))
    .sort((a, b) => b.score - a.score || b.j.ceiling - a.j.ceiling)
    .slice(0, limit)
    .map(({ j }) => ({
      name: j.name,
      age: rookieAge(j.name),
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
  const fallback = pool.length ? pool : futureIntake(taken, 40);
  if (!fallback.length) return null;
  const top = fallback.slice(0, Math.min(12, fallback.length));
  return top[Math.floor(rand() * top.length)] ?? null;
}

export function allJuniorNames(): Set<string> {
  return new Set(juniors.map((j) => j.name));
}
