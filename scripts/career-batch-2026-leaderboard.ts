/**
 * Batch 100 careers fixed at 2026 start → aggregate career-era leaderboards.
 *
 * Protocol mirrors career-batch-100.ts except startYear is always 2026.
 *
 * Run: npm run balance:batch-2026-leaderboard
 * Env: BATCH_RUNS (default 100), BATCH_OUT (output path)
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import data from "../src/data/driverSeasons.json";
import { pickAutoDraftAttribute } from "../src/lib/autoDraft";
import { allCareerLeaderboardRows } from "../src/lib/careerLeaderboard";
import { isEligibleSeason } from "../src/lib/era";
import { LATEST_START_YEAR } from "../src/lib/f1Meta";
import { simulateCareer, pickRandom } from "../src/lib/game";
import { mulberry32 } from "../src/lib/ratings";
import { debutSeatOffers } from "../src/lib/seatOffers";
import type { DriverDataFile, LockedAttribute } from "../src/types";

const RUNS = Number(process.env.BATCH_RUNS ?? 100);
const START_YEAR = LATEST_START_YEAR;
const MIN_APPEARANCE_RATE = 0.2;
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT_PATH =
  process.env.BATCH_OUT ??
  path.join(ROOT, "scripts", "out", "career-batch-2026-leaderboard.json");

const pool = (data as DriverDataFile).seasons.filter(isEligibleSeason);

interface DriverAccum {
  name: string;
  isPlayer: boolean;
  appearances: number;
  rank1Count: number;
  top10Count: number;
  ranks: number[];
  titles: number[];
  wins: number[];
  podiums: number[];
  points: number[];
  seasons: number[];
}

function autoDraft(draftSeed: number): LockedAttribute[] {
  const rand = mulberry32(draftSeed);
  const locked: LockedAttribute[] = [];
  const usedSeasonIds: string[] = [];

  while (locked.length < 8) {
    const available = pool.filter((s) => !usedSeasonIds.includes(s.id));
    const source = available.length ? available : pool;
    const season = pickRandom(source, rand);
    usedSeasonIds.push(season.id);

    const key = pickAutoDraftAttribute(
      season,
      locked.map((l) => l.key),
    );
    if (!key) break;
    locked.push({ key, value: season.attributes[key], from: season });
  }

  return locked;
}

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function avg(xs: number[]): number {
  if (!xs.length) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function roundPct(n: number): number {
  return Math.round(n * 1000) / 10;
}

function ensureDriver(
  map: Map<string, DriverAccum>,
  name: string,
  isPlayer: boolean,
): DriverAccum {
  let row = map.get(name);
  if (!row) {
    row = {
      name,
      isPlayer,
      appearances: 0,
      rank1Count: 0,
      top10Count: 0,
      ranks: [],
      titles: [],
      wins: [],
      podiums: [],
      points: [],
      seasons: [],
    };
    map.set(name, row);
  }
  if (isPlayer) row.isPlayer = true;
  return row;
}

const started = performance.now();
const driverMap = new Map<string, DriverAccum>();
const playerRanks: number[] = [];
const playerTitles: number[] = [];
const playerWins: number[] = [];
const playerPodiums: number[] = [];
const playerPoints: number[] = [];
const playerSeasons: number[] = [];
let playerRank1Count = 0;
let playerTop10Count = 0;
const failures: { runIndex: number; error: string }[] = [];
let runsWithStandings = 0;

for (let i = 0; i < RUNS; i++) {
  const draftSeed = 10_000 + i * 17;
  const careerSeed = 50_000 + i * 31;
  const playerName = `Batch Driver ${i}`;

  try {
    const locked = autoDraft(draftSeed);
    if (locked.length < 8) {
      failures.push({ runIndex: i, error: `draft incomplete (${locked.length}/8)` });
      continue;
    }

    const offers = debutSeatOffers(locked, careerSeed, playerName, START_YEAR);
    const debutTeam =
      offers.find((o) => o.kind === "fit")?.team ?? offers[0]?.team ?? null;
    if (!debutTeam) {
      failures.push({ runIndex: i, error: "no debut seat" });
      continue;
    }

    const career = simulateCareer(locked, {
      seed: careerSeed,
      playerName,
      debutTeam,
      startYear: START_YEAR,
    });

    const rows = allCareerLeaderboardRows(career, playerName);
    if (career.seasons.some((s) => s.standings.length > 0)) runsWithStandings++;

    for (const row of rows) {
      if (row.isPlayer) {
        playerRanks.push(row.rank);
        playerTitles.push(row.titles);
        playerWins.push(row.wins);
        playerPodiums.push(row.podiums);
        playerPoints.push(row.points);
        playerSeasons.push(row.seasons);
        if (row.rank === 1) playerRank1Count += 1;
        if (row.rank <= 10) playerTop10Count += 1;
        continue;
      }

      const acc = ensureDriver(driverMap, row.name, false);
      acc.appearances += 1;
      acc.ranks.push(row.rank);
      acc.titles.push(row.titles);
      acc.wins.push(row.wins);
      acc.podiums.push(row.podiums);
      acc.points.push(row.points);
      acc.seasons.push(row.seasons);
      if (row.rank === 1) acc.rank1Count += 1;
      if (row.rank <= 10) acc.top10Count += 1;
    }
  } catch (err) {
    failures.push({
      runIndex: i,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

const completed = RUNS - failures.length;
const wallMs = Math.round(performance.now() - started);

interface AggregatedRow {
  name: string;
  isPlayer: boolean;
  appearances: number;
  appearanceRate: number;
  avgRank: number;
  medianRank: number;
  avgTitles: number;
  avgWins: number;
  avgPodiums: number;
  avgPoints: number;
  avgSeasons: number;
  rank1Count: number;
  rank1Rate: number;
  top10Count: number;
  top10Rate: number;
}

function toAggregated(acc: DriverAccum): AggregatedRow {
  return {
    name: acc.isPlayer ? "You (player)" : acc.name,
    isPlayer: acc.isPlayer,
    appearances: acc.appearances,
    appearanceRate: roundPct(acc.appearances / completed),
    avgRank: round1(avg(acc.ranks)),
    medianRank: round1(median(acc.ranks)),
    avgTitles: round1(avg(acc.titles)),
    avgWins: round1(avg(acc.wins)),
    avgPodiums: round1(avg(acc.podiums)),
    avgPoints: round1(avg(acc.points)),
    avgSeasons: round1(avg(acc.seasons)),
    rank1Count: acc.rank1Count,
    rank1Rate: roundPct(acc.rank1Count / completed),
    top10Count: acc.top10Count,
    top10Rate: roundPct(acc.top10Count / completed),
  };
}

const npcAggregated = [...driverMap.values()]
  .map(toAggregated)
  .sort((a, b) => {
    if (b.avgTitles !== a.avgTitles) return b.avgTitles - a.avgTitles;
    if (b.avgWins !== a.avgWins) return b.avgWins - a.avgWins;
    if (b.avgPoints !== a.avgPoints) return b.avgPoints - a.avgPoints;
    return b.appearances - a.appearances;
  });

const playerSummary = {
  label: "You (player)",
  runs: playerRanks.length,
  avgRank: round1(avg(playerRanks)),
  medianRank: round1(median(playerRanks)),
  avgTitles: round1(avg(playerTitles)),
  avgWins: round1(avg(playerWins)),
  avgPodiums: round1(avg(playerPodiums)),
  avgPoints: round1(avg(playerPoints)),
  avgSeasons: round1(avg(playerSeasons)),
  rank1Rate: roundPct(playerRank1Count / completed),
  top10Rate: roundPct(playerTop10Count / completed),
};

const playerRow: AggregatedRow = {
  name: "You (player)",
  isPlayer: true,
  appearances: playerRanks.length,
  appearanceRate: roundPct(playerRanks.length / completed),
  avgRank: playerSummary.avgRank,
  medianRank: playerSummary.medianRank,
  avgTitles: playerSummary.avgTitles,
  avgWins: playerSummary.avgWins,
  avgPodiums: playerSummary.avgPodiums,
  avgPoints: playerSummary.avgPoints,
  avgSeasons: playerSummary.avgSeasons,
  rank1Count: playerRank1Count,
  rank1Rate: playerSummary.rank1Rate,
  top10Count: playerTop10Count,
  top10Rate: playerSummary.top10Rate,
};

const meaningfulNpc = npcAggregated.filter(
  (r) => r.appearanceRate >= MIN_APPEARANCE_RATE * 100,
);

const averageLeaderboard = [playerRow, ...meaningfulNpc].sort((a, b) => {
  if (b.avgTitles !== a.avgTitles) return b.avgTitles - a.avgTitles;
  if (b.avgWins !== a.avgWins) return b.avgWins - a.avgWins;
  if (b.avgPoints !== a.avgPoints) return b.avgPoints - a.avgPoints;
  return a.avgRank - b.avgRank;
});

// Re-rank for display order
const rankedAverageBoard = averageLeaderboard.map((row, i) => ({
  ...row,
  avgBoardRank: i + 1,
}));

const rank1Frequency = npcAggregated
  .filter((r) => r.rank1Count > 0)
  .sort((a, b) => b.rank1Count - a.rank1Count || b.avgTitles - a.avgTitles)
  .slice(0, 15)
  .map((r) => ({
    name: r.name,
    count: r.rank1Count,
    pct: r.rank1Rate,
  }));

const top10Frequency = npcAggregated
  .sort((a, b) => b.top10Count - a.top10Count || b.avgTitles - a.avgTitles)
  .slice(0, 15)
  .map((r) => ({
    name: r.name,
    count: r.top10Count,
    pct: r.top10Rate,
  }));

const mostCommonNumber1 = rank1Frequency[0] ?? null;
const topOfAverageBoard = rankedAverageBoard[0] ?? null;

const report = {
  meta: {
    generatedAt: new Date().toISOString(),
    runsRequested: RUNS,
    runsCompleted: completed,
    failures: failures.length,
    runsWithStandings,
    wallTimeMs: wallMs,
    protocol: {
      draft: "8 spins from isEligibleSeason pool, auto-draft strongest attribute",
      startYear: START_YEAR,
      debutSeat: "fit offer from debutSeatOffers",
      control: "autopilot",
      decisionDensity: "medium (defaultDecisionDensityForNewCareer)",
      challengeMode: false,
      minAppearanceRatePct: MIN_APPEARANCE_RATE * 100,
    },
  },
  headline: {
    playerAvgRank: playerSummary.avgRank,
    playerMedianRank: playerSummary.medianRank,
    playerAvgTitles: playerSummary.avgTitles,
    playerAvgWins: playerSummary.avgWins,
    playerRank1Rate: playerSummary.rank1Rate,
    mostCommonNumber1: mostCommonNumber1?.name ?? null,
    mostCommonNumber1Pct: mostCommonNumber1?.pct ?? 0,
    topOfAverageBoard: topOfAverageBoard?.name ?? null,
    topOfAverageBoardAvgTitles: topOfAverageBoard?.avgTitles ?? 0,
  },
  playerSummary,
  averageLeaderboard: rankedAverageBoard,
  rank1Frequency,
  top10Frequency,
  failures,
};

mkdirSync(path.dirname(OUT_PATH), { recursive: true });
writeFileSync(OUT_PATH, JSON.stringify(report, null, 2));

console.log(`\n2026 career leaderboard batch — ${completed}/${RUNS} in ${wallMs}ms`);
console.log(`Output: ${OUT_PATH}\n`);
console.log("Headline:");
console.log(`  Player avg rank: ${report.headline.playerAvgRank}`);
console.log(`  Player avg titles: ${report.headline.playerAvgTitles} · wins: ${report.headline.playerAvgWins}`);
console.log(`  Most common #1: ${report.headline.mostCommonNumber1} (${report.headline.mostCommonNumber1Pct}%)`);
console.log(`  Top of average board: ${report.headline.topOfAverageBoard} (${report.headline.topOfAverageBoardAvgTitles} avg titles)`);
if (failures.length) console.log(`  Failures: ${failures.length}`);
