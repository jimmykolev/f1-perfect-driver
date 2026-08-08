import birthData from "@/data/driverBirthDates.json";
import data from "@/data/driverSeasons.json";
import {
  ATTRIBUTE_KEYS,
  type AttributeKey,
  type Attributes,
  type ConstructorEntry,
  type DnfReason,
  type DriverDataFile,
  type DriverSeason,
  type RaceResult,
  type StandingEntry,
} from "@/types";
import {
  LATEST_START_YEAR,
  TEAM_BLUEPRINTS_2026,
  isRegulationReset,
  racePoints,
  rulesForYear,
  sprintPoints,
  tierFromRank,
  type SeasonRules,
  type TeamBlueprint,
} from "./f1Meta";
import { successorAmong } from "./constructorLineage";
import { juniorsForYear, pickJunior, type Prospect } from "./juniors";
import { computeOverall, type Rng } from "./ratings";
import { DEFAULT_DRIVER_AGE, DRIVER_AGES_2026 } from "./roster";

const dataset = data as DriverDataFile;
const BIRTH_DATES = (birthData as { birthDates: Record<string, string> })
  .birthDates;

/** Age at roughly mid-season, which is how a driver's age is usually quoted. */
function realAgeInYear(name: string, year: number): number | null {
  const date = BIRTH_DATES[name];
  if (!date) return null;
  const [born, month] = date.split("-").map(Number);
  if (!born || !month) return null;
  return year - born - (month > 7 ? 1 : 0);
}

/* ------------------------------------------------------------------ *
 * Small helpers
 * ------------------------------------------------------------------ */

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function sampleNormal(rand: Rng) {
  const u = Math.max(1e-9, rand());
  const v = Math.max(1e-9, rand());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Pick from the strongest few candidates so signings are not fully deterministic. */
function weightedTopPick<T>(
  items: T[],
  score: (item: T) => number,
  rand: Rng,
): T | null {
  if (!items.length) return null;
  const ranked = [...items].sort((a, b) => score(b) - score(a)).slice(0, 3);
  const weights = [0.62, 0.26, 0.12].slice(0, ranked.length);
  const total = weights.reduce((a, b) => a + b, 0);
  let roll = rand() * total;
  for (let i = 0; i < ranked.length; i++) {
    roll -= weights[i]!;
    if (roll <= 0) return ranked[i]!;
  }
  return ranked[0]!;
}

/* ------------------------------------------------------------------ *
 * Ageing model
 * ------------------------------------------------------------------ */

/** Fraction of peak ability available at a given age (1.0 during the prime years). */
export function ageMultiplier(age: number): number {
  if (age <= 17) return 0.84;
  if (age < 27) return 0.84 + (age - 17) * 0.016;
  if (age <= 30) return 1;
  const over = age - 30;
  return Math.max(
    0.58,
    1 -
      over * 0.012 -
      Math.max(0, over - 4) * 0.014 -
      Math.max(0, over - 8) * 0.012,
  );
}

/**
 * How strongly each attribute tracks the age curve.
 * Raw speed fades fast; craft and mentality are mostly experience.
 */
const AGE_SENSITIVITY: Record<AttributeKey, number> = {
  qualifying: 1.2,
  racePace: 1.05,
  raceCraft: 0.5,
  frontRunning: 0.8,
  scoring: 0.45,
  mentality: 0.3,
  reliability: 0.65,
  momentum: 1.25,
};

function ageStepFactor(fromAge: number, toAge: number, key: AttributeKey) {
  const base = ageMultiplier(toAge) / ageMultiplier(fromAge);
  return 1 + (base - 1) * AGE_SENSITIVITY[key];
}

/** Scale a peak-ability build down to what a driver of this age can actually deliver. */
export function attributesAtAge(peak: Attributes, age: number): Attributes {
  const factor = ageMultiplier(age);
  const out = {} as Attributes;
  for (const key of ATTRIBUTE_KEYS) {
    const scaled = peak[key] * (1 + (factor - 1) * AGE_SENSITIVITY[key]);
    out[key] = clamp(Math.round(scaled), 40, 99);
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Drivers, teams and the world
 * ------------------------------------------------------------------ */

export interface TeamState {
  name: string;
  power: number;
  reliability: number;
  resources: number;
  /** 0 = fastest car of the season. */
  rank: number;
  /** 1 (front) to 5 (back), derived from rank. */
  tier: number;
}

export interface FieldDriver {
  id: string;
  name: string;
  team: string;
  age: number;
  attributes: Attributes;
  overall: number;
  /** Ceiling this driver can still grow into. */
  potential: number;
  /** 0-1 rolling standing in the paddock; 0.5 is par for the car. */
  reputation: number;
  seasonsInF1: number;
  seasonsAtTeam: number;
  /** Years left on the current deal; rivals rarely prise a driver out early. */
  contractYears: number;
  titles: number;
  careerWins: number;
  isPlayer: boolean;
  yearsWithoutSeat: number;
  /** Set during an off-season so a team cannot re-sign who it just released. */
  droppedBy?: string;
  /** Only the player keeps a fixed peak build; the AI walks its own curve. */
  peak?: Attributes;
}

export interface World {
  year: number;
  teams: TeamState[];
  drivers: FieldDriver[];
  freeAgents: FieldDriver[];
  prospects: Prospect[];
  usedNames: Set<string>;
  playerActive: boolean;
  /** Active calendar / points rules for `year`. */
  rules: SeasonRules;
}

const JUNIOR_PROGRAMME_TEAMS = new Set([
  "Red Bull",
  "Racing Bulls",
  "Toro Rosso",
  "AlphaTauri",
  "Ferrari",
  "McLaren",
  "Mercedes",
  "Alpine",
  "Renault",
  "Williams",
]);

/** Recency weights when blending a driver's recent seasons into a rating. */
const BLEND_WEIGHTS = [0.46, 0.28, 0.16, 0.1];

function blendedAttributes(name: string, asOfYear: number): Attributes | null {
  const rows = dataset.seasons
    .filter((s) => s.name === name && s.year <= asOfYear && s.races >= 3)
    .sort((a, b) => b.year - a.year)
    .slice(0, BLEND_WEIGHTS.length);
  if (!rows.length) return null;

  const totals = {} as Attributes;
  for (const key of ATTRIBUTE_KEYS) totals[key] = 0;
  let weightSum = 0;

  rows.forEach((row, i) => {
    const weight = BLEND_WEIGHTS[i]!;
    weightSum += weight;
    for (const key of ATTRIBUTE_KEYS) {
      totals[key] += row.attributes[key] * weight;
    }
  });

  const out = {} as Attributes;
  for (const key of ATTRIBUTE_KEYS) {
    out[key] = clamp(Math.round(totals[key] / weightSum), 45, 99);
  }
  return out;
}

function seasonsRacedBefore(name: string, year: number): number {
  return new Set(
    dataset.seasons
      .filter((s) => s.name === name && s.year < year)
      .map((s) => s.year),
  ).size;
}

/** Fallback birth year: the 2026 age map, else a first appearance as a ~22yo. */
function estimatedBirthYear(name: string): number {
  const ageIn2026 = DRIVER_AGES_2026[name];
  if (ageIn2026 != null) return 2026 - ageIn2026;
  const first = dataset.seasons
    .filter((s) => s.name === name)
    .map((s) => s.year)
    .sort((a, b) => a - b)[0];
  return (first ?? LATEST_START_YEAR) - 22;
}

export function driverAgeInYear(name: string, year: number): number {
  const real = realAgeInYear(name, year);
  if (real != null) return clamp(real, 17, 52);
  if (year === LATEST_START_YEAR) {
    return DRIVER_AGES_2026[name] ?? DEFAULT_DRIVER_AGE;
  }
  return clamp(year - estimatedBirthYear(name), 17, 52);
}

function applySeasonRules(world: World) {
  world.rules = rulesForYear(world.year);
}

/** Remaining upside, larger for drivers who have not hit their prime yet. */
function upsideForAge(age: number, rand: Rng): number {
  const base =
    age <= 19
      ? 9
      : age <= 21
        ? 7
        : age <= 23
          ? 5
          : age <= 25
            ? 3
            : age <= 27
              ? 1
              : 0;
  return base + (base > 0 ? rand() * 3 : 0);
}

function rankTeams(teams: TeamState[]) {
  const order = [...teams].sort((a, b) => b.power - a.power);
  order.forEach((team, i) => {
    team.rank = i;
    team.tier = tierFromRank(i);
  });
}

/**
 * Build constructor pecking order for a historical year from that season's
 * points and results. 2026 keeps the hand-tuned blueprints.
 */
function teamBlueprintsForYear(year: number): TeamBlueprint[] {
  if (year === LATEST_START_YEAR) return TEAM_BLUEPRINTS_2026.map((t) => ({ ...t }));

  const rows = dataset.seasons.filter((s) => s.year === year);
  const byTeam = new Map<
    string,
    { points: number; races: number; dnfs: number; starts: number; best: number }
  >();

  for (const row of rows) {
    const bucket = byTeam.get(row.team) ?? {
      points: 0,
      races: 0,
      dnfs: 0,
      starts: 0,
      best: 0,
    };
    bucket.points += row.points;
    bucket.races = Math.max(bucket.races, row.races);
    bucket.dnfs += row.dnfs;
    bucket.starts += row.races;
    bucket.best = Math.max(bucket.best, row.overall);
    byTeam.set(row.team, bucket);
  }

  const calendarLen = rulesForYear(year).calendar.length;
  const minRaces = Math.max(3, Math.floor(calendarLen * 0.25));
  let ranked = [...byTeam.entries()]
    .map(([name, stats]) => ({ name, ...stats }))
    .filter((t) => t.races >= minRaces || t.points > 0)
    .sort(
      (a, b) =>
        b.points - a.points || b.best - a.best || a.name.localeCompare(b.name),
    );

  // Never field fewer than eight constructors if the year had that many entries.
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
    return { name: team.name, power, reliability, resources };
  });
}

/** Build a grid driver from a real season row. */
function driverFromSeasonRow(
  row: DriverSeason,
  team: string,
  year: number,
  rand: Rng,
): FieldDriver {
  const age = driverAgeInYear(row.name, year);
  const attributes = blendedAttributes(row.name, year) ?? { ...row.attributes };
  const overall = computeOverall(attributes);
  return {
    id: `${row.id}-${team.toLowerCase().replace(/\s+/g, "-")}`,
    name: row.name,
    team,
    age,
    attributes,
    overall,
    potential: clamp(Math.round(overall + upsideForAge(age, rand)), overall, 99),
    reputation: clamp(0.35 + (overall - 60) / 70, 0.2, 0.9),
    seasonsInF1: seasonsRacedBefore(row.name, year),
    seasonsAtTeam: 1 + Math.floor(rand() * 2),
    contractYears: Math.floor(rand() * 3),
    titles: 0,
    careerWins: 0,
    isPlayer: false,
    yearsWithoutSeat: 0,
  };
}

/**
 * Prefer a real spare F1 entry from this year, then a real junior.
 * Never invents a name.
 */
function makeFillDriver(
  team: string,
  year: number,
  rand: Rng,
  usedNames: Set<string>,
): FieldDriver | null {
  const spare = dataset.seasons
    .filter((s) => s.year === year && !usedNames.has(s.name))
    .sort((a, b) => b.races - a.races || b.overall - a.overall)[0];

  if (spare) {
    usedNames.add(spare.name);
    return driverFromSeasonRow(spare, team, year, rand);
  }

  const junior = pickJunior(year, usedNames, rand);
  if (!junior) return null;
  usedNames.add(junior.name);
  return asDriverFromProspect(junior, team, year, rand);
}

function prospectsForYear(year: number, usedNames: Set<string>): Prospect[] {
  return juniorsForYear(year, usedNames, 18);
}

/**
 * Bring constructors in line with the historical grid for `nextYear`.
 * Renames through known lineage, adds new entries, dissolves defunct teams.
 */
function syncConstructorsForYear(
  world: World,
  nextYear: number,
  report: OffseasonReport,
) {
  if (nextYear > LATEST_START_YEAR) return;

  const targets = teamBlueprintsForYear(nextYear);
  const available = new Set(targets.map((t) => t.name));
  const assigned = new Set<string>();
  const renameTo = new Map<string, string>();

  // Exact name matches first.
  for (const team of world.teams) {
    if (available.has(team.name) && !assigned.has(team.name)) {
      renameTo.set(team.name, team.name);
      assigned.add(team.name);
    }
  }

  // Known rebrands (Sauber → Audi, AlphaTauri → Racing Bulls, …).
  for (const team of world.teams) {
    if (renameTo.has(team.name)) continue;
    const next = successorAmong(team.name, available);
    if (next && !assigned.has(next)) {
      renameTo.set(team.name, next);
      assigned.add(next);
      if (next !== team.name) {
        report.moves.push({
          name: "Entry rebrand",
          from: team.name,
          to: next,
        });
      }
    }
  }

  // Leftover slots: pair remaining teams by current rank.
  const leftoverOld = world.teams
    .filter((t) => !renameTo.has(t.name))
    .sort((a, b) => a.rank - b.rank);
  const leftoverNew = targets
    .filter((t) => !assigned.has(t.name))
    .sort((a, b) => b.power - a.power);

  for (let i = 0; i < leftoverOld.length && i < leftoverNew.length; i++) {
    const old = leftoverOld[i]!;
    const next = leftoverNew[i]!;
    renameTo.set(old.name, next.name);
    assigned.add(next.name);
    if (old.name !== next.name) {
      report.moves.push({
        name: "Entry rebrand",
        from: old.name,
        to: next.name,
      });
    }
  }

  // Dissolve teams with no home in the new year.
  for (const old of leftoverOld.slice(leftoverNew.length)) {
    for (const d of driversForTeam(world, old.name)) {
      if (d.isPlayer) continue;
      releaseDriver(world, d, old.name);
      report.departures.push({ name: d.name, team: old.name });
    }
    // Player on a defunct team is handled by forcePlayerSeat later.
    const player = playerDriver(world);
    if (player && player.team === old.name) {
      player.team = "";
      world.drivers = world.drivers.filter((d) => d.id !== player.id);
      world.freeAgents.push(player);
    }
  }

  // Apply renames and blend power toward the historical pecking order.
  const nextTeams: TeamState[] = [];
  const byNewName = new Map<string, TeamState>();
  for (const team of world.teams) {
    const newName = renameTo.get(team.name);
    if (!newName) continue;
    const target = targets.find((t) => t.name === newName)!;
    const updated: TeamState = {
      ...team,
      name: newName,
      power: clamp(team.power * 0.55 + target.power * 0.45, 56, 96),
      reliability: clamp(
        team.reliability * 0.6 + target.reliability * 0.4,
        0.55,
        0.95,
      ),
      resources: clamp(team.resources * 0.5 + target.resources * 0.5, 0.35, 1),
      rank: 0,
      tier: 1,
    };
    byNewName.set(newName, updated);
    nextTeams.push(updated);
    for (const d of world.drivers) {
      if (d.team === team.name) d.team = newName;
    }
  }

  // Brand-new constructors (Cadillac, etc.).
  for (const target of targets) {
    if (byNewName.has(target.name)) continue;
    nextTeams.push({
      ...target,
      rank: 0,
      tier: 1,
    });
  }

  world.teams = nextTeams;
  rankTeams(world.teams);

  // Historical F1 arrivals for the incoming year join the market.
  const onBooks = new Set([
    ...world.drivers.map((d) => d.name),
    ...world.freeAgents.map((d) => d.name),
    ...world.prospects.map((p) => p.name),
  ]);
  for (const row of dataset.seasons.filter((s) => s.year === nextYear)) {
    if (onBooks.has(row.name)) continue;
    const age = driverAgeInYear(row.name, nextYear);
    const attributes =
      blendedAttributes(row.name, nextYear) ?? { ...row.attributes };
    const overall = computeOverall(attributes);
    world.freeAgents.push({
      id: row.id,
      name: row.name,
      team: "",
      age,
      attributes,
      overall,
      potential: clamp(overall + 3, overall, 99),
      reputation: clamp(0.35 + (overall - 60) / 70, 0.2, 0.85),
      seasonsInF1: seasonsRacedBefore(row.name, nextYear),
      seasonsAtTeam: 0,
      contractYears: 0,
      titles: 0,
      careerWins: 0,
      isPlayer: false,
      yearsWithoutSeat: 0,
    });
    onBooks.add(row.name);
    world.usedNames.add(row.name);
  }
}

export function createWorld(rand: Rng, startYear = LATEST_START_YEAR): World {
  const year = startYear;
  const blueprints = teamBlueprintsForYear(year);
  const teams: TeamState[] = blueprints.map((blueprint) => ({
    ...blueprint,
    rank: 0,
    tier: 1,
  }));
  rankTeams(teams);

  const rows = dataset.seasons.filter((s) => s.year === year);
  const byTeam = new Map<string, typeof rows>();
  for (const row of rows) {
    const list = byTeam.get(row.team) ?? [];
    list.push(row);
    byTeam.set(row.team, list);
  }

  const usedNames = new Set<string>();
  const drivers: FieldDriver[] = [];

  // Seat every real entry first. Filling empty seats mid-loop would otherwise
  // hand a later team's driver to an earlier one, and seat them twice.
  const seatedByTeam = new Map<string, typeof rows>();
  for (const team of teams) {
    const seats = [...(byTeam.get(team.name) ?? [])]
      .filter((row) => !usedNames.has(row.name))
      .sort((a, b) => b.races - a.races || b.overall - a.overall)
      .slice(0, 2);
    seatedByTeam.set(team.name, seats);
    for (const row of seats) usedNames.add(row.name);
  }

  for (const team of teams) {
    for (const row of seatedByTeam.get(team.name) ?? []) {
      drivers.push(driverFromSeasonRow(row, team.name, year, rand));
    }
  }

  // Any remaining seat goes to a real spare entry from this year, then a real junior.
  for (const team of teams) {
    while (drivers.filter((d) => d.team === team.name).length < 2) {
      const fill = makeFillDriver(team.name, year, rand, usedNames);
      if (!fill) break;
      drivers.push(fill);
    }
  }

  const prospects = prospectsForYear(year, usedNames);
  for (const p of prospects) usedNames.add(p.name);
  for (const d of drivers) usedNames.add(d.name);

  return {
    year,
    teams,
    drivers,
    freeAgents: [],
    prospects,
    usedNames,
    playerActive: true,
    rules: rulesForYear(year),
  };
}

export function teamByName(world: World, name: string): TeamState {
  return (
    world.teams.find((t) => t.name === name) ??
    world.teams[world.teams.length - 1]!
  );
}

export function driversForTeam(world: World, team: string): FieldDriver[] {
  return world.drivers.filter((d) => d.team === team);
}

export function playerDriver(world: World): FieldDriver | undefined {
  return world.drivers.find((d) => d.isPlayer);
}

/* ------------------------------------------------------------------ *
 * Driver market valuation
 * ------------------------------------------------------------------ */

function youthWeight(age: number): number {
  if (age <= 20) return 0.85;
  if (age <= 22) return 0.7;
  if (age <= 24) return 0.5;
  if (age <= 26) return 0.3;
  return 0.1;
}

function agePenalty(age: number): number {
  if (age <= 30) return 0;
  if (age <= 32) return (age - 30) * 1.2;
  if (age <= 35) return 2.4 + (age - 32) * 1.8;
  return 7.8 + (age - 35) * 3;
}

export function marketValue(d: FieldDriver): number {
  const upside = Math.max(0, d.potential - d.overall) * youthWeight(d.age);
  // A proven winner keeps getting phone calls long after the form dips.
  const pedigree = Math.min(
    12,
    d.titles * 5 + Math.min(d.careerWins, 12) * 0.6,
  );
  return (
    d.overall +
    upside +
    pedigree +
    (d.reputation - 0.5) * 20 -
    agePenalty(d.age)
  );
}

/** Juniors are unproven, so teams discount the hype when comparing to real F1 form. */
function prospectValue(p: Prospect): number {
  const upside = (p.ceiling - p.baseline) * youthWeight(p.age);
  return p.baseline + upside * 0.45 - 3;
}

/* ------------------------------------------------------------------ *
 * Race weekend
 * ------------------------------------------------------------------ */

export interface DriverRaceOutcome {
  grid: number;
  finish: number | null;
  points: number;
  sprintPoints: number;
  pole: boolean;
  dnf: boolean;
  dnfReason: DnfReason | null;
  win: boolean;
  podium: boolean;
}

function qualifyingSkill(d: FieldDriver) {
  return (
    d.attributes.qualifying * 0.72 +
    d.attributes.mentality * 0.18 +
    d.attributes.momentum * 0.1
  );
}

function raceSkill(d: FieldDriver) {
  return (
    d.attributes.racePace * 0.38 +
    d.attributes.raceCraft * 0.3 +
    d.attributes.frontRunning * 0.18 +
    d.attributes.mentality * 0.08 +
    d.attributes.scoring * 0.06
  );
}

/** One-round call from a Live Weekend decision — cleared after the GP. */
export interface WeekendBias {
  /** Added to the player's qualifying/race politics bias for this round. */
  playerDelta: number;
  /** Added to the sticky rival's bias when hunting them. */
  rivalDelta?: number;
  /** Multiplier on race noise for the player (and rival if hunting). */
  noiseMul?: number;
}

/** Soft team-orders / return-from-absence / rivalry bias for a season. */
export interface SeasonPolitics {
  /** Player framed as #2 — teammate gets the preferential score. */
  supportRolePlayerId?: string | null;
  /** Player returning from a sit-out — short form damp. */
  formRustPlayerId?: string | null;
  /** Sticky rivalry pressure carried into this year. */
  rivalHeat?: "garage" | "title" | "wheel" | "distant" | null;
  rivalDriverId?: string | null;
  playerId?: string | null;
  /** Consumed for a single round, then cleared. */
  weekendBias?: WeekendBias | null;
}

function politicsBias(
  driverId: string,
  drivers: FieldDriver[],
  politics: SeasonPolitics | undefined,
): number {
  if (!politics) return 0;
  let bias = 0;
  const supportId = politics.supportRolePlayerId;
  if (supportId) {
    if (driverId === supportId) bias -= 1.25;
    else {
      const player = drivers.find((d) => d.id === supportId);
      if (player) {
        const teammate = drivers.find(
          (d) => d.team === player.team && d.id !== supportId,
        );
        if (teammate && driverId === teammate.id) bias += 1;
      }
    }
  }
  if (politics.formRustPlayerId && driverId === politics.formRustPlayerId) {
    bias -= 1.5;
  }

  // Rival heat is softer than team orders — story pressure, not a death sentence.
  const heat = politics.rivalHeat;
  const rivalId = politics.rivalDriverId;
  const playerId = politics.playerId;
  if (heat && rivalId && playerId && heat !== "distant") {
    if (heat === "garage") {
      if (driverId === playerId) bias -= 0.55;
      if (driverId === rivalId) bias += 0.4;
    } else if (heat === "title") {
      if (driverId === playerId || driverId === rivalId) bias += 0.45;
    } else if (heat === "wheel") {
      if (driverId === playerId || driverId === rivalId) bias -= 0.12;
    }
  }

  const weekend = politics.weekendBias;
  if (weekend && playerId) {
    if (driverId === playerId) bias += weekend.playerDelta;
    if (
      weekend.rivalDelta != null &&
      rivalId &&
      driverId === rivalId
    ) {
      bias += weekend.rivalDelta;
    }
  }
  return bias;
}

function rivalNoiseMul(
  driverId: string,
  politics: SeasonPolitics | undefined,
): number {
  let mul = 1;
  if (
    politics?.rivalHeat === "wheel" &&
    politics.rivalDriverId &&
    politics.playerId &&
    (driverId === politics.rivalDriverId || driverId === politics.playerId)
  ) {
    mul *= 1.4;
  }
  const weekend = politics?.weekendBias;
  if (
    weekend?.noiseMul != null &&
    politics?.playerId &&
    (driverId === politics.playerId ||
      (politics.rivalDriverId != null && driverId === politics.rivalDriverId))
  ) {
    mul *= weekend.noiseMul;
  }
  return mul;
}

export function simulateRound(
  drivers: FieldDriver[],
  teams: Map<string, TeamState>,
  seasonForm: Map<string, number>,
  round: number,
  rand: Rng,
  rules: SeasonRules,
  politics?: SeasonPolitics,
): Map<string, DriverRaceOutcome> {
  const fieldSize = drivers.length;

  // Wet weather, repeated safety cars, chaotic strategy — the days the
  // pecking order stops applying and midfielders steal results.
  const chaosMul = rules.chaosMul ?? 1;
  const reliabilityMul = rules.reliabilityMul ?? 1;
  const chaotic = rand() < 0.14 * chaosMul;
  // The car decides most of it, but a wet or chaotic race hands the
  // advantage back to the driver.
  const carWeight = chaotic ? 0.48 : 0.62;
  const driverWeight = chaotic ? 0.52 : 0.38;
  const raceNoise = chaotic ? 6 : 3.6;
  const gridStickiness = chaotic ? 0.16 : 0.26;
  const riskFactor = chaotic ? 1.7 : 1;

  // Every car has a good or bad weekend; team-mates share it.
  const teamForm = new Map<string, number>();
  for (const team of teams.values()) {
    teamForm.set(team.name, sampleNormal(rand) * 2.6);
  }

  const qualified = drivers
    .map((d) => {
      const team = teams.get(d.team);
      if (!team) return null;
      const score =
        team.power * 0.66 +
        (qualifyingSkill(d) + (seasonForm.get(d.id) ?? 0)) * 0.34 +
        (teamForm.get(d.team) ?? 0) +
        politicsBias(d.id, drivers, politics) * 0.55 +
        sampleNormal(rand) *
          (chaotic ? 3.6 : 2.4) *
          rivalNoiseMul(d.id, politics);
      // Occasional grid drop for a power-unit or gearbox change.
      const penalty = rand() < 0.03 * chaosMul ? 5 : 0;
      return { driver: d, score, penalty };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry != null)
    .sort((a, b) => b.score - a.score);

  const gridOrder = qualified
    .map((entry, index) => ({
      ...entry,
      provisional: index + penaltyOffset(entry.penalty),
    }))
    .sort((a, b) => a.provisional - b.provisional);

  const gridPos = new Map<string, number>();
  gridOrder.forEach((entry, i) => gridPos.set(entry.driver.id, i + 1));
  const poleId = gridOrder[0]!.driver.id;

  const isSprint =
    rules.sprintRounds.has(round) && rules.sprintPointsTable.length > 0;
  const sprintScore = new Map<string, number>();
  if (isSprint) {
    const sprintOrder = drivers
      .map((d) => {
        const team = teams.get(d.team);
        const start = gridPos.get(d.id);
        if (!team || start == null) return null;
        const score =
          team.power * carWeight +
          (raceSkill(d) + (seasonForm.get(d.id) ?? 0)) * driverWeight +
          (teamForm.get(d.team) ?? 0) * 0.75 +
          (fieldSize - start) * 0.42 +
          politicsBias(d.id, drivers, politics) * 0.7 +
          sampleNormal(rand) *
            (raceNoise * 0.6) *
            rivalNoiseMul(d.id, politics);
        const retired = rand() < 0.025 * riskFactor;
        return { id: d.id, score, retired };
      })
      .filter((r): r is NonNullable<typeof r> => r != null && !r.retired)
      .sort((a, b) => b.score - a.score);
    sprintOrder.forEach((entry, i) =>
      sprintScore.set(entry.id, sprintPoints(i + 1, rules.sprintPointsTable)),
    );
  }

  const running: { id: string; score: number; start: number }[] = [];
  const retired: { id: string; start: number; reason: DnfReason }[] = [];

  for (const d of drivers) {
    const team = teams.get(d.team);
    const start = gridPos.get(d.id);
    if (!team || start == null) continue;

    const mechanical =
      0.035 +
      (0.9 - team.reliability * reliabilityMul) * 0.11 +
      (80 - d.attributes.reliability) * 0.0005;
    const midfieldTraffic = start >= 8 && start <= 16 ? 0.012 : 0;
    const rookieRisk = d.seasonsInF1 === 0 ? 0.014 : 0;
    const collision =
      (0.016 +
        (85 - d.attributes.raceCraft) * 0.0007 +
        midfieldTraffic +
        rookieRisk) *
      riskFactor;

    if (rand() < mechanical) {
      retired.push({ id: d.id, start, reason: "mechanical" });
      continue;
    }
    if (rand() < collision) {
      retired.push({ id: d.id, start, reason: "collision" });
      continue;
    }

    const score =
      team.power * carWeight +
      (raceSkill(d) + (seasonForm.get(d.id) ?? 0)) * driverWeight +
      (teamForm.get(d.team) ?? 0) * 0.75 +
      // Track position matters: passing modern F1 cars is hard.
      (fieldSize - start) * gridStickiness +
      politicsBias(d.id, drivers, politics) +
      sampleNormal(rand) * raceNoise * rivalNoiseMul(d.id, politics);

    running.push({ id: d.id, score, start });
  }

  running.sort((a, b) => b.score - a.score);

  const outcomes = new Map<string, DriverRaceOutcome>();

  running.forEach((entry, i) => {
    const finish = i + 1;
    outcomes.set(entry.id, {
      grid: entry.start,
      finish,
      points: racePoints(finish, rules.pointsTable) + (sprintScore.get(entry.id) ?? 0),
      sprintPoints: sprintScore.get(entry.id) ?? 0,
      pole: entry.id === poleId,
      dnf: false,
      dnfReason: null,
      win: finish === 1,
      podium: finish <= 3,
    });
  });

  for (const entry of retired) {
    outcomes.set(entry.id, {
      grid: entry.start,
      finish: null,
      points: sprintScore.get(entry.id) ?? 0,
      sprintPoints: sprintScore.get(entry.id) ?? 0,
      pole: entry.id === poleId,
      dnf: true,
      dnfReason: entry.reason,
      win: false,
      podium: false,
    });
  }

  return outcomes;
}

function penaltyOffset(penalty: number) {
  // Applied as a fractional shift so the sort stays stable for unpenalised cars.
  return penalty === 0 ? 0 : penalty + 0.5;
}

/* ------------------------------------------------------------------ *
 * Season
 * ------------------------------------------------------------------ */

export interface DriverSeasonTotals {
  points: number;
  wins: number;
  podiums: number;
  poles: number;
  dnfs: number;
  finishCounts: number[];
}

export interface WorldSeasonResult {
  year: number;
  standings: StandingEntry[];
  constructors: ConstructorEntry[];
  playerRaces: RaceResult[];
  totals: Map<string, DriverSeasonTotals>;
  championId: string;
  championName: string;
  championTeam: string;
  championPoints: number;
}

function emptyTotals(): DriverSeasonTotals {
  return {
    points: 0,
    wins: 0,
    podiums: 0,
    poles: 0,
    dnfs: 0,
    finishCounts: [],
  };
}

function countback(a: DriverSeasonTotals, b: DriverSeasonTotals): number {
  const len = Math.max(a.finishCounts.length, b.finishCounts.length);
  for (let pos = 1; pos <= len; pos++) {
    const diff = (b.finishCounts[pos] ?? 0) - (a.finishCounts[pos] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function initSeasonForm(world: World, rand: Rng, politics?: SeasonPolitics) {
  const seasonForm = new Map<string, number>();
  for (const d of world.drivers) seasonForm.set(d.id, sampleNormal(rand) * 1.6);

  if (politics?.supportRolePlayerId) {
    const supportId = politics.supportRolePlayerId;
    const support = world.drivers.find((d) => d.id === supportId);
    if (support) {
      seasonForm.set(supportId, (seasonForm.get(supportId) ?? 0) - 0.95);
      const teammate = world.drivers.find(
        (d) => d.team === support.team && d.id !== supportId,
      );
      if (teammate) {
        seasonForm.set(teammate.id, (seasonForm.get(teammate.id) ?? 0) + 0.75);
      }
    }
  }
  if (politics?.formRustPlayerId) {
    const id = politics.formRustPlayerId;
    seasonForm.set(id, (seasonForm.get(id) ?? 0) - 1.25);
  }

  if (
    politics?.rivalHeat &&
    politics.rivalHeat !== "distant" &&
    politics.playerId &&
    politics.rivalDriverId
  ) {
    const pid = politics.playerId;
    const rid = politics.rivalDriverId;
    if (politics.rivalHeat === "garage") {
      seasonForm.set(pid, (seasonForm.get(pid) ?? 0) - 0.45);
      seasonForm.set(rid, (seasonForm.get(rid) ?? 0) + 0.3);
    } else if (politics.rivalHeat === "title") {
      seasonForm.set(pid, (seasonForm.get(pid) ?? 0) + 0.4);
      seasonForm.set(rid, (seasonForm.get(rid) ?? 0) + 0.4);
    } else if (politics.rivalHeat === "wheel") {
      seasonForm.set(pid, (seasonForm.get(pid) ?? 0) - 0.2);
      seasonForm.set(rid, (seasonForm.get(rid) ?? 0) - 0.2);
    }
  }
  return seasonForm;
}

/** Resumable in-progress season — for mid-season decision pauses. */
export interface SeasonProgress {
  totals: Map<string, DriverSeasonTotals>;
  seasonForm: Map<string, number>;
  playerRaces: RaceResult[];
  roundsCompleted: number;
  politics: SeasonPolitics;
}

export function beginSeasonProgress(
  world: World,
  rand: Rng,
  politics: SeasonPolitics = {},
): SeasonProgress {
  const totals = new Map<string, DriverSeasonTotals>();
  for (const d of world.drivers) totals.set(d.id, emptyTotals());
  return {
    totals,
    seasonForm: initSeasonForm(world, rand, politics),
    playerRaces: [],
    roundsCompleted: 0,
    politics,
  };
}

/** Run calendar rounds (exclusive upper bound) and mutate progress. */
export function advanceSeasonProgress(
  world: World,
  rand: Rng,
  progress: SeasonProgress,
  toRound: number,
): SeasonProgress {
  const teams = new Map(world.teams.map((t) => [t.name, t]));
  const player = playerDriver(world);
  const calendarLen = world.rules.calendar.length;

  for (
    let round = progress.roundsCompleted + 1;
    round <= toRound && round <= calendarLen;
    round++
  ) {
    const outcomes = simulateRound(
      world.drivers,
      teams,
      progress.seasonForm,
      round,
      rand,
      world.rules,
      progress.politics,
    );

    for (const d of world.drivers) {
      const outcome = outcomes.get(d.id);
      if (!outcome) continue;
      const bucket = progress.totals.get(d.id)!;
      bucket.points += outcome.points;
      if (outcome.win) bucket.wins++;
      if (outcome.podium) bucket.podiums++;
      if (outcome.pole) bucket.poles++;
      if (outcome.dnf) bucket.dnfs++;
      if (outcome.finish != null) {
        bucket.finishCounts[outcome.finish] =
          (bucket.finishCounts[outcome.finish] ?? 0) + 1;
      }
    }

    if (player) {
      const mine = outcomes.get(player.id);
      if (mine) {
        progress.playerRaces.push({
          round,
          name: world.rules.calendar[(round - 1) % calendarLen]!,
          grid: mine.grid,
          finish: mine.finish,
          points: mine.points,
          sprintPoints: mine.sprintPoints,
          pole: mine.pole,
          dnf: mine.dnf,
          dnfReason: mine.dnfReason,
          win: mine.win,
          podium: mine.podium,
        });
      }
    }
    progress.roundsCompleted = round;
    // Live Weekend calls only last one GP.
    if (progress.politics.weekendBias) {
      progress.politics = { ...progress.politics, weekendBias: null };
    }
  }

  return progress;
}

export function standingsFromProgress(
  world: World,
  progress: SeasonProgress,
): StandingEntry[] {
  const ranked = world.drivers
    .map((driver) => ({
      driver,
      totals: progress.totals.get(driver.id) ?? emptyTotals(),
    }))
    .sort(
      (a, b) =>
        b.totals.points - a.totals.points ||
        b.totals.wins - a.totals.wins ||
        b.totals.podiums - a.totals.podiums ||
        countback(a.totals, b.totals) ||
        a.driver.name.localeCompare(b.driver.name),
    );

  return ranked.map((row, i) => ({
    position: i + 1,
    name: row.driver.name,
    team: row.driver.team,
    age: row.driver.age,
    points: row.totals.points,
    wins: row.totals.wins,
    podiums: row.totals.podiums,
    poles: row.totals.poles,
    isPlayer: row.driver.isPlayer,
  }));
}

export function finalizeSeasonFromProgress(
  world: World,
  progress: SeasonProgress,
): WorldSeasonResult {
  const ranked = world.drivers
    .map((driver) => ({
      driver,
      totals: progress.totals.get(driver.id) ?? emptyTotals(),
    }))
    .sort(
      (a, b) =>
        b.totals.points - a.totals.points ||
        b.totals.wins - a.totals.wins ||
        b.totals.podiums - a.totals.podiums ||
        countback(a.totals, b.totals) ||
        a.driver.name.localeCompare(b.driver.name),
    );

  const standings: StandingEntry[] = ranked.map((row, i) => ({
    position: i + 1,
    name: row.driver.name,
    team: row.driver.team,
    age: row.driver.age,
    points: row.totals.points,
    wins: row.totals.wins,
    podiums: row.totals.podiums,
    poles: row.totals.poles,
    isPlayer: row.driver.isPlayer,
  }));

  const teamPoints = new Map<string, { points: number; wins: number }>();
  for (const team of world.teams)
    teamPoints.set(team.name, { points: 0, wins: 0 });
  for (const row of ranked) {
    const bucket = teamPoints.get(row.driver.team);
    if (!bucket) continue;
    bucket.points += row.totals.points;
    bucket.wins += row.totals.wins;
  }

  const player = playerDriver(world);
  const playerTeam = player?.team ?? null;
  const constructors: ConstructorEntry[] = [...teamPoints.entries()]
    .map(([team, v]) => ({ team, ...v }))
    .sort(
      (a, b) =>
        b.points - a.points || b.wins - a.wins || a.team.localeCompare(b.team),
    )
    .map((row, i) => ({
      position: i + 1,
      team: row.team,
      points: row.points,
      wins: row.wins,
      isPlayerTeam: row.team === playerTeam,
    }));

  const champion = ranked[0];

  return {
    year: world.year,
    standings,
    constructors,
    playerRaces: progress.playerRaces,
    totals: progress.totals,
    championId: champion?.driver.id ?? "",
    championName: champion?.driver.name ?? "",
    championTeam: champion?.driver.team ?? "",
    championPoints: champion?.totals.points ?? 0,
  };
}

export function simulateWorldSeason(
  world: World,
  rand: Rng,
  politics?: SeasonPolitics,
): WorldSeasonResult {
  const progress = beginSeasonProgress(world, rand, politics ?? {});
  advanceSeasonProgress(world, rand, progress, world.rules.calendar.length);
  return finalizeSeasonFromProgress(world, progress);
}

/* ------------------------------------------------------------------ *
 * Off-season: development, retirements, the driver market
 * ------------------------------------------------------------------ */

export interface OffseasonReport {
  /** `age` = hung up the helmet, `noSeat` = squeezed off the grid. */
  retirements: {
    name: string;
    age: number;
    team: string;
    reason: "age" | "noSeat";
  }[];
  promotions: { name: string; team: string }[];
  moves: { name: string; from: string; to: string }[];
  /** Lost their seat this winter and still have nothing lined up. */
  departures: { name: string; team: string }[];
  playerLostSeat: boolean;
  playerMovedTo: string | null;
}

function updateReputations(world: World, result: WorldSeasonResult) {
  const pointsFor = (d: FieldDriver) => result.totals.get(d.id)?.points ?? 0;

  // What a car of each rank actually scored this year, best car first.
  const teamTotals = new Map<string, number>();
  for (const team of world.teams) teamTotals.set(team.name, 0);
  for (const d of world.drivers) {
    teamTotals.set(d.team, (teamTotals.get(d.team) ?? 0) + pointsFor(d));
  }
  const sortedTotals = [...teamTotals.values()].sort((a, b) => b - a);

  for (const driver of world.drivers) {
    const mine = pointsFor(driver);
    driver.careerWins += result.totals.get(driver.id)?.wins ?? 0;
    const team = teamByName(world, driver.team);
    const teammate = world.drivers.find(
      (d) => d.team === driver.team && d.id !== driver.id,
    );
    const teammatePoints = teammate ? pointsFor(teammate) : mine;

    // Beating your team-mate is how reputations are actually made.
    const share = (mine + 4) / (mine + teammatePoints + 8);
    const shareScore = clamp((share - 0.25) / 0.5, 0, 1);

    // ...but so is dragging the car further than it deserves.
    const parTeam = sortedTotals[team.rank] ?? 0;
    const delivery = (mine + 8) / (parTeam / 2 + 8);
    const deliveryScore = clamp((delivery - 0.45) / 1.1, 0, 1);

    const seasonScore = shareScore * 0.55 + deliveryScore * 0.45;
    driver.reputation = clamp(
      driver.reputation * 0.45 + seasonScore * 0.55,
      0.05,
      0.98,
    );
  }

  const champion = world.drivers.find((d) => d.id === result.championId);
  if (champion) {
    champion.titles++;
    champion.reputation = clamp(champion.reputation + 0.12, 0, 1);
  }
}

function developDriver(d: FieldDriver, rand: Rng) {
  const from = d.age;
  const to = d.age + 1;
  d.age = to;

  if (d.peak) {
    // The player's build is their peak; age decides how much of it shows up.
    d.attributes = attributesAtAge(d.peak, to);
    d.overall = computeOverall(d.attributes);
    return;
  }

  const room = Math.max(0, d.potential - d.overall);
  const youth = to <= 28 ? clamp((29 - to) / 10, 0, 1) : 0;
  // Most drivers never quite reach their ceiling.
  const pull = room * 0.15 * youth * (0.5 + rand());
  const swing = sampleNormal(rand) * 1.1;

  const next = {} as Attributes;
  for (const key of ATTRIBUTE_KEYS) {
    const aged = d.attributes[key] * ageStepFactor(from, to, key);
    next[key] = clamp(Math.round(aged + pull + swing), 40, 99);
  }

  d.attributes = next;
  d.overall = computeOverall(next);

  // Late bloomers, and the more common case: quietly stopping improving.
  if (to <= 26 && rand() < 0.05)
    d.potential = clamp(d.potential + 2 + rand() * 3, 40, 99);
  if (to <= 30 && rand() < 0.09)
    d.potential = clamp(d.potential - (2 + rand() * 4), 40, 99);
  d.potential = Math.max(d.potential, d.overall);
}

/** Chance a driver walks away this winter, by age 31 upwards. */
const RETIREMENT_HAZARD = [
  0.012, 0.02, 0.05, 0.08, 0.13, 0.2, 0.28, 0.38, 0.48, 0.6, 0.72, 0.85,
];

export function retirementChanceFor(d: FieldDriver): number {
  // Drivers in their twenties leave F1 by losing the seat, not by choice —
  // unless the results have been grim for a while.
  if (d.age <= 29) return d.reputation < 0.3 ? 0.02 : 0;

  let p = d.age === 30 ? 0.008 : (RETIREMENT_HAZARD[d.age - 31] ?? 1);
  if (d.reputation < 0.35) p *= 1.5;
  if (d.reputation > 0.75) p *= 0.6;
  return clamp(p, 0, 1);
}

function asDriverFromProspect(
  p: Prospect,
  team: string,
  year: number,
  rand: Rng,
): FieldDriver {
  const spread = () =>
    clamp(Math.round(p.baseline + sampleNormal(rand) * 4), 45, 95);
  const attributes = {} as Attributes;
  for (const key of ATTRIBUTE_KEYS) attributes[key] = spread();
  const overall = computeOverall(attributes);

  // Juniors who went on to race in F1 have a real birth date; use it rather
  // than the ladder-based estimate.
  const real = realAgeInYear(p.name, year);
  const age = real != null ? clamp(real, 17, 45) : p.age;

  return {
    id: `rookie-${year}-${Math.floor(rand() * 1e9).toString(36)}`,
    name: p.name,
    team,
    age,
    attributes,
    overall,
    // Junior-formula form only partly survives contact with F1.
    potential: clamp(
      Math.max(p.baseline + (p.ceiling - p.baseline) * 0.85, overall),
      overall,
      99,
    ),
    reputation: 0.5,
    seasonsInF1: 0,
    seasonsAtTeam: 0,
    contractYears: 2,
    titles: 0,
    careerWins: 0,
    isPlayer: false,
    yearsWithoutSeat: 0,
  };
}

function refreshProspectPool(world: World, rand: Rng) {
  for (const p of world.prospects) p.age++;
  world.prospects = world.prospects.filter((p) => p.age <= 28);

  const taken = new Set<string>([
    ...world.usedNames,
    ...world.drivers.map((d) => d.name),
    ...world.freeAgents.map((d) => d.name),
    ...world.prospects.map((p) => p.name),
  ]);

  // Top up with real F2/F3/F4 (and pipeline) names for the incoming season.
  const incomingYear = world.year + 1;
  const fresh = juniorsForYear(incomingYear, taken, 24);
  for (const p of fresh) {
    if (world.prospects.length >= 16) break;
    if (taken.has(p.name)) continue;
    world.prospects.push(p);
    taken.add(p.name);
    world.usedNames.add(p.name);
  }

  // If the pool is still thin, allow slightly older real juniors rather than
  // inventing names — age them back into the window.
  if (world.prospects.length < 8) {
    for (const p of juniorsForYear(incomingYear - 2, taken, 40)) {
      if (world.prospects.length >= 12) break;
      if (taken.has(p.name)) continue;
      world.prospects.push({ ...p, age: Math.min(24, p.age) });
      taken.add(p.name);
      world.usedNames.add(p.name);
    }
  }

  // Silence unused rand in signature (kept for call-site stability).
  void rand;
}

/** Field-wide calibration so "car power" always means the same thing. */
const FIELD_POWER_MEAN = 79;
const FIELD_POWER_SPREAD = 9.5;

function developCars(world: World, rand: Rng) {
  const reset = isRegulationReset(world.year + 1);

  for (const team of world.teams) {
    // Money and infrastructure set the level a team gravitates back towards.
    const target = 72 + team.resources * 12;
    const drift = (target - team.power) * (reset ? 0.4 : 0.2);
    const swing = sampleNormal(rand) * (reset ? 7 : 3.2);
    // Sliding-scale aero testing: the further back you finished, the more
    // development you are allowed next year.
    const testingAllowance = (team.rank - 5) * 0.55;
    team.power = team.power + drift + swing + testingAllowance;

    team.reliability = clamp(
      team.reliability +
        (0.84 - team.reliability) * 0.25 +
        sampleNormal(rand) * 0.035,
      0.55,
      0.95,
    );
    team.resources = clamp(team.resources + sampleNormal(rand) * 0.03, 0.35, 1);
  }

  // Performance is relative, so nudge the field back to a familiar shape:
  // the order can change completely, the spread stays believable.
  const powers = world.teams.map((t) => t.power);
  const mean = powers.reduce((a, b) => a + b, 0) / powers.length;
  const variance =
    powers.reduce((sum, p) => sum + (p - mean) ** 2, 0) /
    Math.max(1, powers.length - 1);
  const sd = Math.sqrt(variance) || 1;
  const scale = 1 + (FIELD_POWER_SPREAD / sd - 1) * 0.5;

  for (const team of world.teams) {
    team.power = clamp(FIELD_POWER_MEAN + (team.power - mean) * scale, 56, 96);
  }

  rankTeams(world.teams);
}

function vacanciesFor(world: World): string[] {
  const seats: string[] = [];
  for (const team of world.teams) {
    const filled = driversForTeam(world, team.name).length;
    for (let i = filled; i < 2; i++) seats.push(team.name);
  }
  return seats.sort(
    (a, b) => teamByName(world, a).rank - teamByName(world, b).rank,
  );
}

/**
 * The best driver this team could realistically put in the car: free agents,
 * juniors, and — for the front of the grid — stars stuck in slower machinery.
 */
function bestAvailableValue(world: World, forTeam?: TeamState): number {
  const candidates: number[] = [];
  for (const d of world.freeAgents) candidates.push(marketValue(d));
  for (const p of world.prospects) candidates.push(prospectValue(p));

  if (forTeam && forTeam.rank <= 5) {
    for (const d of world.drivers) {
      if (d.team === forTeam.name) continue;
      if (teamByName(world, d.team).power < forTeam.power - 2) {
        candidates.push(marketValue(d));
      }
    }
  }

  return candidates.length ? Math.max(...candidates) : 60;
}

function shuffled<T>(items: T[], rand: Rng): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/**
 * Take a driver out of their seat and back onto the market. `droppedBy` is
 * what lets the winter report say where they came from — either as part of a
 * move to a new team, or as a departure if nobody picks them up.
 */
function releaseDriver(world: World, driver: FieldDriver, from: string) {
  world.drivers = world.drivers.filter((d) => d.id !== driver.id);
  driver.droppedBy = from;
  driver.team = "";
  driver.seasonsAtTeam = 0;
  world.freeAgents.push(driver);
}

function runDrops(world: World, rand: Rng) {
  const order = shuffled(world.teams, rand);
  let drops = 0;

  for (const team of order) {
    if (drops >= 3) break;
    const seats = driversForTeam(world, team.name);
    if (seats.length < 2) continue;

    const weakest = [...seats].sort(
      (a, b) => marketValue(a) - marketValue(b),
    )[0]!;
    const inertia =
      clamp(3 + weakest.seasonsAtTeam * 1.5, 3, 9) +
      weakest.titles * 8 +
      Math.max(0, weakest.contractYears) * 2.5;
    const gap = bestAvailableValue(world, team) - marketValue(weakest);

    if (gap > 8 + inertia && rand() < 0.7) {
      releaseDriver(world, weakest, team.name);
      drops++;
    }
  }
}

function findPoachTarget(
  world: World,
  team: TeamState,
  benchmark: number,
  rand: Rng,
): FieldDriver | null {
  const candidates = world.drivers.filter((d) => {
    if (d.team === team.name) return false;
    // Drivers under contract are hard, but not impossible, to prise away.
    if (d.contractYears > 0 && rand() > 0.12) return false;
    const current = teamByName(world, d.team);
    return current.power < team.power - 2 && marketValue(d) > benchmark + 3;
  });
  if (!candidates.length) return null;
  return candidates.sort((a, b) => marketValue(b) - marketValue(a))[0]!;
}

function signDriver(
  world: World,
  driver: FieldDriver,
  team: string,
  rand?: Rng,
) {
  driver.team = team;
  driver.seasonsAtTeam = 0;
  driver.yearsWithoutSeat = 0;
  driver.contractYears = rand ? 1 + Math.floor(rand() * 3) : 2;
  delete driver.droppedBy;
  world.freeAgents = world.freeAgents.filter((d) => d.id !== driver.id);
  if (!world.drivers.includes(driver)) world.drivers.push(driver);
}

function fillVacancies(world: World, rand: Rng, report: OffseasonReport) {
  const queue = vacanciesFor(world);
  let signings = 0;

  while (queue.length && signings < 10) {
    const teamName = queue.shift()!;
    const team = teamByName(world, teamName);
    signings++;

    const rookieAppetite =
      (team.rank >= 6 ? 4 : 0) +
      (JUNIOR_PROGRAMME_TEAMS.has(team.name) ? 2 : 0);

    const available = world.freeAgents.filter((d) => d.droppedBy !== teamName);
    const freeAgent = weightedTopPick(available, marketValue, rand);
    const prospect = weightedTopPick(
      world.prospects,
      (p) => prospectValue(p) + rookieAppetite,
      rand,
    );

    const freeValue = freeAgent ? marketValue(freeAgent) : -Infinity;
    const prospectVal = prospect
      ? prospectValue(prospect) + rookieAppetite
      : -Infinity;
    const benchmark = Math.max(freeValue, prospectVal, 55);

    const poachTarget =
      team.rank <= 5 ? findPoachTarget(world, team, benchmark, rand) : null;
    if (poachTarget && rand() < 0.65) {
      const from = poachTarget.team;
      signDriver(world, poachTarget, teamName, rand);
      report.moves.push({ name: poachTarget.name, from, to: teamName });
      queue.push(from);
      queue.sort(
        (a, b) => teamByName(world, a).rank - teamByName(world, b).rank,
      );
      continue;
    }

    if (freeAgent && freeValue >= prospectVal) {
      const from =
        freeAgent.droppedBy ??
        (freeAgent.yearsWithoutSeat > 0 ? "no seat" : "released");
      signDriver(world, freeAgent, teamName, rand);
      report.moves.push({ name: freeAgent.name, from, to: teamName });
      continue;
    }

    if (prospect) {
      world.prospects = world.prospects.filter((p) => p.name !== prospect.name);
      const rookie = asDriverFromProspect(
        prospect,
        teamName,
        world.year + 1,
        rand,
      );
      world.drivers.push(rookie);
      world.usedNames.add(rookie.name);
      report.promotions.push({ name: rookie.name, team: teamName });
      continue;
    }

    // Last resort: another real junior from the wider feeder pool — never invent.
    const emergency = pickJunior(
      world.year + 1,
      new Set([
        ...world.usedNames,
        ...world.drivers.map((d) => d.name),
        ...world.freeAgents.map((d) => d.name),
        ...world.prospects.map((p) => p.name),
      ]),
      rand,
    );
    if (!emergency) continue;
    world.usedNames.add(emergency.name);
    const rookie = asDriverFromProspect(
      emergency,
      teamName,
      world.year + 1,
      rand,
    );
    world.drivers.push(rookie);
    report.promotions.push({ name: rookie.name, team: teamName });
  }
}

/**
 * Nobody good sits out a season. If a free agent clearly outclasses the
 * weakest driver on the grid, a team swaps them in late in the winter.
 */
function finalMarketCorrection(
  world: World,
  rand: Rng,
  report: OffseasonReport,
) {
  for (let pass = 0; pass < 3; pass++) {
    if (!world.freeAgents.length) return;

    const bestFree = [...world.freeAgents].sort(
      (a, b) => marketValue(b) - marketValue(a),
    )[0]!;
    const weakest = [...world.drivers]
      .filter((d) => !d.isPlayer && d.titles === 0)
      .sort((a, b) => marketValue(a) - marketValue(b))[0];
    if (!weakest) return;

    if (marketValue(bestFree) - marketValue(weakest) <= 5) return;

    const team = weakest.team;
    const from = bestFree.droppedBy ?? "no seat";
    releaseDriver(world, weakest, team);

    signDriver(world, bestFree, team);
    report.moves.push({ name: bestFree.name, from, to: team });

    if (rand() < 0.35) return;
  }
}

/**
 * Last line of defence: the grid always races full, so any seat the market
 * left open goes to the best available real driver.
 */
function ensureFullGrid(world: World, rand: Rng, report: OffseasonReport) {
  for (const team of world.teams) {
    while (driversForTeam(world, team.name).length < 2) {
      const freeAgent = [...world.freeAgents]
        .filter((d) => !d.isPlayer)
        .sort((a, b) => marketValue(b) - marketValue(a))[0];

      if (freeAgent) {
        const from = freeAgent.droppedBy ?? "no seat";
        signDriver(world, freeAgent, team.name, rand);
        report.moves.push({ name: freeAgent.name, from, to: team.name });
        continue;
      }

      const taken = new Set([
        ...world.usedNames,
        ...world.drivers.map((d) => d.name),
        ...world.freeAgents.map((d) => d.name),
        ...world.prospects.map((p) => p.name),
      ]);
      let junior = pickJunior(world.year + 1, taken, rand);

      // If every feeder name has been used over a long career, recycle anyone
      // who is not currently on the grid rather than leaving a seat empty.
      if (!junior) {
        const active = new Set([
          ...world.drivers.map((d) => d.name),
          ...world.freeAgents.map((d) => d.name),
          ...world.prospects.map((p) => p.name),
        ]);
        junior = pickJunior(world.year + 1, active, rand);
      }

      if (!junior) break;

      world.usedNames.add(junior.name);
      world.prospects = world.prospects.filter((p) => p.name !== junior.name);
      world.drivers.push(
        asDriverFromProspect(junior, team.name, world.year + 1, rand),
      );
      report.promotions.push({ name: junior.name, team: team.name });
    }
  }
}

/** Guarantee the player a drive early on: take the weakest seat on the slowest team. */
function forcePlayerSeat(world: World, player: FieldDriver): string | null {
  const backmarkers = [...world.teams].sort((a, b) => b.rank - a.rank);
  for (const team of backmarkers) {
    const seats = driversForTeam(world, team.name);
    if (seats.length < 2) {
      signDriver(world, player, team.name);
      return team.name;
    }
    const weakest = [...seats].sort(
      (a, b) => marketValue(a) - marketValue(b),
    )[0]!;
    if (weakest.isPlayer) return team.name;
    releaseDriver(world, weakest, team.name);
    signDriver(world, player, team.name);
    return team.name;
  }
  return null;
}

export function runOffseason(
  world: World,
  result: WorldSeasonResult,
  rand: Rng,
): OffseasonReport {
  const report: OffseasonReport = {
    retirements: [],
    promotions: [],
    moves: [],
    departures: [],
    playerLostSeat: false,
    playerMovedTo: null,
  };

  updateReputations(world, result);

  for (const d of world.drivers) {
    d.seasonsInF1++;
    d.seasonsAtTeam++;
    d.contractYears = Math.max(0, d.contractYears - 1);
    developDriver(d, rand);
  }
  for (const d of world.freeAgents) developDriver(d, rand);

  const player = playerDriver(world);
  const playerTeamBefore = player?.team ?? null;

  // Retirements
  const staying: FieldDriver[] = [];
  for (const d of world.drivers) {
    if (d.isPlayer) {
      staying.push(d);
      continue;
    }
    if (d.age >= 45 || rand() < retirementChanceFor(d)) {
      report.retirements.push({
        name: d.name,
        age: d.age,
        team: d.team,
        reason: "age",
      });
    } else {
      staying.push(d);
    }
  }
  world.drivers = staying;

  runDrops(world, rand);
  syncConstructorsForYear(world, world.year + 1, report);
  fillVacancies(world, rand, report);
  finalMarketCorrection(world, rand, report);

  // Anyone still without a drive: veterans call it a day, younger drivers
  // hang around as reserves hoping for a call.
  const stillFree: FieldDriver[] = [];
  for (const d of world.freeAgents) {
    d.yearsWithoutSeat++;
    if (d.isPlayer) {
      stillFree.push(d);
      continue;
    }

    const patience = d.age <= 27 ? 2 : d.age <= 30 ? 1 : 0;
    const outOfOptions = d.yearsWithoutSeat > patience || d.overall < 56;

    if (outOfOptions) {
      report.retirements.push({
        name: d.name,
        age: d.age,
        team: d.droppedBy ?? "no seat",
        reason: d.age >= 31 ? "age" : "noSeat",
      });
    } else {
      stillFree.push(d);
    }
  }
  world.freeAgents = stillFree;

  if (player && !world.drivers.includes(player)) {
    // A career only ends here if the player really is the worst driver
    // available — otherwise some team takes the upgrade.
    const weakestOnGrid = [...world.drivers]
      .filter((d) => !d.isPlayer && d.titles === 0)
      .sort((a, b) => marketValue(a) - marketValue(b))[0];

    if (player.seasonsInF1 <= 3) {
      report.playerMovedTo = forcePlayerSeat(world, player);
    } else if (
      weakestOnGrid &&
      marketValue(player) > marketValue(weakestOnGrid)
    ) {
      const team = weakestOnGrid.team;
      releaseDriver(world, weakestOnGrid, team);
      signDriver(world, player, team, rand);
      report.playerMovedTo = team;
    } else {
      world.freeAgents = world.freeAgents.filter((d) => !d.isPlayer);
      world.playerActive = false;
      report.playerLostSeat = true;
    }
  }

  if (player && world.playerActive && player.team !== playerTeamBefore) {
    report.playerMovedTo = player.team;
  }

  ensureFullGrid(world, rand, report);

  // Anyone still carrying a `droppedBy` tag lost their seat this winter and
  // found nothing: the grid should hear about it rather than have them vanish.
  for (const d of world.freeAgents) {
    if (d.isPlayer || !d.droppedBy) continue;
    report.departures.push({ name: d.name, team: d.droppedBy });
  }

  for (const d of [...world.drivers, ...world.freeAgents]) delete d.droppedBy;

  refreshProspectPool(world, rand);
  developCars(world, rand);
  world.year++;
  applySeasonRules(world);

  return report;
}

/* ------------------------------------------------------------------ *
 * Seating the player for their debut season
 * ------------------------------------------------------------------ */

export interface PlayerSeed {
  name: string;
  /** Drafted build, treated as the player's peak ability. */
  peak: Attributes;
  age: number;
}

export function makePlayer(seed: PlayerSeed): FieldDriver {
  const attributes = attributesAtAge(seed.peak, seed.age);
  return {
    id: "player",
    name: seed.name,
    team: "",
    age: seed.age,
    attributes,
    overall: computeOverall(attributes),
    potential: computeOverall(seed.peak),
    reputation: 0.5,
    seasonsInF1: 0,
    seasonsAtTeam: 0,
    contractYears: 2,
    titles: 0,
    careerWins: 0,
    isPlayer: true,
    yearsWithoutSeat: 0,
    peak: { ...seed.peak },
  };
}

/**
 * Put the player in a specific car, pushing out that team's weaker driver.
 * The displaced driver becomes a free agent rather than vanishing.
 */
export function seatPlayerAtTeam(
  world: World,
  seed: PlayerSeed,
  teamName: string,
): { team: string; replaced: string | null } {
  const player = playerDriver(world) ?? makePlayer(seed);
  // Resolve aliases / typos to a team that actually exists this year.
  const resolved =
    world.teams.find((t) => t.name === teamName)?.name ??
    successorAmong(
      teamName,
      new Set(world.teams.map((t) => t.name)),
    ) ??
    world.teams[world.teams.length - 1]!.name;

  const seats = driversForTeam(world, resolved).filter((d) => !d.isPlayer);
  const weakest =
    [...seats].sort((a, b) => marketValue(a) - marketValue(b))[0] ?? null;

  if (weakest && seats.length >= 2) {
    world.drivers = world.drivers.filter((d) => d.id !== weakest.id);
    weakest.team = "";
    weakest.seasonsAtTeam = 0;
    weakest.yearsWithoutSeat = 0;
    world.freeAgents.push(weakest);
  }

  player.team = resolved;
  player.seasonsAtTeam = 0;
  if (!world.drivers.includes(player)) world.drivers.push(player);
  world.usedNames.add(player.name);

  return {
    team: resolved,
    replaced: seats.length >= 2 ? (weakest?.name ?? null) : null,
  };
}

export function seatPlayerForDebut(
  world: World,
  seed: PlayerSeed,
  rand: Rng,
): { team: string; replaced: string | null } {
  const player = makePlayer(seed);

  // Rookies debut where their talent gets them: prodigies crack a top team,
  // everyone else starts further back.
  const value = marketValue(player);
  let low: number;
  let high: number;
  if (value >= 92) [low, high] = [2, 5];
  else if (value >= 84) [low, high] = [3, 6];
  else if (value >= 76) [low, high] = [4, 8];
  else if (value >= 68) [low, high] = [6, 10];
  else [low, high] = [8, 10];

  const rank = clamp(
    low + Math.floor(rand() * (high - low + 1)),
    0,
    world.teams.length - 1,
  );
  const team =
    world.teams.find((t) => t.rank === rank) ??
    world.teams[world.teams.length - 1]!;

  world.drivers.push(player);
  return seatPlayerAtTeam(world, seed, team.name);
}
