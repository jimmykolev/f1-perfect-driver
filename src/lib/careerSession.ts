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
  buildRivalCareers,
  evaluateSeasonGoal,
  pickSeasonGoal,
  resolveSeasonRival,
  rivalNoteFromStandings,
} from "@/lib/drama";
import {
  applyDramaToOffers,
  dramaScarLine,
  incomingRivalPressure,
  maybeWinterDrama,
  type DramaCrisis,
} from "@/lib/dramaEvents";
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

export type CareerDecisionKind =
  | "stay"
  | "reach"
  | "fit"
  | "safe"
  | "number2"
  | "retire"
  | "sabbatical";

/** Option shown at a mid-career contract checkpoint. */
export interface CareerSeatOffer {
  /** Stable id for save/resume (`stay`, `retire`, `number2:Ferrari`, …). */
  id: string;
  team: string;
  tier: number;
  rank: number;
  label: string;
  blurb: string;
  kind: CareerDecisionKind;
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
  /** Rare winter crisis layered on this checkpoint, if any. */
  drama: DramaCrisis | null;
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

function seatOffer(
  partial: Omit<CareerSeatOffer, "id"> & { id?: string },
): CareerSeatOffer {
  const id =
    partial.id ??
    (partial.kind === "stay" ||
    partial.kind === "retire" ||
    partial.kind === "sabbatical"
      ? partial.kind
      : `${partial.kind}:${partial.team}`);
  return { ...partial, id };
}

/** Build seat + career options from the live grid. */
export function midCareerOffers(
  world: World,
  player: FieldDriver,
  winterMove: WinterMove | null = null,
  options: { seasonsDone: number; hadSabbatical: boolean } = {
    seasonsDone: 0,
    hadSabbatical: false,
  },
): CareerSeatOffer[] {
  const current = teamByName(world, player.team);
  const value = marketValue(player);
  const teams = [...world.teams].sort((a, b) => a.rank - b.rank);
  const used = new Set<string>([current.name]);

  const stay = seatOffer({
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
  });

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
    reach = seatOffer({
      team: reachTeam.name,
      tier: reachTeam.tier,
      rank: reachTeam.rank,
      kind: "reach",
      label: "Reach",
      blurb: `${reachTeam.name} is the upgrade — more car, less security.`,
    });
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
    ? seatOffer({
        team: moveTeam.name,
        tier: moveTeam.tier,
        rank: moveTeam.rank,
        kind: moveTeam.rank < current.rank ? "fit" : "safe",
        label: moveTeam.rank < current.rank ? "Move" : "Safe",
        blurb:
          moveTeam.rank < current.rank
            ? `${moveTeam.name} wants you — a sideways step up the order.`
            : `${moveTeam.name} is the safer landing if ${current.name} turns sour.`,
      })
    : null;

  // Top-team #2: a clear car upgrade in exchange for playing second fiddle.
  const number2Team =
    current.rank > 2
      ? (teams.find(
          (t) =>
            !used.has(t.name) &&
            t.rank <= 2 &&
            t.rank < current.rank &&
            value >= 76,
        ) ?? null)
      : null;
  const number2: CareerSeatOffer | null = number2Team
    ? seatOffer({
        team: number2Team.name,
        tier: number2Team.tier,
        rank: number2Team.rank,
        kind: "number2",
        label: "#2 seat",
        blurb: `${number2Team.name} will take you — as the clear number two. Better car, smaller voice.`,
      })
    : null;
  if (number2Team) used.add(number2Team.name);

  const seats = [stay];
  if (reach) seats.push(reach);
  if (move && (!number2 || move.team !== number2.team)) seats.push(move);
  if (number2) seats.push(number2);

  const careerMoves: CareerSeatOffer[] = [];
  if (options.seasonsDone >= 6 && !options.hadSabbatical && player.age <= 36) {
    careerMoves.push(
      seatOffer({
        team: current.name,
        tier: current.tier,
        rank: current.rank,
        kind: "sabbatical",
        label: "Sit out",
        blurb: `Skip ${world.year}. The grid moves on without you; you come back a year older looking for a seat.`,
      }),
    );
  }
  if (options.seasonsDone >= 6 || player.age >= 32) {
    careerMoves.push(
      seatOffer({
        team: current.name,
        tier: current.tier,
        rank: current.rank,
        kind: "retire",
        label: "Retire",
        blurb: `Hang it up after ${options.seasonsDone} seasons. The career ends here.`,
      }),
    );
  }

  return [
    ...seats.sort((a, b) => {
      if (a.kind === "stay") return -1;
      if (b.kind === "stay") return 1;
      return a.rank - b.rank;
    }),
    ...careerMoves,
  ];
}

function decisionSnapshot(session: CareerSession): DecisionSnapshot {
  const last = session.seasons[session.seasons.length - 1]!;
  const current = teamByName(session.world, session.player.team);
  const drama = maybeWinterDrama(last, session.seasons.length, session.rand);
  const offers = applyDramaToOffers(
    midCareerOffers(
      session.world,
      session.player,
      session.lastWinterMove,
      {
        seasonsDone: session.seasons.length,
        hadSabbatical: session.hadSabbatical,
      },
    ),
    drama,
    session.world,
    session.lastWinterMove,
    last,
  );

  return {
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
    drama,
    offers,
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
    pending: null,
    finished: null,
  };
}

function runOneSeason(session: CareerSession): boolean {
  const { world, player, rand, peakOverall, playerName } = session;

  const supportActive = session.supportRoleYears > 0;
  const rustActive = session.formRustYears > 0;

  // Number-two deals trade car for voice — dampen market pull for a bit.
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
  const age = player.age;
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

  const prior = session.seasons[session.seasons.length - 1];
  const pressure = incomingRivalPressure(
    prior?.rival,
    session.rivalName,
    player.team,
    world,
  );

  const result = simulateWorldSeason(world, rand, {
    supportRolePlayerId: supportActive ? player.id : null,
    formRustPlayerId: rustActive ? player.id : null,
    rivalHeat: pressure.heat,
    rivalDriverId: pressure.rivalDriver?.id ?? null,
    playerId: player.id,
  });
  const mine = result.standings.find((row) => row.isPlayer);
  const myTotals = result.totals.get(player.id);
  if (!mine || !myTotals) {
    session.endReason = "lostSeat";
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
    goal,
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
    supportRole: supportActive,
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

    if (isDecisionCheckpoint(session.seasons.length)) {
      const pending = decisionSnapshot(session);
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

/** Pick a plausible career fork without interrupting a one-shot run. */
function resolveAutopilotCheckpoint(
  session: CareerSession,
  pending: DecisionSnapshot,
): CareerResult | null {
  const stay = pending.offers.find((offer) => offer.kind === "stay")!;
  const number2 = pending.offers.find((offer) => offer.kind === "number2");
  const sabbatical = pending.offers.find((offer) => offer.kind === "sabbatical");
  const retire = pending.offers.find((offer) => offer.kind === "retire");
  const reach = pending.offers.find((offer) => offer.kind === "reach");
  const move = pending.offers.find((offer) => offer.kind === "fit");
  let offer = stay;

  // A better car can be worth the compromise, but it is never automatic.
  if (
    number2 &&
    number2.rank + 2 <= pending.currentRank &&
    session.rand() < 0.36
  ) {
    offer = number2;
  } else if (
    sabbatical &&
    pending.lastSeason.position >= 14 &&
    session.rand() < 0.24
  ) {
    offer = sabbatical;
  } else if (
    retire &&
    (pending.age >= 38 || (pending.seasonsDone >= 15 && session.rand() < 0.1))
  ) {
    offer = retire;
  } else if (
    reach &&
    reach.rank + 2 <= pending.currentRank &&
    pending.lastSeason.position <= 8 &&
    session.rand() < 0.45
  ) {
    offer = reach;
  } else if (
    move &&
    move.rank < pending.currentRank &&
    pending.lastSeason.position >= 10 &&
    session.rand() < 0.3
  ) {
    offer = move;
  }

  if (pending.drama) {
    session.dramaBeats.push(dramaScarLine(pending.drama, offer.label));
  }
  if (offer.kind === "retire") {
    session.endReason = "retired";
    session.walkedAway = true;
    session.ghost = projectGhostCareer(session);
    session.seatNote = `Retired after ${session.seasons.length} seasons`;
    return finalize(session);
  }
  if (offer.kind === "sabbatical") {
    applySabbatical(session);
    return null;
  }

  applySeatChoice(session, offer);
  return null;
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
  const offer =
    pending.offers.find((o) => o.id === choiceId) ??
    pending.offers.find((o) => o.team === choiceId) ??
    pending.offers.find((o) => o.kind === "stay") ??
    pending.offers[0]!;

  if (pending.drama) {
    session.dramaBeats.push(
      dramaScarLine(pending.drama, offer.label),
    );
  }

  if (offer.kind === "retire") {
    session.endReason = "retired";
    session.walkedAway = true;
    session.ghost = projectGhostCareer(session);
    session.pending = null;
    session.seatNote = `Retired after ${session.seasons.length} seasons`;
    return finalize(session);
  }

  if (offer.kind === "sabbatical") {
    applySabbatical(session);
    session.pending = null;
    return advanceCareer(session);
  }

  applySeatChoice(session, offer);
  session.pending = null;
  return advanceCareer(session);
}

/** Autopilot: run the entire career without pausing. */
export function runAutopilot(session: CareerSession): CareerResult {
  session.control = "autopilot";
  const result = advanceCareer(session);
  return result ?? finalize(session);
}
