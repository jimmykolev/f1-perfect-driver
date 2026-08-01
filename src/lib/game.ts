import {
  ATTRIBUTE_KEYS,
  type AttributeKey,
  type Attributes,
  type CareerResult,
  type LockedAttribute,
  type SeasonResult,
  type SignatureTrait,
} from "../types";
import {
  createWorld,
  playerDriver,
  seatPlayerAtTeam,
  simulateWorldSeason,
} from "./fieldSim";
import {
  GRAND_PRIX_CALENDAR,
  LATEST_START_YEAR,
  RACES_PER_SEASON,
  TEAM_NAMES_2026,
} from "./f1Meta";
import {
  computeOverall,
  emptyAttributes,
  mulberry32,
  type Rng,
} from "./ratings";
import { deriveTraits } from "./traits";
import {
  archetypeFrom,
  resolveTier,
  tierLabel,
  tierSummary,
} from "./careerOutcome";
import { beginCareer, runAutopilot } from "./careerSession";

export {
  GRAND_PRIX_CALENDAR,
  LATEST_START_YEAR,
  RACES_PER_SEASON,
  TEAM_NAMES_2026,
  computeOverall,
  emptyAttributes,
  mulberry32,
  archetypeFrom,
  resolveTier,
  tierLabel,
  tierSummary,
};
export type { Rng };

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

/**
 * Run a full F1 career on autopilot (no mid-career seat pauses).
 */
export interface SimulateCareerOptions {
  seed?: number;
  playerName?: string;
  debutTeam?: string | null;
  traits?: SignatureTrait[];
  /** Season the career begins in (drivers, teams, calendar for that year). */
  startYear?: number;
}

export function simulateCareer(
  locked: LockedAttribute[],
  seedOrOptions: number | SimulateCareerOptions = Date.now(),
  playerNameArg = "Driver",
): CareerResult {
  const options: SimulateCareerOptions =
    typeof seedOrOptions === "number"
      ? { seed: seedOrOptions, playerName: playerNameArg }
      : seedOrOptions;
  const session = beginCareer({
    locked,
    seed: options.seed ?? Date.now(),
    playerName: options.playerName ?? "Driver",
    debutTeam: options.debutTeam,
    traits: options.traits ?? deriveTraits(locked),
    startYear: options.startYear ?? LATEST_START_YEAR,
    control: "autopilot",
  });
  return runAutopilot(session);
}

/* ------------------------------------------------------------------ *
 * Helpers used by tests and the balance probes
 * ------------------------------------------------------------------ */

/** One season for a build dropped into the car ranked `teamRank` (0 = fastest). */
export function simulateProbeSeason(
  attrs: Attributes,
  options: { rand: Rng; age?: number; teamRank?: number },
): SeasonResult {
  const { rand } = options;
  const world = createWorld(rand);
  const age = options.age ?? 27;
  const rank = clamp(options.teamRank ?? 5, 0, world.teams.length - 1);
  const target = world.teams.find((t) => t.rank === rank)!;

  seatPlayerAtTeam(
    world,
    { name: "Probe Driver", peak: attrs, age },
    target.name,
  );
  const player = playerDriver(world)!;

  const result = simulateWorldSeason(world, rand);
  const mine = result.standings.find((row) => row.isPlayer)!;
  const totals = result.totals.get(player.id)!;

  return {
    year: result.year,
    age,
    team: target.name,
    teamTier: target.tier,
    position: mine.position,
    points: totals.points,
    wins: totals.wins,
    podiums: totals.podiums,
    poles: totals.poles,
    dnfs: totals.dnfs,
    champion: result.championId === player.id,
    races: result.playerRaces,
    standings: result.standings,
    constructors: result.constructors,
    championName: result.championName,
    championPoints: result.championPoints,
    seatNote: "",
    replacedDriver: null,
    offseason: null,
    goal: null,
    rival: null,
    chapter: "debut",
  };
}

export function attrsFromOverall(
  overall: number,
  shape: Partial<Attributes> = {},
): Attributes {
  const base = emptyAttributes();
  for (const key of ATTRIBUTE_KEYS) {
    base[key] = clamp(Math.round(overall + (shape[key] ?? 0)), 55, 99);
  }
  return base;
}

export function lockedFromAttrs(attrs: Attributes): LockedAttribute[] {
  // Dummy locked rows for balance tests (no real driver season needed).
  return ATTRIBUTE_KEYS.map((key) => ({
    key,
    value: attrs[key],
    from: {
      year: 2024,
      id: `balance-${key}`,
      driverId: 0,
      name: "Balance Driver",
      slug: "balance-driver",
      team: "Mercedes",
      position: 1,
      points: 0,
      races: 24,
      wins: 0,
      poles: 0,
      podiums: 0,
      fastestLaps: 0,
      dnfs: 0,
      sharpRating: 2000,
      sharpChange: 0,
      image: null,
      attributes: attrs,
      overall: computeOverall(attrs),
    },
  }));
}

export function pickRandom<T>(items: T[], rand: Rng = Math.random): T {
  return items[Math.floor(rand() * items.length)]!;
}

export function remainingAttributes(locked: AttributeKey[]): AttributeKey[] {
  const taken = new Set(locked);
  return ATTRIBUTE_KEYS.filter((k) => !taken.has(k));
}
