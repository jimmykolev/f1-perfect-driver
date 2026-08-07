import type { CareerResult, CareerTier } from "@/types";

const STORAGE_KEY = "f1pd-hall-of-fame-v1";
const MAX_ENTRIES = 24;

const TIER_RANK: Record<CareerTier, number> = {
  legend: 6,
  champion: 5,
  raceWinner: 4,
  podiumThreat: 3,
  pointsRegular: 2,
  nobody: 1,
};

export interface CareerArchiveEntry {
  id: string;
  driverName: string;
  tier: CareerResult["tier"];
  tierLabel: string;
  titles: number;
  wins: number;
  podiums: number;
  points: number;
  overall: number;
  archetype: string;
  debutTeam: string | null;
  yearSpan: string | null;
  rivalName: string | null;
  rivalBlurb: string | null;
  summary: string;
  finishedAt: number;
  seed: number;
}

function readRaw(): CareerArchiveEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CareerArchiveEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeRaw(entries: CareerArchiveEntry[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)));
  } catch {
    // ignore quota / private mode
  }
}

/** Finished careers, newest first. */
export function getCareerHistory(): CareerArchiveEntry[] {
  return readRaw().sort((a, b) => b.finishedAt - a.finishedAt);
}

/** @deprecated Use getCareerHistory */
export const getHallOfFame = getCareerHistory;

/** Best archived career: tier, then titles, then wins. */
export function pickPersonalBest(
  entries: CareerArchiveEntry[],
): CareerArchiveEntry | null {
  if (!entries.length) return null;
  return [...entries].sort((a, b) => {
    const tier = (TIER_RANK[b.tier] ?? 0) - (TIER_RANK[a.tier] ?? 0);
    if (tier !== 0) return tier;
    if (b.titles !== a.titles) return b.titles - a.titles;
    if (b.wins !== a.wins) return b.wins - a.wins;
    return b.finishedAt - a.finishedAt;
  })[0]!;
}

/** Most common rival across careers; only when they appear at least twice. */
export function recurringRival(
  entries: CareerArchiveEntry[],
): { name: string; count: number } | null {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    if (!entry.rivalName) continue;
    counts.set(entry.rivalName, (counts.get(entry.rivalName) ?? 0) + 1);
  }
  let best: { name: string; count: number } | null = null;
  for (const [name, count] of counts) {
    if (count < 2) continue;
    if (!best || count > best.count) best = { name, count };
  }
  return best;
}

export function archiveCareer(
  driverName: string,
  career: CareerResult,
): CareerArchiveEntry {
  const first = career.seasons[0];
  const last = career.seasons[career.seasons.length - 1];
  const yearSpan =
    first && last
      ? first.year === last.year
        ? `${first.year}`
        : `${first.year}–${last.year}`
      : null;

  const entry: CareerArchiveEntry = {
    id: `${career.seed}-${Date.now()}`,
    driverName: driverName || "Driver",
    tier: career.tier,
    tierLabel: career.tierLabel,
    titles: career.titles,
    wins: career.wins,
    podiums: career.podiums,
    points: career.points,
    overall: career.overall,
    archetype: career.archetype,
    debutTeam: first?.team ?? null,
    yearSpan,
    rivalName: career.rival?.name ?? null,
    rivalBlurb: career.rival?.blurb ?? null,
    summary: career.summary,
    finishedAt: Date.now(),
    seed: career.seed,
  };

  const next = [entry, ...readRaw().filter((e) => e.id !== entry.id)];
  writeRaw(next);
  return entry;
}

export function clearCareerHistory() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

/** @deprecated Use clearCareerHistory */
export const clearHallOfFame = clearCareerHistory;
