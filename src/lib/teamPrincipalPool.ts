import data from "@/data/driverSeasons.json";
import tenuresFile from "@/data/teamPrincipalTenures.json";
import type { DriverDataFile } from "@/types";

const dataset = data as DriverDataFile;

export const PRINCIPAL_ATTRIBUTE_KEYS = [
  "leadership",
  "strategy",
  "development",
] as const;

export type PrincipalAttributeKey = (typeof PRINCIPAL_ATTRIBUTE_KEYS)[number];

export type PrincipalAttributes = Record<PrincipalAttributeKey, number>;

export const PRINCIPAL_ATTRIBUTE_META: Record<
  PrincipalAttributeKey,
  { label: string; short: string; blurb: string }
> = {
  leadership: {
    label: "Leadership",
    short: "LEAD",
    blurb: "Titles, wins, and constructor rank while in charge.",
  },
  strategy: {
    label: "Strategy",
    short: "STRAT",
    blurb: "Points efficiency and finishing consistency under tenure.",
  },
  development: {
    label: "Development",
    short: "DEV",
    blurb: "Multi-year climb and sustained competitiveness.",
  },
};

export interface PrincipalTenure {
  team: string;
  startYear: number;
  endYear: number;
}

export interface PrincipalTenureRecord {
  id: string;
  name: string;
  tenures: PrincipalTenure[];
}

/** One draftable team-principal card. */
export interface TeamPrincipal {
  id: string;
  name: string;
  attributes: PrincipalAttributes;
  overall: number;
  /** Teams led (unique, tenure order). */
  teams: string[];
  startYear: number;
  endYear: number;
  /** Best constructor-year flavour under tenure. */
  peakTeam: string;
  peakYear: number;
  yearsLed: number;
}

type YearTeamStats = {
  points: number;
  wins: number;
  starts: number;
  dnfs: number;
  bestOverall: number;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function ratingFromUnit(unit: number, lo = 55, hi = 99): number {
  return Math.round(clamp(lo + unit * (hi - lo), lo, hi));
}

/** Aggregate driver-season rows into constructor year stats + ranks. */
function constructorYearTable(): Map<number, Map<string, YearTeamStats & { rank: number }>> {
  const byYear = new Map<number, Map<string, YearTeamStats>>();

  for (const row of dataset.seasons) {
    if (!row.team?.trim()) continue;
    let yearMap = byYear.get(row.year);
    if (!yearMap) {
      yearMap = new Map();
      byYear.set(row.year, yearMap);
    }
    const cur = yearMap.get(row.team) ?? {
      points: 0,
      wins: 0,
      starts: 0,
      dnfs: 0,
      bestOverall: 0,
    };
    cur.points += row.points;
    cur.wins += row.wins;
    cur.starts += row.races;
    cur.dnfs += row.dnfs;
    cur.bestOverall = Math.max(cur.bestOverall, row.overall);
    yearMap.set(row.team, cur);
  }

  const ranked = new Map<number, Map<string, YearTeamStats & { rank: number }>>();
  for (const [year, teams] of byYear) {
    const ordered = [...teams.entries()].sort(
      (a, b) =>
        b[1].points - a[1].points ||
        b[1].wins - a[1].wins ||
        b[1].bestOverall - a[1].bestOverall,
    );
    const withRank = new Map<string, YearTeamStats & { rank: number }>();
    ordered.forEach(([name, stats], i) => {
      withRank.set(name, { ...stats, rank: i + 1 });
    });
    ranked.set(year, withRank);
  }
  return ranked;
}

type TenureYear = {
  team: string;
  year: number;
  rank: number;
  fieldSize: number;
  points: number;
  wins: number;
  starts: number;
  dnfs: number;
  bestOverall: number;
};

function collectTenureYears(
  record: PrincipalTenureRecord,
  table: Map<number, Map<string, YearTeamStats & { rank: number }>>,
): TenureYear[] {
  const out: TenureYear[] = [];
  for (const t of record.tenures) {
    for (let year = t.startYear; year <= t.endYear; year += 1) {
      const yearMap = table.get(year);
      const stats = yearMap?.get(t.team);
      if (!stats || !yearMap) continue;
      out.push({
        team: t.team,
        year,
        rank: stats.rank,
        fieldSize: yearMap.size,
        points: stats.points,
        wins: stats.wins,
        starts: stats.starts,
        dnfs: stats.dnfs,
        bestOverall: stats.bestOverall,
      });
    }
  }
  return out;
}

/**
 * Derive principal ratings from constructor outcomes during known tenures.
 * leadership ← titles / wins / average rank
 * strategy ← points efficiency + finish rate
 * development ← multi-year climb / sustained top-half share
 */
export function derivePrincipalAttributes(
  years: TenureYear[],
): PrincipalAttributes {
  if (!years.length) {
    return { leadership: 60, strategy: 60, development: 60 };
  }

  const n = years.length;
  const titles = years.filter((y) => y.rank === 1).length;
  const podiums = years.filter((y) => y.rank <= 3).length;
  const avgRankUnit =
    years.reduce((s, y) => s + (1 - (y.rank - 1) / Math.max(1, y.fieldSize - 1)), 0) /
    n;
  const titleShare = titles / n;
  const podiumShare = podiums / n;

  const leadership = ratingFromUnit(
    clamp(avgRankUnit * 0.45 + titleShare * 0.35 + podiumShare * 0.2, 0, 1),
  );

  const finishRate =
    years.reduce(
      (s, y) => s + (1 - y.dnfs / Math.max(1, y.starts)),
      0,
    ) / n;
  const pointsDensity =
    years.reduce((s, y) => s + y.points / Math.max(8, y.starts / 2), 0) / n;
  const pointsUnit = clamp(pointsDensity / 40, 0, 1);
  const strategy = ratingFromUnit(
    clamp(pointsUnit * 0.55 + finishRate * 0.35 + avgRankUnit * 0.1, 0, 1),
  );

  const sorted = [...years].sort((a, b) => a.year - b.year);
  const early = sorted.slice(0, Math.max(1, Math.floor(sorted.length / 2)));
  const late = sorted.slice(Math.floor(sorted.length / 2));
  const earlyRank =
    early.reduce((s, y) => s + y.rank / y.fieldSize, 0) / early.length;
  const lateRank =
    late.reduce((s, y) => s + y.rank / y.fieldSize, 0) / late.length;
  const climb = clamp((earlyRank - lateRank + 0.35) / 0.7, 0, 1);
  const topHalf =
    years.filter((y) => y.rank <= Math.ceil(y.fieldSize / 2)).length / n;
  const longevity = clamp((n - 1) / 12, 0, 1);
  const development = ratingFromUnit(
    clamp(climb * 0.4 + topHalf * 0.4 + longevity * 0.2, 0, 1),
  );

  return { leadership, strategy, development };
}

export function principalOverall(attrs: PrincipalAttributes): number {
  const sum = PRINCIPAL_ATTRIBUTE_KEYS.reduce((n, k) => n + attrs[k], 0);
  return Math.round(sum / PRINCIPAL_ATTRIBUTE_KEYS.length);
}

let cachedPool: TeamPrincipal[] | null = null;

export function loadPrincipalTenures(): PrincipalTenureRecord[] {
  return (tenuresFile as { principals: PrincipalTenureRecord[] }).principals.filter(
    (p) => p.tenures.length > 0,
  );
}

/** Build draftable principal cards from tenure list + constructor outcomes. */
export function buildPrincipalPool(): TeamPrincipal[] {
  if (cachedPool) return cachedPool;

  const table = constructorYearTable();
  const pool: TeamPrincipal[] = [];

  for (const record of loadPrincipalTenures()) {
    const years = collectTenureYears(record, table);
    if (!years.length) continue;

    const attributes = derivePrincipalAttributes(years);
    const teams: string[] = [];
    for (const t of record.tenures) {
      if (!teams.includes(t.team)) teams.push(t.team);
    }
    const peak = [...years].sort(
      (a, b) =>
        a.rank - b.rank || b.points - a.points || b.bestOverall - a.bestOverall,
    )[0]!;

    pool.push({
      id: record.id,
      name: record.name,
      attributes,
      overall: principalOverall(attributes),
      teams,
      startYear: Math.min(...years.map((y) => y.year)),
      endYear: Math.max(...years.map((y) => y.year)),
      peakTeam: peak.team,
      peakYear: peak.year,
      yearsLed: years.length,
    });
  }

  cachedPool = pool;
  return pool;
}

/** Reset cache — tests only. */
export function resetPrincipalPoolCache() {
  cachedPool = null;
}

export function pickPrincipal(
  pool: TeamPrincipal[],
  usedIds: string[],
  rand: () => number = Math.random,
): TeamPrincipal {
  const available = pool.filter((p) => !usedIds.includes(p.id));
  const source = available.length ? available : pool;
  return source[Math.floor(rand() * source.length)]!;
}

/** Serialize pool for scripts / committed JSON artifact. */
export function serializePrincipalPool(pool: TeamPrincipal[]) {
  return {
    generatedAt: new Date().toISOString().slice(0, 10),
    count: pool.length,
    principals: pool,
  };
}
