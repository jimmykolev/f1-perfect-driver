import type { CareerResult } from "@/types";

export interface CareerLeaderboardRow {
  rank: number;
  name: string;
  isPlayer: boolean;
  titles: number;
  wins: number;
  podiums: number;
  points: number;
  seasons: number;
  /** Most recent team in this career window. */
  lastTeam: string;
}

export interface CareerLeaderboard {
  rows: CareerLeaderboardRow[];
  totalDrivers: number;
  playerRank: number | null;
  /** True when at least one season stored full WDC standings. */
  fromStandings: boolean;
  /** List is cut to top N with the player pinned when outside. */
  truncated: boolean;
  /** Player row appended below the top-N cut. */
  playerPinned: boolean;
}

interface DriverTotals {
  name: string;
  isPlayer: boolean;
  titles: number;
  wins: number;
  podiums: number;
  points: number;
  seasons: number;
  lastTeam: string;
  lastYear: number;
}

const TOP_N = 15;
const FULL_LIST_MAX = 22;

function compareTotals(a: DriverTotals, b: DriverTotals): number {
  if (b.titles !== a.titles) return b.titles - a.titles;
  if (b.wins !== a.wins) return b.wins - a.wins;
  if (b.points !== a.points) return b.points - a.points;
  if (b.podiums !== a.podiums) return b.podiums - a.podiums;
  if (b.seasons !== a.seasons) return b.seasons - a.seasons;
  return a.name.localeCompare(b.name);
}

function aggregateFromStandings(career: CareerResult): Map<string, DriverTotals> {
  const drivers = new Map<string, DriverTotals>();

  for (const season of career.seasons) {
    if (!season.standings.length) continue;
    for (const row of season.standings) {
      const existing = drivers.get(row.name) ?? {
        name: row.name,
        isPlayer: false,
        titles: 0,
        wins: 0,
        podiums: 0,
        points: 0,
        seasons: 0,
        lastTeam: row.team,
        lastYear: season.year,
      };
      existing.isPlayer = existing.isPlayer || row.isPlayer;
      existing.titles += row.position === 1 ? 1 : 0;
      existing.wins += row.wins;
      existing.podiums += row.podiums;
      existing.points += row.points;
      existing.seasons += 1;
      if (season.year >= existing.lastYear) {
        existing.lastTeam = row.team;
        existing.lastYear = season.year;
      }
      drivers.set(row.name, existing);
    }
  }

  return drivers;
}

/** Best-effort rows when season standings were not persisted (older saves). */
function aggregateFallback(
  career: CareerResult,
  playerName: string,
): Map<string, DriverTotals> {
  const drivers = new Map<string, DriverTotals>();

  const upsert = (
    name: string,
    patch: Partial<Omit<DriverTotals, "name">> & { lastYear?: number },
  ) => {
    const existing = drivers.get(name) ?? {
      name,
      isPlayer: name === playerName,
      titles: 0,
      wins: 0,
      podiums: 0,
      points: 0,
      seasons: 0,
      lastTeam: "",
      lastYear: 0,
    };
    if (patch.isPlayer != null) existing.isPlayer = patch.isPlayer;
    if (patch.titles != null) existing.titles += patch.titles;
    if (patch.wins != null) existing.wins += patch.wins;
    if (patch.podiums != null) existing.podiums += patch.podiums;
    if (patch.points != null) existing.points += patch.points;
    if (patch.seasons != null) existing.seasons += patch.seasons;
    if (patch.lastTeam != null) existing.lastTeam = patch.lastTeam;
    if (patch.lastYear != null && patch.lastYear >= existing.lastYear) {
      existing.lastYear = patch.lastYear;
      if (patch.lastTeam != null) existing.lastTeam = patch.lastTeam;
    }
    drivers.set(name, existing);
  };

  const lastSeason = career.seasons[career.seasons.length - 1];
  upsert(playerName, {
    isPlayer: true,
    titles: career.titles,
    wins: career.wins,
    podiums: career.podiums,
    points: career.points,
    seasons: career.seasons.length,
    lastTeam: lastSeason?.team ?? "",
    lastYear: lastSeason?.year ?? 0,
  });

  for (const season of career.seasons) {
    if (season.championName && season.championName !== playerName) {
      upsert(season.championName, {
        titles: 1,
        seasons: 1,
        lastTeam: season.standings[0]?.team ?? "",
        lastYear: season.year,
      });
    }
  }

  for (const rival of career.rivals ?? []) {
    if (rival.name === playerName) continue;
    upsert(rival.name, {
      titles: rival.theirTitles,
      seasons: rival.meetings,
      lastTeam: rival.teams[rival.teams.length - 1] ?? "",
      lastYear: rival.yearTo,
    });
  }

  return drivers;
}

function rankRows(sorted: DriverTotals[]): CareerLeaderboardRow[] {
  let rank = 0;
  let prev: DriverTotals | null = null;
  return sorted.map((row, index) => {
    if (
      !prev ||
      row.titles !== prev.titles ||
      row.wins !== prev.wins ||
      row.points !== prev.points ||
      row.podiums !== prev.podiums
    ) {
      rank = index + 1;
    }
    prev = row;
    return {
      rank,
      name: row.name,
      isPlayer: row.isPlayer,
      titles: row.titles,
      wins: row.wins,
      podiums: row.podiums,
      points: row.points,
      seasons: row.seasons,
      lastTeam: row.lastTeam,
    };
  });
}

/** Top N plus the player when they sit outside the cut. */
export function selectLeaderboardRows(
  all: CareerLeaderboardRow[],
  topN = TOP_N,
): { rows: CareerLeaderboardRow[]; playerPinned: boolean } {
  if (all.length <= FULL_LIST_MAX) {
    return { rows: all, playerPinned: false };
  }

  const player = all.find((row) => row.isPlayer);
  const top = all.slice(0, topN);
  if (!player || top.some((row) => row.isPlayer)) {
    return { rows: top, playerPinned: false };
  }

  return { rows: [...top, player], playerPinned: true };
}

/** Full ranked list (no top-N truncation) for batch aggregation. */
export function allCareerLeaderboardRows(
  career: CareerResult,
  playerName: string,
): CareerLeaderboardRow[] {
  const fromStandings = career.seasons.some((s) => s.standings.length > 0);
  const drivers = fromStandings
    ? aggregateFromStandings(career)
    : aggregateFallback(career, playerName);
  if (!drivers.size) return [];
  return rankRows([...drivers.values()].sort(compareTotals));
}

/**
 * Aggregate career totals for every driver who appeared in this simulated
 * world, ranked titles → wins → points → podiums → seasons.
 */
export function buildCareerLeaderboard(
  career: CareerResult,
  playerName: string,
): CareerLeaderboard {
  const fromStandings = career.seasons.some((s) => s.standings.length > 0);
  const drivers = fromStandings
    ? aggregateFromStandings(career)
    : aggregateFallback(career, playerName);

  if (!drivers.size) {
    return {
      rows: [],
      totalDrivers: 0,
      playerRank: null,
      fromStandings: false,
      truncated: false,
      playerPinned: false,
    };
  }

  const sorted = [...drivers.values()].sort(compareTotals);
  const ranked = rankRows(sorted);
  const playerRow = ranked.find((row) => row.isPlayer);
  const { rows: visible, playerPinned } = selectLeaderboardRows(ranked);

  return {
    rows: visible,
    totalDrivers: ranked.length,
    playerRank: playerRow?.rank ?? null,
    fromStandings,
    truncated: visible.length < ranked.length,
    playerPinned,
  };
}
