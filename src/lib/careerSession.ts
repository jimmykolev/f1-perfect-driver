/**
 * Resumable career runner. Autopilot plays the whole thing in one shot;
 * decisions mode pauses at contract checkpoints for seat choices.
 */

import type {
  Attributes,
  CareerEndReason,
  CareerResult,
  LockedAttribute,
  OffseasonNote,
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
  type FieldDriver,
  type OffseasonReport,
  type World,
} from "@/lib/fieldSim";
import { LATEST_START_YEAR } from "@/lib/f1Meta";
import {
  assignChapters,
  buildRivalCareer,
  chooseRival,
  evaluateSeasonGoal,
  pickSeasonGoal,
  rivalNoteFromStandings,
} from "@/lib/drama";
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

export type CareerControl = "autopilot" | "decisions";

/** Offer shown at a mid-career contract checkpoint. */
export interface CareerSeatOffer {
  team: string;
  tier: number;
  rank: number;
  label: string;
  blurb: string;
  /** Stay keeps the current drive; the others are moves. */
  kind: "stay" | "reach" | "fit" | "safe";
}

/** A seat change the winter market made before the player got a say. */
export interface WinterMove {
  from: string;
  to: string;
  /** The new car is further up the order than the one they left. */
  promoted: boolean;
}

export interface DecisionSnapshot {
  /** Upcoming season year after the winter. */
  year: number;
  age: number;
  seasonsDone: number;
  titles: number;
  wins: number;
  points: number;
  lastSeason: SeasonResult;
  /** Team the player actually raced for last season. */
  raceTeam: string;
  /** Seat they hold going into the talks — post-winter, so it can differ. */
  currentTeam: string;
  currentRank: number;
  /** Set when the market moved them over the winter just gone. */
  marketMove: WinterMove | null;
  offers: CareerSeatOffer[];
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
  seatNote: string;
  replacedDriver: string | null;
  seasonsAtTeam: number;
  previousRank: number;
  debutAge: number;
  /** Seat change made by the most recent winter market, if any. */
  lastWinterMove: WinterMove | null;
  /** Set when paused for a seat decision. */
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

function carPhrase(rank: number, teams: number): string {
  if (rank === 0) return "the fastest car on the grid";
  if (rank <= 2) return "a front-running car";
  if (rank <= Math.floor(teams / 2)) return "a solid midfield car";
  if (rank <= teams - 3) return "a slow car";
  return "one of the worst cars on the grid";
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
  const rival = buildRivalCareer(chaptered);
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
    chapters,
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

/** Build stay / upgrade / alternative offers from the live grid. */
export function midCareerOffers(
  world: World,
  player: FieldDriver,
  winterMove: WinterMove | null = null,
): CareerSeatOffer[] {
  const current = teamByName(world, player.team);
  const value = marketValue(player);
  const teams = [...world.teams].sort((a, b) => a.rank - b.rank);
  const used = new Set<string>([current.name]);

  const stay: CareerSeatOffer = {
    team: current.name,
    tier: current.tier,
    rank: current.rank,
    kind: "stay",
    label: winterMove ? "Take it" : "Stay",
    blurb: winterMove
      ? winterMove.promoted
        ? `${current.name} came for you after ${winterMove.from} — ${carPhrase(current.rank, teams.length)}.`
        : `${winterMove.from} moved on without you. ${current.name} is ${carPhrase(current.rank, teams.length)}.`
      : `Re-sign at ${current.name} — ${carPhrase(current.rank, teams.length)}.`,
  };

  // Stretch: a clearly faster car, if any still has a weaker seat to take.
  const reachTeam =
    teams.find(
      (t) =>
        !used.has(t.name) &&
        t.rank < current.rank &&
        (value >= 78 || t.rank >= current.rank - 3),
    ) ?? null;
  let reach: CareerSeatOffer | null = null;
  if (reachTeam) {
    used.add(reachTeam.name);
    reach = {
      team: reachTeam.name,
      tier: reachTeam.tier,
      rank: reachTeam.rank,
      kind: "reach",
      label: "Reach",
      blurb: `${reachTeam.name} is the upgrade — more car, less security.`,
    };
  }

  // Alternative: different garage near market level (not current).
  const fitTarget = Math.max(
    0,
    Math.min(
      teams.length - 1,
      value >= 90
        ? 1
        : value >= 82
          ? 3
          : value >= 74
            ? 5
            : value >= 66
              ? 7
              : teams.length - 2,
    ),
  );
  const moveTeam =
    teams
      .filter((t) => !used.has(t.name))
      .sort(
        (a, b) =>
          Math.abs(a.rank - fitTarget) - Math.abs(b.rank - fitTarget) ||
          a.rank - b.rank,
      )[0] ?? null;

  const move: CareerSeatOffer | null = moveTeam
    ? {
        team: moveTeam.name,
        tier: moveTeam.tier,
        rank: moveTeam.rank,
        kind: moveTeam.rank < current.rank ? "fit" : "safe",
        label: moveTeam.rank < current.rank ? "Move" : "Safe",
        blurb:
          moveTeam.rank < current.rank
            ? `${moveTeam.name} wants you — a sideways step up the order.`
            : `${moveTeam.name} is the safer landing if ${current.name} turns sour.`,
      }
    : null;

  const offers = [stay];
  if (reach) offers.push(reach);
  if (move) offers.push(move);

  // Prefer car-quality order for non-stay options, stay first.
  return [
    stay,
    ...offers
      .filter((o) => o.kind !== "stay")
      .sort((a, b) => a.rank - b.rank),
  ];
}

export interface BeginCareerOptions {
  locked: LockedAttribute[];
  seed: number;
  playerName: string;
  debutTeam?: string | null;
  traits?: SignatureTrait[];
  startYear?: number;
  control?: CareerControl;
}

export function beginCareer(options: BeginCareerOptions): CareerSession {
  const seed = options.seed;
  const playerName = options.playerName || "Driver";
  const traits = options.traits ?? deriveTraits(options.locked);
  const startYear = options.startYear ?? LATEST_START_YEAR;
  const control = options.control ?? "autopilot";

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
    seatNote: debut.replaced
      ? `Rookie season at ${debut.team}, taking ${debut.replaced}'s seat`
      : `Rookie season at ${debut.team}`,
    replacedDriver: debut.replaced,
    seasonsAtTeam: 1,
    previousRank: teamByName(world, player.team).rank,
    debutAge,
    lastWinterMove: null,
    pending: null,
    finished: null,
  };
}

function runOneSeason(session: CareerSession): boolean {
  const { world, player, rand, peakOverall, playerName } = session;
  const s = session.seasons.length;
  const team = teamByName(world, player.team);
  const age = player.age;
  const teammate =
    driversForTeam(world, player.team).find((d) => !d.isPlayer)?.name ?? null;
  const goal = pickSeasonGoal(
    {
      seasonIndex: s,
      teamTier: team.tier,
      peakOverall,
      teammateName: teammate,
    },
    rand,
  );

  const result = simulateWorldSeason(world, rand);
  const mine = result.standings.find((row) => row.isPlayer);
  const myTotals = result.totals.get(player.id);
  if (!mine || !myTotals) {
    session.endReason = "lostSeat";
    return false;
  }

  if (
    !session.rivalName ||
    !result.standings.some((row) => row.name === session.rivalName)
  ) {
    session.rivalName = chooseRival(result.standings, player.team, rand);
  }
  const rival = rivalNoteFromStandings(result.standings, session.rivalName);
  const evaluatedGoal = evaluateSeasonGoal(
    goal,
    {
      position: mine.position,
      points: myTotals.points,
      wins: myTotals.wins,
      podiums: myTotals.podiums,
    },
    result.standings,
    playerName,
  );

  const season: SeasonResult = {
    year: result.year,
    age,
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
    offseason: null,
    goal: evaluatedGoal,
    rival,
    chapter: "debut",
  };
  session.seasons.push(season);

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

/**
 * Run seasons until the career ends or (in decisions mode) a checkpoint.
 * Returns the finished career, or null if paused for a decision.
 */
export function advanceCareer(session: CareerSession): CareerResult | null {
  if (session.finished) return session.finished;
  session.pending = null;

  while (session.seasons.length < MAX_SEASONS) {
    const keepGoing = runOneSeason(session);
    if (!keepGoing) return finalize(session);

    if (
      session.control === "decisions" &&
      isDecisionCheckpoint(session.seasons.length)
    ) {
      const last = session.seasons[session.seasons.length - 1]!;
      const current = teamByName(session.world, session.player.team);
      session.pending = {
        year: session.world.year,
        age: session.player.age,
        seasonsDone: session.seasons.length,
        titles: session.titles,
        wins: session.wins,
        points: session.points,
        lastSeason: last,
        raceTeam: last.team,
        currentTeam: current.name,
        currentRank: current.rank,
        marketMove: session.lastWinterMove,
        offers: midCareerOffers(
          session.world,
          session.player,
          session.lastWinterMove,
        ),
      };
      return null;
    }
  }

  return finalize(session);
}

/** Apply a seat choice at a checkpoint, then continue. */
export function resolveCareerDecision(
  session: CareerSession,
  teamName: string,
): CareerResult | null {
  if (!session.pending) return session.finished;
  const offer = session.pending.offers.find((o) => o.team === teamName);
  const choice = offer?.team ?? session.player.team;
  const winterMove = session.pending.marketMove;

  if (choice !== session.player.team) {
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
    session.player.contractYears = 2;
    session.seasonsAtTeam = 1;
    session.previousRank = teamByName(session.world, moved.team).rank;
    const over = winterMove
      ? `turning down ${from}`
      : `over ${from}`;
    session.seatNote = `Chose ${moved.team} ${over}${
      moved.replaced ? `, taking ${moved.replaced}'s seat` : ""
    }, in ${carPhrase(session.previousRank, session.world.teams.length)}`;
    session.replacedDriver = moved.replaced;
  } else {
    session.player.contractYears = Math.max(2, session.player.contractYears);
    // A seat the winter market handed them is not a re-signing; the note set
    // during the offseason already reads as a transfer.
    if (!winterMove) {
      session.seatNote = `${ordinal(session.seasonsAtTeam)} season at ${session.player.team} after re-signing`;
    }
    session.replacedDriver = null;
  }

  session.pending = null;
  return advanceCareer(session);
}

/** Autopilot: run the entire career without pausing. */
export function runAutopilot(session: CareerSession): CareerResult {
  session.control = "autopilot";
  const result = advanceCareer(session);
  return result ?? finalize(session);
}
