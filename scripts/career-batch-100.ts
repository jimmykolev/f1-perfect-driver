/**
 * Batch career simulation: auto-draft drivers → autopilot careers → JSON report.
 *
 * Protocol:
 * - Pool: eligible seasons (same filter as UI draft via isEligibleSeason)
 * - Draft: 8 spins, auto-draft strongest open attribute (autoDraft mode)
 * - Start year: sampled from AVAILABLE_START_YEARS (varied eras)
 * - Debut: "fit" seat from debutSeatOffers (default UI selection)
 * - Career: autopilot + default decision density (medium / Story)
 * - Challenge mode: off
 *
 * Run: node scripts/run-balance.mjs career-batch-100.ts
 * Env: BATCH_RUNS (default 100), BATCH_OUT (output path)
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import data from "../src/data/driverSeasons.json";
import { pickAutoDraftAttribute } from "../src/lib/autoDraft";
import { achievementBand } from "../src/lib/careerOutcome";
import { isEligibleSeason } from "../src/lib/era";
import { AVAILABLE_START_YEARS } from "../src/lib/f1Meta";
import { simulateCareer, pickRandom } from "../src/lib/game";
import { computeOverall, mulberry32 } from "../src/lib/ratings";
import { debutSeatOffers } from "../src/lib/seatOffers";
import { deriveTraits } from "../src/lib/traits";
import {
  ATTRIBUTE_KEYS,
  type AttributeKey,
  type CareerResult,
  type DriverDataFile,
  type LockedAttribute,
} from "../src/types";

const RUNS = Number(process.env.BATCH_RUNS ?? 100);
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT_PATH =
  process.env.BATCH_OUT ??
  path.join(ROOT, "scripts", "out", "career-batch-100.json");

const pool = (data as DriverDataFile).seasons.filter(isEligibleSeason);
const startYears = AVAILABLE_START_YEARS;

interface DraftRecord {
  attributes: Record<AttributeKey, number>;
  overall: number;
  archetype: string;
  traitIds: string[];
  draftSources: { key: AttributeKey; fromId: string; fromYear: number; fromName: string }[];
}

interface CareerRecord {
  runIndex: number;
  draftSeed: number;
  careerSeed: number;
  startYear: number;
  draft: DraftRecord;
  debutTeam: string;
  debutTier: number;
  seasons: number;
  debutAge: number;
  finalAge: number;
  endReason: CareerResult["endReason"];
  walkedAway: boolean;
  titles: number;
  wins: number;
  podiums: number;
  poles: number;
  points: number;
  bestFinish: number;
  bestTeam: string;
  tier: CareerResult["tier"];
  tierLabel: string;
  achievementBand: string;
  archetype: string;
  pathMarks: CareerResult["pathMarks"];
  rivalHeat: string | null;
  rivalMeetings: number;
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

function pickStartYear(careerSeed: number): number {
  const rand = mulberry32(careerSeed ^ 0x9e3779b9);
  return pickRandom(startYears, rand);
}

function draftRecord(locked: LockedAttribute[]): DraftRecord {
  const attributes = Object.fromEntries(
    locked.map((l) => [l.key, l.value]),
  ) as Record<AttributeKey, number>;
  const traits = deriveTraits(locked);
  return {
    attributes,
    overall: computeOverall(attributes),
    archetype: "", // filled after sim
    traitIds: traits.map((t) => t.id),
    draftSources: locked.map((l) => ({
      key: l.key,
      fromId: l.from.id,
      fromYear: l.from.year,
      fromName: l.from.name,
    })),
  };
}

function bestTeam(seasons: CareerResult["seasons"]): string {
  if (!seasons.length) return "";
  let best = seasons[0]!;
  for (const s of seasons) {
    if (s.position < best.position) best = s;
    else if (s.position === best.position && s.points > best.points) best = s;
  }
  return best.team;
}

function winsBucket(wins: number): string {
  if (wins === 0) return "0";
  if (wins <= 3) return "1-3";
  if (wins <= 10) return "4-10";
  return "11+";
}

function titlesBucket(titles: number): string {
  if (titles === 0) return "0";
  if (titles === 1) return "1";
  return "2+";
}

function inc(map: Record<string, number>, key: string, n = 1) {
  map[key] = (map[key] ?? 0) + n;
}

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function topPairs(
  pairs: Record<string, number>,
  n = 8,
): { pair: string; count: number; pct: number }[] {
  return Object.entries(pairs)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([pair, count]) => ({
      pair,
      count,
      pct: Math.round((count / RUNS) * 1000) / 10,
    }));
}

function overallQuartileCorrelation(careers: CareerRecord[]) {
  const sorted = [...careers].sort((a, b) => a.draft.overall - b.draft.overall);
  const qSize = Math.ceil(sorted.length / 4);
  const buckets = ["Q1 (lowest OVR)", "Q2", "Q3", "Q4 (highest OVR)"];
  return buckets.map((label, i) => {
    const slice = sorted.slice(i * qSize, (i + 1) * qSize);
    const withTitle = slice.filter((c) => c.titles >= 1).length;
    const avgWins = slice.reduce((s, c) => s + c.wins, 0) / (slice.length || 1);
    const avgOverall =
      slice.reduce((s, c) => s + c.draft.overall, 0) / (slice.length || 1);
    return {
      bucket: label,
      n: slice.length,
      avgOverall: Math.round(avgOverall * 10) / 10,
      titleRate: Math.round((withTitle / (slice.length || 1)) * 1000) / 10,
      avgWins: Math.round(avgWins * 10) / 10,
    };
  });
}

function briefCareer(c: CareerRecord) {
  return {
    runIndex: c.runIndex,
    overall: c.draft.overall,
    startYear: c.startYear,
    tier: c.tier,
    band: c.achievementBand,
    titles: c.titles,
    wins: c.wins,
    seasons: c.seasons,
    endReason: c.endReason,
    walkedAway: c.walkedAway,
    debutTeam: c.debutTeam,
    summary: `${c.tierLabel} · ${c.titles} titles · ${c.wins}W · ${c.seasons} seasons · ${c.endReason}${c.walkedAway ? " (walked away)" : ""}`,
  };
}

const started = performance.now();
const careers: CareerRecord[] = [];
const failures: { runIndex: number; error: string }[] = [];

for (let i = 0; i < RUNS; i++) {
  const draftSeed = 10_000 + i * 17;
  const careerSeed = 50_000 + i * 31;

  try {
    const locked = autoDraft(draftSeed);
    if (locked.length < 8) {
      failures.push({ runIndex: i, error: `draft incomplete (${locked.length}/8)` });
      continue;
    }

    const startYear = pickStartYear(careerSeed);
    const offers = debutSeatOffers(locked, careerSeed, `Batch Driver ${i}`, startYear);
    const debutTeam =
      offers.find((o) => o.kind === "fit")?.team ?? offers[0]?.team ?? null;
    if (!debutTeam) {
      failures.push({ runIndex: i, error: "no debut seat" });
      continue;
    }

    const result = simulateCareer(locked, {
      seed: careerSeed,
      playerName: `Batch Driver ${i}`,
      debutTeam,
      startYear,
    });

    const draft = draftRecord(locked);
    draft.archetype = result.archetype;
    const debutSeason = result.seasons[0];

    careers.push({
      runIndex: i,
      draftSeed,
      careerSeed,
      startYear,
      draft,
      debutTeam,
      debutTier: debutSeason?.teamTier ?? 0,
      seasons: result.seasons.length,
      debutAge: result.debutAge,
      finalAge: result.finalAge,
      endReason: result.endReason,
      walkedAway: result.pathMarks.walkedAway,
      titles: result.titles,
      wins: result.wins,
      podiums: result.podiums,
      poles: result.poles,
      points: result.points,
      bestFinish: result.bestFinish,
      bestTeam: bestTeam(result.seasons),
      tier: result.tier,
      tierLabel: result.tierLabel,
      achievementBand: achievementBand(result.tier, result),
      archetype: result.archetype,
      pathMarks: result.pathMarks,
      rivalHeat: result.rival?.heat ?? null,
      rivalMeetings: result.rival?.meetings ?? 0,
    });
  } catch (err) {
    failures.push({
      runIndex: i,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

const wallMs = Math.round(performance.now() - started);

// Aggregates
const tierDist: Record<string, number> = {};
const bandDist: Record<string, number> = {};
const archetypeDist: Record<string, number> = {};
const endReasonDist: Record<string, number> = {};
const endReasonEffective: Record<string, number> = {};
const titlesDist: Record<string, number> = {};
const winsDist: Record<string, number> = {};
const seasonLengthDist: Record<string, number> = {};
const tierEndPairs: Record<string, number> = {};
const startYearDist: Record<string, number> = {};
const rivalHeatDist: Record<string, number> = {};

const overalls: number[] = [];
const winsList: number[] = [];
const titlesList: number[] = [];
const seasonsList: number[] = [];

for (const c of careers) {
  inc(tierDist, c.tier);
  inc(bandDist, c.achievementBand);
  inc(archetypeDist, c.archetype);
  inc(endReasonDist, c.endReason);
  inc(
    endReasonEffective,
    c.walkedAway ? "walkedAway" : c.endReason,
  );
  inc(titlesDist, titlesBucket(c.titles));
  inc(winsDist, winsBucket(c.wins));
  inc(seasonLengthDist, String(c.seasons));
  inc(tierEndPairs, `${c.tier} × ${c.walkedAway ? "walkedAway" : c.endReason}`);
  inc(startYearDist, String(c.startYear));
  if (c.rivalHeat) inc(rivalHeatDist, c.rivalHeat);
  overalls.push(c.draft.overall);
  winsList.push(c.wins);
  titlesList.push(c.titles);
  seasonsList.push(c.seasons);
}

const sortedByTitles = [...careers].sort((a, b) => b.titles - a.titles || b.wins - a.wins);
const sortedByWins = [...careers].sort((a, b) => a.wins - b.wins || a.titles - b.titles);
const topExamples = sortedByTitles.slice(0, 5).map(briefCareer);
const bottomExamples = sortedByWins.slice(0, 5).map(briefCareer);

const mostCommonTier = Object.entries(tierDist).sort((a, b) => b[1] - a[1])[0];
const mostCommonEndReason = Object.entries(endReasonEffective).sort(
  (a, b) => b[1] - a[1],
)[0];

const pathMarkRates = {
  sabbatical: careers.filter((c) => c.pathMarks.hadSabbatical).length / careers.length,
  number2: careers.filter((c) => c.pathMarks.number2Teams.length > 0).length / careers.length,
  walkedAway: careers.filter((c) => c.pathMarks.walkedAway).length / careers.length,
  dramaBeats: careers.filter((c) => (c.pathMarks.dramaBeats?.length ?? 0) > 0).length / careers.length,
  ghost: careers.filter((c) => c.pathMarks.ghost?.seasons.length).length / careers.length,
};

const report = {
  meta: {
    generatedAt: new Date().toISOString(),
    runsRequested: RUNS,
    runsCompleted: careers.length,
    failures: failures.length,
    wallTimeMs: wallMs,
    protocol: {
      draft: "8 spins from isEligibleSeason pool, auto-draft strongest attribute",
      startYear: "random from AVAILABLE_START_YEARS per career seed",
      debutSeat: "fit offer from debutSeatOffers",
      control: "autopilot",
      decisionDensity: "medium (defaultDecisionDensityForNewCareer)",
      challengeMode: false,
    },
  },
  headline: {
    mostCommonTier: mostCommonTier?.[0] ?? null,
    mostCommonTierPct: mostCommonTier
      ? Math.round((mostCommonTier[1] / careers.length) * 1000) / 10
      : 0,
    mostCommonEndReason: mostCommonEndReason?.[0] ?? null,
    mostCommonEndReasonPct: mostCommonEndReason
      ? Math.round((mostCommonEndReason[1] / careers.length) * 1000) / 10
      : 0,
    medianWins: median(winsList),
    medianSeasons: median(seasonsList),
    titleRate: Math.round(
      (careers.filter((c) => c.titles >= 1).length / careers.length) * 1000,
    ) / 10,
    twoPlusTitleRate: Math.round(
      (careers.filter((c) => c.titles >= 2).length / careers.length) * 1000,
    ) / 10,
    avgOverall: Math.round(
      (overalls.reduce((a, b) => a + b, 0) / overalls.length) * 10,
    ) / 10,
  },
  aggregates: {
    tierDist,
    bandDist,
    archetypeDist,
    endReasonDist,
    endReasonEffective,
    titlesDist,
    winsDist,
    seasonLengthDist,
    tierEndPairs: topPairs(tierEndPairs),
    startYearDist,
    rivalHeatDist,
    pathMarkRates,
    overallQuartiles: overallQuartileCorrelation(careers),
  },
  examples: { top: topExamples, bottom: bottomExamples },
  failures,
  careers,
};

mkdirSync(path.dirname(OUT_PATH), { recursive: true });
writeFileSync(OUT_PATH, JSON.stringify(report, null, 2));

console.log(`\nCareer batch — ${careers.length}/${RUNS} completed in ${wallMs}ms`);
console.log(`Output: ${OUT_PATH}\n`);
console.log("Headline:");
console.log(`  Most common tier: ${report.headline.mostCommonTier} (${report.headline.mostCommonTierPct}%)`);
console.log(`  Most common end: ${report.headline.mostCommonEndReason} (${report.headline.mostCommonEndReasonPct}%)`);
console.log(`  Median wins: ${report.headline.medianWins} · title rate: ${report.headline.titleRate}%`);
if (failures.length) {
  console.log(`  Failures: ${failures.length}`);
}
