/**
 * Resumable career runner. Autopilot plays the whole thing in one shot;
 * decisions mode pauses at contract checkpoints for seat and career choices.
 */

import type {
  Attributes,
  CareerEndReason,
  CareerGhostArc,
  CareerGhostSeason,
  CareerResult,
  LockedAttribute,
  OffseasonNote,
  RaceResult,
  SeasonResult,
  SignatureTrait,
} from "@/types";
import {
  createWorld,
  driversForTeam,
  marketValue,
  playerDriver,
  retirementChanceFor,
  runOffseason,
  seatPlayerAtTeam,
  seatPlayerForDebut,
  simulateWorldSeason,
  teamByName,
  beginSeasonProgress,
  advanceSeasonProgress,
  finalizeSeasonFromProgress as buildWorldSeasonResult,
  standingsFromProgress,
  type DriverSeasonTotals,
  type FieldDriver,
  type OffseasonReport,
  type SeasonPolitics,
  type SeasonProgress,
  type World,
} from "@/lib/fieldSim";
import { LATEST_START_YEAR } from "@/lib/f1Meta";
import {
  carPhrase,
  type CareerSeatOffer,
} from "@/lib/careerOffers";
import {
  evaluateDecisionTriggers,
  recordDecision,
  recordDecisionChoice,
  resolveAutopilotDecision,
  scarLinesFromOption,
  seatOffersFromPack,
  midSeasonPauseThreshold,
  defaultDecisionDensityForNewCareer,
  type DecisionDensity,
  type DecisionDomain,
  type DecisionHistoryEntry,
  type DecisionOption,
  type DecisionPack,
} from "@/lib/decisionEngine";
import {
  computeOverall,
  emptyAttributes,
  mulberry32,
  type Rng,
} from "@/lib/ratings";
import { applyTraitBoosts, deriveTraits } from "@/lib/traits";
import {
  archetypeFrom,
  resolveTier,
  tierLabel,
  tierSummary,
} from "@/lib/careerOutcome";
import {
  assignChapters,
  buildRivalCareer,
  buildRivalCareers,
  evaluateSeasonGoal,
  pickSeasonGoal,
  resolveSeasonRival,
  rivalNoteFromStandings,
} from "@/lib/drama";
import { incomingRivalPressure } from "@/lib/dramaEvents";

export interface SerializedSeasonProgress {
  totals: [string, DriverSeasonTotals][];
  seasonForm: [string, number][];
  playerRaces: RaceResult[];
  roundsCompleted: number;
  politics: SeasonPolitics;
}

export function serializeSeasonProgress(
  progress: SeasonProgress,
): SerializedSeasonProgress {
  return {
    totals: [...progress.totals.entries()],
    seasonForm: [...progress.seasonForm.entries()],
    playerRaces: [...progress.playerRaces],
    roundsCompleted: progress.roundsCompleted,
    politics: { ...progress.politics },
  };
}

export function deserializeSeasonProgress(
  raw: SerializedSeasonProgress,
): SeasonProgress {
  return {
    totals: new Map(raw.totals),
    seasonForm: new Map(raw.seasonForm),
    playerRaces: [...raw.playerRaces],
    roundsCompleted: raw.roundsCompleted,
    politics: { ...raw.politics },
  };
}
export type { CareerDecisionKind, CareerSeatOffer } from "@/lib/careerOffers";
export type { DecisionDomain, DecisionPack, DecisionOption, DecisionDensity } from "@/lib/decisionEngine";

export type CareerControl = "autopilot" | "decisions";

/** A seat change the winter market made before the player got a say. */
export interface WinterMove {
  from: string;
  to: string;
  /** The new car is further up the order than the one they left. */
  promoted: boolean;
}

export interface DecisionSnapshot {
  pack: DecisionPack;
  /** Upcoming season year after the winter (or current year mid-season). */
  year: number;
  age: number;
  seasonsDone: number;
  titles: number;
  wins: number;
  points: number;
  /** Last completed season, or partial-year snapshot mid-season. */
  lastSeason?: SeasonResult;
  /** Team the player actually raced for last season. */
  raceTeam: string;
  /** Seat they hold going into the talks — post-winter, so it can differ. */
  currentTeam: string;
  currentRank: number;
  /** Set when the market moved them over the winter just gone. */
  marketMove: WinterMove | null;
  /** Flat seat offers for save/resume and legacy UI helpers. */
  offers: CareerSeatOffer[];
  /** True when paused mid-season before the year finishes. */
  midSeason: boolean;
}

export interface CareerSession {
  seed: number;
  playerName: string;
  peak: Attributes;
  peakOverall: number;
  archetype: string;
  traits: SignatureTrait[];
  control: CareerControl;
  world: World;
  player: FieldDriver;
  rand: Rng;
  seasons: SeasonResult[];
  titles: number;
  wins: number;
  podiums: number;
  poles: number;
  points: number;
  bestFinish: number;
  endReason: CareerEndReason;
  rivalName: string | null;
  /** Seasons the sticky rival has sat outside the championship neighbourhood. */
  rivalDistantStreak: number;
  seatNote: string;
  replacedDriver: string | null;
  seasonsAtTeam: number;
  previousRank: number;
  debutAge: number;
  /** Seat change made by the most recent winter market, if any. */
  lastWinterMove: WinterMove | null;
  /** Player already took a year out. */
  hadSabbatical: boolean;
  /** Seasons left where the player is framed as a support/#2 hire. */
  supportRoleYears: number;
  /** Teams signed as the clear number two. */
  number2Teams: string[];
  /** Chose Retire at a contract checkpoint. */
  walkedAway: boolean;
  /** Seasons of form damp after a sit-out. */
  formRustYears: number;
  sabbaticalYear: number | null;
  sabbaticalChampion: string | null;
  sabbaticalSeatTaker: string | null;
  /** Counterfactual arc generated when walking away. */
  ghost: CareerGhostArc | null;
  /** Winter crisis scars for museum / share. */
  dramaBeats: string[];
  /** Cooldown — recent pack ids for trigger deduping. */
  recentDecisionIds: string[];
  /** Mid-season interrupts used this calendar year (cap varies by density). */
  midSeasonDecisionsThisYear: number;
  /** Sparse / story / busy decision pacing. */
  decisionDensity: DecisionDensity;
  /** Richer anti-repeat and scar callbacks. */
  decisionHistory: DecisionHistoryEntry[];
  seasonStoryKindsThisYear: string[];
  lastPauseDomain: DecisionDomain | null;
  lastRivalBeat: "heat" | "calm" | null;
  /** In-progress season when paused mid-year. */
  seasonProgress: SeasonProgress | null;
  /** Skip one in-season pause (e.g. return from sabbatical). */
  suppressMidSeasonPause: boolean;
  /** Set when paused for any decision pack. */
  pending: DecisionSnapshot | null;
  finished: CareerResult | null;
}

const MAX_SEASONS = 22;

/** Contract talks after seasons 3, 6, 9, 12, 15. */
function isDecisionCheckpoint(seasonsDone: number): boolean {
  return (
    seasonsDone >= 3 &&
    seasonsDone % 3 === 0 &&
    seasonsDone < MAX_SEASONS
  );
}

function ordinal(n: number): string {
  const names = [
    "First",
    "Second",
    "Third",
    "Fourth",
    "Fifth",
    "Sixth",
    "Seventh",
    "Eighth",
    "Ninth",
    "Tenth",
  ];
  return names[n - 1] ?? `${n}th`;
}

function offseasonNote(report: OffseasonReport): OffseasonNote {
  return {
    retirements: report.retirements.map((r) => {
      const from = r.team && r.team !== "no seat" ? ` (${r.team})` : "";
      return r.reason === "age"
        ? `${r.name}${from} retires, aged ${r.age}`
        : `${r.name}${from} drops off the grid, aged ${r.age}`;
    }),
    promotions: report.promotions.map((p) => `${p.name} promoted to ${p.team}`),
    moves: report.moves.map((m) =>
      m.name === "Entry rebrand"
        ? `${m.from} becomes ${m.to}`
        : `${m.name}: ${m.from || "no seat"} → ${m.to}`,
    ),
    departures: report.departures.map(
      (d) => `${d.name} dropped by ${d.team}, no seat for next season`,
    ),
  };
}

function playerRetires(player: FieldDriver, rand: Rng): boolean {
  if (player.age >= 42) return true;
  if (player.age < 33) return false;
  return rand() < retirementChanceFor(player) * 0.85;
}

function finalize(session: CareerSession): CareerResult {
  const { seasons: chaptered, chapters } = assignChapters(session.seasons);
  const rivals = buildRivalCareers(chaptered);
  const rival = rivals[0] ?? buildRivalCareer(chaptered);
  const stats = {
    titles: session.titles,
    wins: session.wins,
    podiums: session.podiums,
    points: session.points,
  };
  const tier = resolveTier(stats);
  const base = {
    seasons: chaptered,
    titles: session.titles,
    wins: session.wins,
    podiums: session.podiums,
    poles: session.poles,
    points: session.points,
    bestFinish: Math.min(session.bestFinish, 30),
    overall: session.peakOverall,
    peakOverall: session.peakOverall,
    debutAge: session.debutAge,
    finalAge: session.player.age,
    endReason: session.endReason,
    archetype: session.archetype,
    seed: session.seed,
    traits: session.traits,
    rival,
    rivals,
    chapters,
    pathMarks: {
      hadSabbatical: session.hadSabbatical,
      number2Teams: [...session.number2Teams],
      walkedAway: session.walkedAway,
      sabbaticalYear: session.sabbaticalYear ?? undefined,
      sabbaticalChampion: session.sabbaticalChampion ?? undefined,
      sabbaticalSeatTaker: session.sabbaticalSeatTaker ?? undefined,
      ghost: session.ghost,
      dramaBeats: session.dramaBeats.length
        ? [...session.dramaBeats]
        : undefined,
    },
  };
  session.finished = {
    ...base,
    tier,
    tierLabel: tierLabel(tier),
    summary: tierSummary(tier, base),
  };
  session.pending = null;
  return session.finished;
}

export { midCareerOffers } from "@/lib/careerOffers";

function decisionSnapshot(
  session: CareerSession,
  pack: DecisionPack,
  midSeason = false,
  progress?: SeasonProgress,
): DecisionSnapshot {
  const current = teamByName(session.world, session.player.team);
  const completed = session.seasons[session.seasons.length - 1];
  let lastSeason: SeasonResult | undefined = completed;

  if (midSeason && progress) {
    const standings = standingsFromProgress(session.world, progress);
    const mine = standings.find((row) => row.isPlayer);
    const totals = progress.totals.get(session.player.id);
    const team = teamByName(session.world, session.player.team);
    if (mine && totals) {
      lastSeason = {
        year: session.world.year,
        age: session.player.age,
        team: session.player.team,
        teamTier: team.tier,
        position: mine.position,
        points: totals.points,
        wins: totals.wins,
        podiums: totals.podiums,
        poles: totals.poles,
        dnfs: totals.dnfs,
        champion: false,
        races: [...progress.playerRaces],
        standings,
        constructors: [],
        championName: standings[0]?.name ?? "",
        championPoints: standings[0]?.points ?? 0,
        seatNote: session.seatNote,
        replacedDriver: session.replacedDriver,
        supportRole: session.supportRoleYears > 0,
        offseason: null,
        goal: null,
        rival: completed?.rival ?? null,
        chapter: completed?.chapter ?? "debut",
      };
    }
  }

  return {
    pack,
    year: session.world.year,
    age: session.player.age,
    seasonsDone: session.seasons.length,
    titles: session.titles,
    wins: session.wins,
    points: session.points,
    lastSeason,
    raceTeam: midSeason ? session.player.team : (completed?.team ?? session.player.team),
    currentTeam: current.name,
    currentRank: current.rank,
    marketMove: midSeason ? null : session.lastWinterMove,
    offers: seatOffersFromPack(pack),
    midSeason,
  };
}

export interface BeginCareerOptions {
  locked: LockedAttribute[];
  seed: number;
  playerName: string;
  debutTeam?: string | null;
  traits?: SignatureTrait[];
  startYear?: number;
  control?: CareerControl;
  decisionDensity?: DecisionDensity;
}

export function beginCareer(options: BeginCareerOptions): CareerSession {
  const seed = options.seed;
  const playerName = options.playerName || "Driver";
  const traits = options.traits ?? deriveTraits(options.locked);
  const startYear = options.startYear ?? LATEST_START_YEAR;
  const control = options.control ?? "autopilot";
  const decisionDensity =
    options.decisionDensity ?? defaultDecisionDensityForNewCareer();

  const peakRaw = emptyAttributes();
  for (const item of options.locked) peakRaw[item.key] = item.value;
  const peak = applyTraitBoosts(peakRaw, traits);
  const peakOverall = computeOverall(peak);
  const archetype = archetypeFrom(peakRaw);
  const rand = mulberry32(seed);

  const world = createWorld(rand, startYear);
  const debutAge = 19 + Math.floor(rand() * 4);
  const debut = options.debutTeam
    ? seatPlayerAtTeam(
        world,
        { name: playerName, peak, age: debutAge },
        options.debutTeam,
      )
    : seatPlayerForDebut(
        world,
        { name: playerName, peak, age: debutAge },
        rand,
      );
  const player = playerDriver(world)!;

  return {
    seed,
    playerName,
    peak,
    peakOverall,
    archetype,
    traits,
    control,
    world,
    player,
    rand,
    seasons: [],
    titles: 0,
    wins: 0,
    podiums: 0,
    poles: 0,
    points: 0,
    bestFinish: 30,
    endReason: "retired",
    rivalName: null,
    rivalDistantStreak: 0,
    seatNote: debut.replaced
      ? `Rookie season at ${debut.team}, taking ${debut.replaced}'s seat`
      : `Rookie season at ${debut.team}`,
    replacedDriver: debut.replaced,
    seasonsAtTeam: 1,
    previousRank: teamByName(world, player.team).rank,
    debutAge,
    lastWinterMove: null,
    hadSabbatical: false,
    supportRoleYears: 0,
    number2Teams: [],
    walkedAway: false,
    formRustYears: 0,
    sabbaticalYear: null,
    sabbaticalChampion: null,
    sabbaticalSeatTaker: null,
    ghost: null,
    dramaBeats: [],
    recentDecisionIds: [],
    midSeasonDecisionsThisYear: 0,
    decisionDensity,
    decisionHistory: [],
    seasonStoryKindsThisYear: [],
    lastPauseDomain: null,
    lastRivalBeat: null,
    seasonProgress: null,
    suppressMidSeasonPause: false,
    pending: null,
    finished: null,
  };
}

function buildSeasonPolitics(session: CareerSession): SeasonPolitics {
  const { player, world } = session;
  const supportActive = session.supportRoleYears > 0;
  const rustActive = session.formRustYears > 0;
  const prior = session.seasons[session.seasons.length - 1];
  const pressure = incomingRivalPressure(
    prior?.rival,
    session.rivalName,
    player.team,
    world,
  );
  return {
    supportRolePlayerId: supportActive ? player.id : null,
    formRustPlayerId: rustActive ? player.id : null,
    rivalHeat: pressure.heat,
    rivalDriverId: pressure.rivalDriver?.id ?? null,
    playerId: player.id,
  };
}

function midSeasonCheckpointRounds(calendarLength: number): number[] {
  const half = Math.floor(calendarLength * 0.5);
  const late = Math.floor(calendarLength * 0.72);
  return half >= 4 ? [half, late] : [];
}

function tryMidSeasonDecision(
  session: CareerSession,
  progress: SeasonProgress,
  lastSeason: SeasonResult,
): boolean {
  const { world, rand } = session;
  const calendarLength = world.rules.calendar.length;
  const round = progress.roundsCompleted;
  const checkpoints = midSeasonCheckpointRounds(calendarLength);
  if (!checkpoints.includes(round)) return false;
  if (session.midSeasonDecisionsThisYear >= 2) return false;
  if (session.seasons.length < 3) return false;
  if (session.suppressMidSeasonPause) return false;

  const standings = standingsFromProgress(world, progress);
  const mine = standings.find((row) => row.isPlayer);
  if (!mine) return false;

  const pack = evaluateDecisionTriggers(
    {
      session,
      lastSeason,
      seasonsDone: session.seasons.length,
      isWinterCheckpoint: false,
      afterRound: round,
      playerPosition: mine.position,
      playerPoints: mine.points,
      calendarLength,
    },
    rand,
  );
  if (!pack || (pack.urgency ?? 0) < midSeasonPauseThreshold(session)) return false;

  recordDecision(session, pack);
  session.pending = decisionSnapshot(session, pack, true, progress);
  session.seasonProgress = progress;

  if (session.control === "autopilot") {
    const option = resolveAutopilotDecision(session, pack);
    applyDecisionEffects(session, option, pack);
    session.pending = null;
    return false;
  }
  return true;
}

function finalizeSeasonFromProgress(
  session: CareerSession,
  progress: SeasonProgress,
  goal: SeasonResult["goal"],
  supportActive: boolean,
): boolean {
  const { world, player, rand, playerName } = session;
  const team = teamByName(world, player.team);
  const result = buildWorldSeasonResult(world, progress);
  const mine = result.standings.find((row) => row.isPlayer);
  const myTotals = result.totals.get(player.id);
  if (!mine || !myTotals) {
    session.endReason = "lostSeat";
    session.seasonProgress = null;
    return false;
  }

  const resolved = resolveSeasonRival(
    session.rivalName,
    result.standings,
    player.team,
    session.rivalDistantStreak,
    rand,
  );
  session.rivalName = resolved.name;
  session.rivalDistantStreak = resolved.distantStreak;
  const rival = rivalNoteFromStandings(result.standings, session.rivalName);
  const evaluatedGoal = evaluateSeasonGoal(
    goal!,
    {
      position: mine.position,
      points: myTotals.points,
      wins: myTotals.wins,
      podiums: myTotals.podiums,
    },
    result.standings,
    playerName,
    session.rivalName,
  );

  const season: SeasonResult = {
    year: result.year,
    age: player.age,
    team: player.team,
    teamTier: team.tier,
    position: mine.position,
    points: myTotals.points,
    wins: myTotals.wins,
    podiums: myTotals.podiums,
    poles: myTotals.poles,
    dnfs: myTotals.dnfs,
    champion: result.championId === player.id,
    races: result.playerRaces,
    standings: result.standings,
    constructors: result.constructors,
    championName: result.championName,
    championPoints: result.championPoints,
    seatNote: session.seatNote,
    replacedDriver: session.replacedDriver,
    supportRole: supportActive,
    offseason: null,
    goal: evaluatedGoal,
    rival,
    chapter: "debut",
  };
  session.seasons.push(season);
  session.seasonProgress = null;
  session.midSeasonDecisionsThisYear = 0;
  session.seasonStoryKindsThisYear = [];
  session.suppressMidSeasonPause = false;

  if (season.champion) session.titles++;
  session.wins += season.wins;
  session.podiums += season.podiums;
  session.poles += season.poles;
  session.points += season.points;
  session.bestFinish = Math.min(session.bestFinish, season.position);

  if (session.seasons.length >= MAX_SEASONS) return false;

  const previousTeam = player.team;
  const report = runOffseason(world, result, rand);
  season.offseason = offseasonNote(report);

  if (!world.playerActive) {
    session.endReason = "lostSeat";
    return false;
  }
  if (playerRetires(player, rand)) {
    session.endReason = "retired";
    return false;
  }

  session.replacedDriver = null;
  const nextRank = teamByName(world, player.team).rank;

  session.lastWinterMove =
    player.team !== previousTeam
      ? {
          from: previousTeam,
          to: player.team,
          promoted: nextRank < session.previousRank,
        }
      : null;

  if (player.team !== previousTeam) {
    session.seatNote = `Signed by ${player.team} after ${session.seasonsAtTeam} season${session.seasonsAtTeam === 1 ? "" : "s"} at ${previousTeam}`;
    session.seasonsAtTeam = 1;
  } else {
    session.seasonsAtTeam++;
    session.seatNote = `${ordinal(session.seasonsAtTeam)} season at ${player.team}`;
  }

  if (
    player.team !== previousTeam ||
    Math.abs(nextRank - session.previousRank) >= 2
  ) {
    session.seatNote += `, in ${carPhrase(nextRank, world.teams.length)}`;
  }
  session.previousRank = nextRank;
  return true;
}

function runOneSeason(session: CareerSession): boolean {
  const { world, player, rand, peakOverall } = session;

  const supportActive = session.supportRoleYears > 0;
  const rustActive = session.formRustYears > 0;

  if (supportActive) {
    player.reputation = Math.max(0.22, player.reputation * 0.84);
    session.supportRoleYears -= 1;
  }
  if (rustActive) {
    player.reputation = Math.max(0.24, player.reputation * 0.92);
    session.formRustYears -= 1;
  }

  const s = session.seasons.length;
  const team = teamByName(world, player.team);
  const teammate =
    driversForTeam(world, player.team).find((d) => !d.isPlayer)?.name ?? null;
  const goal = pickSeasonGoal(
    {
      seasonIndex: s,
      teamTier: team.tier,
      peakOverall,
      teammateName: teammate,
      rivalName: session.rivalName,
      supportRole: supportActive,
    },
    rand,
  );

  const lastSeasonRef =
    session.seasons[session.seasons.length - 1] ??
    ({
      year: world.year - 1,
      age: player.age - 1,
      team: player.team,
      teamTier: team.tier,
      position: 10,
      points: 0,
      wins: 0,
      podiums: 0,
      poles: 0,
      dnfs: 0,
      champion: false,
      races: [],
      standings: [],
      constructors: [],
      championName: "",
      championPoints: 0,
      seatNote: session.seatNote,
      replacedDriver: null,
      offseason: null,
      goal: null,
      rival: null,
      chapter: "debut",
    } satisfies SeasonResult);

  let progress =
    session.seasonProgress ??
    beginSeasonProgress(world, rand, buildSeasonPolitics(session));

  if (!session.seasonProgress) {
    session.midSeasonDecisionsThisYear = 0;
    session.seasonStoryKindsThisYear = [];
  }

  const calendarLength = world.rules.calendar.length;
  const checkpoints = midSeasonCheckpointRounds(calendarLength);
  const nextStop =
    checkpoints.find((r) => r > progress.roundsCompleted) ?? calendarLength;

  advanceSeasonProgress(world, rand, progress, nextStop);

  if (
    nextStop < calendarLength &&
    tryMidSeasonDecision(session, progress, lastSeasonRef)
  ) {
    return true;
  }

  if (progress.roundsCompleted < calendarLength) {
    advanceSeasonProgress(world, rand, progress, calendarLength);
  }

  return finalizeSeasonFromProgress(session, progress, goal, supportActive);
}

/**
 * Run seasons until the career ends or (in decisions mode) a checkpoint.
 * Returns the finished career, or null if paused for a decision.
 */
export function advanceCareer(session: CareerSession): CareerResult | null {
  if (session.finished) return session.finished;

  while (session.seasons.length < MAX_SEASONS) {
    const keepGoing = runOneSeason(session);
    if (!keepGoing) return finalize(session);

    if (session.pending) {
      return null;
    }

    if (isDecisionCheckpoint(session.seasons.length)) {
      const last = session.seasons[session.seasons.length - 1]!;
      const pack = evaluateDecisionTriggers(
        {
          session,
          lastSeason: last,
          seasonsDone: session.seasons.length,
          isWinterCheckpoint: true,
        },
        session.rand,
      );
      if (!pack) continue;

      recordDecision(session, pack);
      const pending = decisionSnapshot(session, pack, false);
      if (session.control === "decisions") {
        session.pending = pending;
        return null;
      }
      const result = resolveAutopilotCheckpoint(session, pending);
      if (result) return result;
    }
  }

  return finalize(session);
}

/** Deep-clone a world for counterfactual sims (Sets don't survive JSON). */
function cloneWorld(world: World): World {
  const raw = JSON.parse(
    JSON.stringify({
      ...world,
      usedNames: [...world.usedNames],
      rules: {
        ...world.rules,
        sprintRounds: [...world.rules.sprintRounds],
      },
    }),
  ) as Omit<World, "usedNames" | "rules"> & {
    usedNames: string[];
    rules: Omit<World["rules"], "sprintRounds"> & { sprintRounds: number[] };
  };
  return {
    ...raw,
    usedNames: new Set(raw.usedNames),
    rules: {
      ...raw.rules,
      sprintRounds: new Set(raw.rules.sprintRounds),
    },
  };
}

/**
 * Fork the live grid and race a few more seasons as if the player stayed.
 * Results never touch the real career totals.
 */
function projectGhostCareer(session: CareerSession): CareerGhostArc {
  const world = cloneWorld(session.world);
  const rand = mulberry32(
    (session.seed ^ 0x9e3779b9 ^ (session.seasons.length * 0x85ebca6b)) >>> 0,
  );
  const seasons: CareerGhostSeason[] = [];
  let projectedTitles = 0;
  let projectedWins = 0;
  const horizon = 4;

  for (let i = 0; i < horizon; i++) {
    const player = playerDriver(world);
    if (!player || !world.playerActive) break;
    player.contractYears = Math.max(2, player.contractYears);

    const result = simulateWorldSeason(world, rand);
    const mine = result.standings.find((row) => row.isPlayer);
    const totals = result.totals.get(player.id);
    if (!mine || !totals) break;

    const champion = result.championId === player.id;
    if (champion) projectedTitles++;
    projectedWins += totals.wins;
    seasons.push({
      year: result.year,
      team: player.team,
      position: mine.position,
      wins: totals.wins,
      points: totals.points,
      champion,
    });

    runOffseason(world, result, rand);
    if (!world.playerActive || !playerDriver(world)) break;
  }

  const last = seasons[seasons.length - 1];
  const projectedFinalAge =
    playerDriver(world)?.age ?? session.player.age + seasons.length;
  let headline = "The grid moved on without you.";
  if (projectedTitles > 0 && last) {
    headline =
      projectedTitles === 1
        ? `Another title was there at ${last.team} by ${projectedFinalAge}.`
        : `${projectedTitles} more titles were on the table if you'd stayed.`;
  } else if (projectedWins >= 3 && last) {
    headline = `${projectedWins} more wins were sitting in the ${last.team}.`;
  } else if (last && last.position <= 5) {
    headline = `You were still a ${last.team} front-runner through ${last.year}.`;
  } else if (last) {
    headline = `Staying would have meant ${seasons.length} more seasons at ${last.team}.`;
  }

  return {
    seasons,
    projectedTitles,
    projectedWins,
    projectedFinalAge,
    headline,
  };
}

/** Park the player for a year, let the grid race, then force a return seat. */
function applySabbatical(session: CareerSession) {
  const { world, rand, player } = session;
  const leftTeam = player.team;
  let seatTaker: string | null = null;

  world.drivers = world.drivers.filter((d) => d.id !== player.id);
  player.team = "";
  player.yearsWithoutSeat = 0;
  if (!world.freeAgents.some((d) => d.id === player.id)) {
    world.freeAgents.push(player);
  }

  // Keep the vacated garage full so the season can still run.
  if (driversForTeam(world, leftTeam).length < 2) {
    const filler = [...world.freeAgents]
      .filter((d) => !d.isPlayer)
      .sort((a, b) => marketValue(b) - marketValue(a))[0];
    if (filler) {
      world.freeAgents = world.freeAgents.filter((d) => d.id !== filler.id);
      filler.team = leftTeam;
      filler.seasonsAtTeam = 0;
      filler.yearsWithoutSeat = 0;
      filler.contractYears = 1;
      world.drivers.push(filler);
      seatTaker = filler.name;
    }
  }

  const result = simulateWorldSeason(world, rand);
  runOffseason(world, result, rand);

  // Offseason may have force-seated or dropped the parked player — normalize.
  const parked =
    playerDriver(world) ??
    world.freeAgents.find((d) => d.isPlayer) ??
    player;
  world.drivers = world.drivers.filter((d) => !d.isPlayer);
  world.freeAgents = world.freeAgents.filter((d) => !d.isPlayer);
  world.playerActive = true;

  const preferred =
    world.teams.find((t) => t.name === leftTeam)?.name ??
    world.teams[world.teams.length - 1]!.name;
  const seated = seatPlayerAtTeam(
    world,
    {
      name: session.playerName,
      peak: session.peak,
      age: parked.age,
    },
    preferred,
  );
  session.player = playerDriver(world)!;
  session.player.contractYears = 1;
  // Rust: cold momentum, softer reputation, one year of form damp.
  session.player.attributes = {
    ...session.player.attributes,
    momentum: Math.max(
      40,
      Math.round(session.player.attributes.momentum * 0.78),
    ),
    racePace: Math.max(
      40,
      Math.round(session.player.attributes.racePace * 0.94),
    ),
  };
  session.player.overall = computeOverall(session.player.attributes);
  session.player.reputation = Math.max(0.28, session.player.reputation * 0.86);
  session.hadSabbatical = true;
  session.formRustYears = 1;
  session.sabbaticalYear = result.year;
  session.sabbaticalChampion = result.championName || null;
  session.sabbaticalSeatTaker = seatTaker;
  session.supportRoleYears = 0;
  session.seasonsAtTeam = 1;
  session.previousRank = teamByName(world, seated.team).rank;
  session.lastWinterMove =
    seated.team !== leftTeam
      ? { from: leftTeam, to: seated.team, promoted: false }
      : null;
  const championBit = result.championName
    ? ` — ${result.championName} took the title`
    : "";
  session.seatNote = `Back after sitting out ${result.year}${championBit}${
    seated.team !== leftTeam ? `, landing at ${seated.team}` : ` at ${seated.team}`
  }`;
  session.replacedDriver = seated.replaced;
  session.suppressMidSeasonPause = true;
}

function applySeatChoice(
  session: CareerSession,
  offer: CareerSeatOffer,
): void {
  const winterMove = session.pending?.marketMove ?? null;
  const choice = offer.team || session.player.team;

  if (choice !== session.player.team || offer.kind === "number2") {
    const from = session.player.team;
    const moved = seatPlayerAtTeam(
      session.world,
      {
        name: session.playerName,
        peak: session.peak,
        age: session.player.age,
      },
      choice,
    );
    session.player = playerDriver(session.world)!;
    session.player.contractYears = offer.kind === "number2" ? 3 : 2;
    session.seasonsAtTeam = 1;
    session.previousRank = teamByName(session.world, moved.team).rank;

    if (offer.kind === "number2") {
      session.supportRoleYears = 2;
      if (!session.number2Teams.includes(moved.team)) {
        session.number2Teams.push(moved.team);
      }
      session.player.reputation = Math.max(
        0.3,
        session.player.reputation * 0.88,
      );
      session.seatNote = `Signed as the ${moved.team} number two — loyal lieutenant${
        moved.replaced ? `, taking ${moved.replaced}'s seat` : ""
      }, in ${carPhrase(session.previousRank, session.world.teams.length)}`;
    } else {
      session.supportRoleYears = 0;
      const over = winterMove ? `turning down ${from}` : `over ${from}`;
      session.seatNote = `Chose ${moved.team} ${over}${
        moved.replaced ? `, taking ${moved.replaced}'s seat` : ""
      }, in ${carPhrase(session.previousRank, session.world.teams.length)}`;
    }
    session.replacedDriver = moved.replaced;
    return;
  }

  session.player.contractYears = Math.max(2, session.player.contractYears);
  session.supportRoleYears = 0;
  if (!winterMove) {
    session.seatNote = `${ordinal(session.seasonsAtTeam)} season at ${session.player.team} after re-signing`;
  }
  session.replacedDriver = null;
}

function applyDecisionEffects(
  session: CareerSession,
  option: DecisionOption,
  pack?: DecisionPack | null,
): "retire" | "sabbatical" | "continue" {
  const activePack = pack ?? session.pending?.pack ?? null;
  if (activePack) {
    recordDecisionChoice(session, activePack, option);
  }
  for (const line of scarLinesFromOption(option)) {
    session.dramaBeats.push(`${line} — chose ${option.label}`);
  }

  let outcome: "retire" | "sabbatical" | "continue" = "continue";

  for (const effect of option.effects) {
    switch (effect.kind) {
      case "seatChoice":
        if (effect.seatOffer) applySeatChoice(session, effect.seatOffer);
        break;
      case "retire":
        outcome = "retire";
        break;
      case "sabbatical":
        outcome = "sabbatical";
        break;
      case "acceptOrders":
        session.supportRoleYears = Math.max(
          session.supportRoleYears,
          effect.supportRoleYears ?? 2,
        );
        if (session.seasonProgress) {
          session.seasonProgress.politics.supportRolePlayerId = session.player.id;
        }
        if (effect.reputationDelta != null) {
          session.player.reputation = Math.max(
            0.2,
            session.player.reputation + effect.reputationDelta,
          );
        }
        break;
      case "fightOrders":
        session.supportRoleYears = 0;
        if (session.seasonProgress) {
          session.seasonProgress.politics.supportRolePlayerId = null;
        }
        if (effect.reputationDelta != null) {
          session.player.reputation = Math.min(
            1,
            session.player.reputation + effect.reputationDelta,
          );
        }
        break;
      case "ignoreRival":
      case "chaseRival":
        if (session.seasonProgress && effect.rivalHeat) {
          session.seasonProgress.politics.rivalHeat = effect.rivalHeat;
        }
        break;
      case "extendContract":
        session.player.contractYears = Math.max(2, session.player.contractYears);
        if (effect.reputationDelta != null) {
          session.player.reputation = Math.min(
            1,
            Math.max(0.2, session.player.reputation + effect.reputationDelta),
          );
        }
        break;
      case "mediaPush":
      case "politicsBoost":
      case "mediaSilence":
      case "politicsDamage":
        if (effect.reputationDelta != null) {
          session.player.reputation = Math.min(
            1,
            Math.max(0.2, session.player.reputation + effect.reputationDelta),
          );
        }
        break;
    }
  }

  return outcome;
}

function applyDecisionOption(
  session: CareerSession,
  option: DecisionOption,
): CareerResult | null {
  const pack = session.pending?.pack ?? null;
  const outcome = applyDecisionEffects(session, option, pack);

  if (outcome === "retire") {
    session.endReason = "retired";
    session.walkedAway = true;
    session.ghost = projectGhostCareer(session);
    session.seatNote = `Retired after ${session.seasons.length} seasons`;
    session.pending = null;
    session.seasonProgress = null;
    return finalize(session);
  }

  if (outcome === "sabbatical") {
    applySabbatical(session);
    session.pending = null;
    session.seasonProgress = null;
    return advanceCareer(session);
  }

  session.pending = null;
  return advanceCareer(session);
}

/** Pick a plausible career fork without interrupting a one-shot run. */
function resolveAutopilotCheckpoint(
  session: CareerSession,
  pending: DecisionSnapshot,
): CareerResult | null {
  const option = resolveAutopilotDecision(session, pending.pack);
  return applyDecisionOption(session, option);
}

/**
 * Apply a checkpoint choice (by option id or legacy team name), then continue.
 */
export function resolveCareerDecision(
  session: CareerSession,
  choiceId: string,
): CareerResult | null {
  if (!session.pending) return session.finished;

  const pending = session.pending;
  const option =
    pending.pack.options.find((o) => o.id === choiceId) ??
    pending.pack.options.find((o) => o.team === choiceId) ??
    pending.pack.options.find((o) => o.kind === "stay") ??
    pending.pack.options[0]!;

  return applyDecisionOption(session, option);
}

/** Autopilot: run the entire career without pausing. */
export function runAutopilot(session: CareerSession): CareerResult {
  session.control = "autopilot";
  const result = advanceCareer(session);
  return result ?? finalize(session);
}
