import { mulberry32, type Rng } from "@/lib/ratings";
import type { DriverSeason } from "@/types";

export const WEEKLY_GRID_SIZE = 8;
/** Pre-hybrid seasons in each weekly puzzle. */
export const WEEKLY_CLASSIC_COUNT = 3;
/** Hybrid-era seasons in each weekly puzzle. */
export const WEEKLY_MODERN_COUNT = 5;

export interface WeeklyGrid {
  weekKey: string;
  /** Short label e.g. "Week 32". */
  label: string;
  seasons: DriverSeason[];
}

/** ISO week id shared by every player, e.g. `2026-W32`. */
export function isoWeekKey(date = new Date()): string {
  const d = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
  );
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(
    ((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7,
  );
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

export function hashWeekKey(weekKey: string): number {
  let h = 2166136261;
  for (let i = 0; i < weekKey.length; i++) {
    h ^= weekKey.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function shuffle<T>(items: T[], rng: Rng): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const a = copy[i]!;
    const b = copy[j]!;
    copy[i] = b;
    copy[j] = a;
  }
  return copy;
}

function takeN(pool: DriverSeason[], n: number, rng: Rng): DriverSeason[] {
  if (n <= 0 || !pool.length) return [];
  return shuffle(pool, rng).slice(0, Math.min(n, pool.length));
}

/**
 * Deterministic weekly puzzle: same 8 eligible seasons for everyone
 * in the ISO week. Mixes classic + modern DNA for a sharper heist.
 */
export function buildWeeklyGrid(
  eligible: DriverSeason[],
  date = new Date(),
): WeeklyGrid {
  const weekKey = isoWeekKey(date);
  const rng = mulberry32(hashWeekKey(`pd-grid-${weekKey}`));
  const sorted = [...eligible].sort((a, b) => a.id.localeCompare(b.id));
  const classic = sorted.filter((s) => s.year < 2014);
  const modern = sorted.filter((s) => s.year >= 2014);

  let picked = [
    ...takeN(classic, WEEKLY_CLASSIC_COUNT, rng),
    ...takeN(modern, WEEKLY_MODERN_COUNT, rng),
  ];

  if (picked.length < WEEKLY_GRID_SIZE) {
    const have = new Set(picked.map((s) => s.id));
    const rest = takeN(
      sorted.filter((s) => !have.has(s.id)),
      WEEKLY_GRID_SIZE - picked.length,
      rng,
    );
    picked = [...picked, ...rest];
  }

  const seasons = shuffle(picked, rng).slice(0, WEEKLY_GRID_SIZE);
  const weekNum = weekKey.split("-W")[1] ?? "";

  return {
    weekKey,
    label: `Week ${Number(weekNum) || weekNum}`,
    seasons,
  };
}

/** Share / UI tag for the active weekly grid. */
export function weeklyShareLine(weekKey: string | null | undefined): string | null {
  if (!weekKey) return null;
  return `Weekly Grid · ${weekKey}`;
}
