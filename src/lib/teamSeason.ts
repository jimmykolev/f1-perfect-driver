import {
  createWorld,
  driverAgeInYear,
  driversForTeam,
  beginSeasonProgress,
  simulateRound,
  type FieldDriver,
  type SeasonPolitics,
  type World,
} from "@/lib/fieldSim";
import { computeOverall, type Rng } from "@/lib/ratings";
import {
  type CarAttributes,
  type LockedCarAttribute,
} from "@/lib/teamCarPool";
import { finalizeTeamSeasonResult, type TeamGrade } from "@/lib/teamOutcome";
import type { TeamPrincipal } from "@/lib/teamPrincipalPool";
import type { DriverSeason, DnfReason } from "@/types";

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

/**
 * Perfect Team chase inject knobs.
 * Historical blueprints top out ~96 power / 0.92 reliability; the chase needs a
 * clearer #1 car so spun rosters can land a clean sweep ~1 in 250 seasons.
 */
export const CHASE_BALANCE = {
  /** Flat power added after blueprint mapping. */
  powerBonus: 11,
  /** Extra power scaled by drafted car quality (0–1). */
  powerScale: 5,
  maxPower: 114,
  /** Flat reliability added after blueprint mapping. */
  reliabilityBonus: 0.06,
  maxReliability: 0.985,
  /** Small attr bump for both chase seats. */
  driverAttrBoost: 2,
};

/** Inverse of deriveCarAttributes — map draft car ratings back to sim blueprints. */
export function carAttrsToBlueprint(attrs: CarAttributes): {
  power: number;
  reliability: number;
  resources: number;
} {
  const aeroU = clamp((attrs.aerodynamics - 55) / 44, 0, 1);
  const chasU = clamp((attrs.chassis - 55) / 44, 0, 1);
  const pwrU = clamp((attrs.powertrain - 55) / 44, 0, 1);
  const duraU = clamp((attrs.durability - 55) / 44, 0, 1);

  const powerU = clamp(pwrU * 0.5 + aeroU * 0.35 + chasU * 0.15, 0, 1);
  const reliU = clamp(duraU * 0.85 + chasU * 0.15, 0, 1);
  const resU = clamp(chasU * 0.65 + aeroU * 0.2 + pwrU * 0.15, 0, 1);

  return {
    power: Math.round(56 + powerU * 40),
    reliability: clamp(0.55 + reliU * 0.37, 0.55, 0.92),
    resources: clamp(0.4 + resU * 0.57, 0.4, 0.97),
  };
}

/** Blueprint mapping plus chase-only dominance so a strong draft can sweep. */
export function carAttrsToChaseInject(attrs: CarAttributes): {
  power: number;
  reliability: number;
  resources: number;
} {
  const base = carAttrsToBlueprint(attrs);
  const aeroU = clamp((attrs.aerodynamics - 55) / 44, 0, 1);
  const chasU = clamp((attrs.chassis - 55) / 44, 0, 1);
  const pwrU = clamp((attrs.powertrain - 55) / 44, 0, 1);
  const powerU = clamp(pwrU * 0.5 + aeroU * 0.35 + chasU * 0.15, 0, 1);

  return {
    power: Math.round(
      clamp(
        base.power +
          CHASE_BALANCE.powerBonus +
          powerU * CHASE_BALANCE.powerScale,
        56,
        CHASE_BALANCE.maxPower,
      ),
    ),
    reliability: clamp(
      base.reliability + CHASE_BALANCE.reliabilityBonus,
      0.55,
      CHASE_BALANCE.maxReliability,
    ),
    resources: base.resources,
  };
}

export function lockedCarToAttributes(
  locked: LockedCarAttribute[],
): CarAttributes {
  const attrs = {
    aerodynamics: 70,
    chassis: 70,
    powertrain: 70,
    durability: 70,
  } as CarAttributes;
  for (const item of locked) {
    attrs[item.key] = item.value;
  }
  return attrs;
}

function unit(rating: number) {
  return clamp((rating - 55) / 44, 0, 1);
}

/** Principal attrs nudge the injected constructor and season politics. */
export function applyPrincipalToInject(
  inject: { power: number; reliability: number; resources: number },
  principal: TeamPrincipal | null | undefined,
): { power: number; reliability: number; resources: number } {
  if (!principal) return inject;
  const lead = unit(principal.attributes.leadership);
  const strat = unit(principal.attributes.strategy);
  const dev = unit(principal.attributes.development);
  return {
    power: Math.round(
      clamp(inject.power + dev * 3.5 + lead * 1.2, 56, CHASE_BALANCE.maxPower),
    ),
    reliability: clamp(
      inject.reliability + strat * 0.045 + lead * 0.015,
      0.55,
      CHASE_BALANCE.maxReliability,
    ),
    resources: clamp(inject.resources + dev * 0.06 + strat * 0.02, 0.4, 0.99),
  };
}

export function principalPolitics(
  principal: TeamPrincipal | null | undefined,
  firstId: string,
  secondId: string,
): SeasonPolitics {
  if (!principal) return { playerId: firstId };
  const lead = unit(principal.attributes.leadership);
  const strat = unit(principal.attributes.strategy);
  // Strong leadership: clear #1. Weaker: second seat gets the preferential call.
  const supportRolePlayerId = lead < 0.45 ? firstId : null;
  void secondId;
  return {
    playerId: firstId,
    supportRolePlayerId,
    weekendBias: {
      playerDelta: strat * 1.4 + lead * 0.6,
      noiseMul: clamp(1.05 - strat * 0.22, 0.78, 1.05),
    },
  };
}

export interface TeamSeatResult {
  name: string;
  seat: "first" | "second";
  grid: number;
  finish: number | null;
  points: number;
  pole: boolean;
  dnf: boolean;
  dnfReason: DnfReason | null;
  win: boolean;
  podium: boolean;
  /** True when the reserve is filling this race seat. */
  reserve: boolean;
}

export interface TeamRaceRound {
  round: number;
  name: string;
  /** Constructor that won the race. */
  winnerTeam: string;
  winnerName: string;
  teamWon: boolean;
  first: TeamSeatResult;
  second: TeamSeatResult;
  /** One-line broadcast beat for the drip UI. */
  beat: string;
  winsSoFar: number;
}

export interface TeamSeasonChaseResult {
  year: number;
  teamName: string;
  calendarLength: number;
  races: TeamRaceRound[];
  teamWins: number;
  perfect: boolean;
  /** First round where the streak broke (1-based), or null if perfect. */
  brokenAtRound: number | null;
  grade: TeamGrade;
  gradeLabel: string;
  summary: string;
  reserveAppearances: number;
  principalName: string | null;
}

function rankTeamsLocal(teams: World["teams"]) {
  const order = [...teams].sort((a, b) => b.power - a.power);
  order.forEach((team, i) => {
    team.rank = i;
    team.tier =
      i <= 1 ? 1 : i <= 3 ? 2 : i <= 5 ? 3 : i <= 7 ? 4 : 5;
  });
}

function makeSeatDriver(
  season: DriverSeason,
  team: string,
  year: number,
  id: string,
  isPlayer: boolean,
): FieldDriver {
  const age = driverAgeInYear(season.name, year);
  const boost = CHASE_BALANCE.driverAttrBoost;
  const attributes = {
    qualifying: clamp(season.attributes.qualifying + boost, 40, 99),
    racePace: clamp(season.attributes.racePace + boost, 40, 99),
    raceCraft: clamp(season.attributes.raceCraft + boost, 40, 99),
    frontRunning: clamp(season.attributes.frontRunning + boost, 40, 99),
    scoring: clamp(season.attributes.scoring + boost, 40, 99),
    mentality: clamp(season.attributes.mentality + boost, 40, 99),
    reliability: clamp(season.attributes.reliability + boost, 40, 99),
    momentum: clamp(season.attributes.momentum + boost, 40, 99),
  };
  const overall = computeOverall(attributes);
  return {
    id,
    name: season.name,
    team,
    age,
    attributes,
    overall,
    potential: overall,
    reputation: clamp(0.4 + (overall - 60) / 70, 0.25, 0.95),
    seasonsInF1: Math.max(1, season.year - (year - 5)),
    seasonsAtTeam: 1,
    contractYears: 2,
    titles: 0,
    careerWins: season.wins,
    isPlayer,
    yearsWithoutSeat: 0,
    peak: { ...attributes },
  };
}

function cloneDriverOnto(
  target: FieldDriver,
  source: FieldDriver,
  keepId: string,
  isPlayer: boolean,
) {
  target.id = keepId;
  target.name = source.name;
  target.age = source.age;
  target.attributes = { ...source.attributes };
  target.overall = source.overall;
  target.potential = source.potential;
  target.reputation = source.reputation;
  target.seasonsInF1 = source.seasonsInF1;
  target.careerWins = source.careerWins;
  target.isPlayer = isPlayer;
  target.peak = source.peak ? { ...source.peak } : { ...source.attributes };
}

export interface BuildTeamWorldInput {
  teamName: string;
  car: CarAttributes;
  first: DriverSeason;
  second: DriverSeason;
  reserve?: DriverSeason | null;
  principal?: TeamPrincipal | null;
  year: number;
  rand: Rng;
}

export interface BuiltTeamWorld {
  world: World;
  playerTeam: string;
  firstId: string;
  secondId: string;
  reserveId: string | null;
  reserveDriver: FieldDriver | null;
  firstTemplate: FieldDriver;
  secondTemplate: FieldDriver;
}

/** Create a year grid and inject the Perfect Team constructor + race seats. */
export function buildTeamWorld(input: BuildTeamWorldInput): BuiltTeamWorld {
  const { year, rand } = input;
  const teamName = input.teamName.trim() || "Perfect Team";
  const world = createWorld(rand, year);
  const blueprint = applyPrincipalToInject(
    carAttrsToChaseInject(input.car),
    input.principal,
  );

  let slot = world.teams.find((t) => t.name === teamName);
  let oldName: string | null = null;
  if (!slot) {
    if (!world.teams.length) {
      throw new Error(`No constructor grid for ${year}`);
    }
    slot = world.teams.reduce((a, b) => (a.rank >= b.rank ? a : b));
    oldName = slot.name;
    slot.name = teamName;
  }

  slot.power = blueprint.power;
  slot.reliability = blueprint.reliability;
  slot.resources = blueprint.resources;
  rankTeamsLocal(world.teams);

  if (oldName) {
    world.drivers = world.drivers.filter((d) => d.team !== oldName);
  } else {
    world.drivers = world.drivers.filter((d) => d.team !== teamName);
  }

  const blockNames = new Set(
    [input.first.name, input.second.name, input.reserve?.name].filter(
      Boolean,
    ) as string[],
  );
  world.drivers = world.drivers.filter((d) => !blockNames.has(d.name));
  world.freeAgents = world.freeAgents.filter((d) => !blockNames.has(d.name));
  for (const name of blockNames) world.usedNames.add(name);

  const firstId = "team-first";
  const secondId = "team-second";
  const reserveId = input.reserve ? "team-reserve" : null;
  const first = makeSeatDriver(input.first, teamName, year, firstId, true);
  const second = makeSeatDriver(input.second, teamName, year, secondId, false);
  const reserveDriver = input.reserve
    ? makeSeatDriver(input.reserve, teamName, year, reserveId!, false)
    : null;

  world.drivers.push(first, second);

  const extras = driversForTeam(world, teamName).filter(
    (d) => d.id !== firstId && d.id !== secondId,
  );
  if (extras.length) {
    const drop = new Set(extras.map((d) => d.id));
    world.drivers = world.drivers.filter((d) => !drop.has(d.id));
  }

  world.playerActive = true;
  return {
    world,
    playerTeam: teamName,
    firstId,
    secondId,
    reserveId,
    reserveDriver,
    firstTemplate: { ...first, attributes: { ...first.attributes } },
    secondTemplate: { ...second, attributes: { ...second.attributes } },
  };
}

function seatResult(
  name: string,
  seat: "first" | "second",
  outcome: {
    grid: number;
    finish: number | null;
    points: number;
    pole: boolean;
    dnf: boolean;
    dnfReason: DnfReason | null;
    win: boolean;
    podium: boolean;
  },
  reserve: boolean,
): TeamSeatResult {
  return {
    name,
    seat,
    grid: outcome.grid,
    finish: outcome.finish,
    points: outcome.points,
    pole: outcome.pole,
    dnf: outcome.dnf,
    dnfReason: outcome.dnfReason,
    win: outcome.win,
    podium: outcome.podium,
    reserve,
  };
}

function emptyOutcome(): {
  grid: number;
  finish: number | null;
  points: number;
  pole: boolean;
  dnf: boolean;
  dnfReason: DnfReason | null;
  win: boolean;
  podium: boolean;
} {
  return {
    grid: 0,
    finish: null,
    points: 0,
    pole: false,
    dnf: true,
    dnfReason: "mechanical",
    win: false,
    podium: false,
  };
}

function finishTag(seat: TeamSeatResult) {
  if (seat.dnf) return "DNF";
  if (seat.finish == null) return "—";
  return `P${seat.finish}`;
}

function buildRaceBeat(input: {
  teamWon: boolean;
  winsSoFar: number;
  calendarLength: number;
  brokenAtRound: number | null;
  round: number;
  winnerName: string;
  winnerTeam: string;
  first: TeamSeatResult;
  second: TeamSeatResult;
  subNote: string | null;
}): string {
  const {
    teamWon,
    winsSoFar,
    calendarLength,
    brokenAtRound,
    round,
    winnerName,
    winnerTeam,
    first,
    second,
    subNote,
  } = input;

  if (subNote) return subNote;

  if (teamWon) {
    const oneTwo =
      first.finish != null &&
      second.finish != null &&
      ((first.finish === 1 && second.finish === 2) ||
        (first.finish === 2 && second.finish === 1));
    if (oneTwo) {
      return `1–2 finish. Sweep watch: ${winsSoFar}/${calendarLength}.`;
    }
    if (first.win || second.win) {
      const hero = first.win ? first.name : second.name;
      return `${hero} takes it. Streak ${winsSoFar}/${calendarLength}.`;
    }
    return `Your constructor wins. Streak ${winsSoFar}/${calendarLength}.`;
  }

  if (brokenAtRound === round) {
    return `Streak broken — ${winnerName} (${winnerTeam}). ${finishTag(first)} / ${finishTag(second)}.`;
  }

  if (first.dnf && second.dnf) {
    return `Double DNF. ${winnerName} steals the win for ${winnerTeam}.`;
  }
  if (first.dnf || second.dnf) {
    const out = first.dnf ? first : second;
    const reason = out.dnfReason === "collision" ? "crash" : "mechanical";
    return `${out.name} out (${reason}). ${winnerName} wins for ${winnerTeam}.`;
  }
  return `${winnerName} (${winnerTeam}) denies you. ${finishTag(first)} / ${finishTag(second)}.`;
}

/** Run a full season race-by-race; win = player team takes every race win. */
export function simulateTeamSeasonChase(
  input: BuildTeamWorldInput,
): TeamSeasonChaseResult {
  const built = buildTeamWorld(input);
  const {
    world,
    playerTeam,
    firstId,
    secondId,
    reserveDriver,
    firstTemplate,
    secondTemplate,
  } = built;

  const politics = principalPolitics(input.principal, firstId, secondId);
  const progress = beginSeasonProgress(world, input.rand, politics);

  // Leadership / strategy: lift both seats' season form.
  if (input.principal) {
    const lead = unit(input.principal.attributes.leadership);
    const strat = unit(input.principal.attributes.strategy);
    const bump = lead * 2.2 + strat * 1.4;
    for (const id of [firstId, secondId]) {
      progress.seasonForm.set(id, (progress.seasonForm.get(id) ?? 0) + bump);
    }
  }

  const teams = new Map(world.teams.map((t) => [t.name, t]));
  const calendar = world.rules.calendar;
  const races: TeamRaceRound[] = [];
  let brokenAtRound: number | null = null;
  let reserveAppearances = 0;

  let firstOnReserve = false;
  let secondOnReserve = false;
  let firstOutUntil = 0;
  let secondOutUntil = 0;
  const reserveReady = Boolean(reserveDriver);

  for (let round = 1; round <= calendar.length; round += 1) {
    const firstDriver = world.drivers.find((d) => d.id === firstId)!;
    const secondDriver = world.drivers.find((d) => d.id === secondId)!;

    // Restore regular seats when injury window ends.
    if (firstOnReserve && round > firstOutUntil && reserveDriver) {
      cloneDriverOnto(firstDriver, firstTemplate, firstId, true);
      firstOnReserve = false;
    }
    if (secondOnReserve && round > secondOutUntil && reserveDriver) {
      cloneDriverOnto(secondDriver, secondTemplate, secondId, false);
      secondOnReserve = false;
    }

    // Refresh weekend bias each round so strategy keeps mattering.
    if (politics.weekendBias) {
      progress.politics.weekendBias = { ...politics.weekendBias };
    }

    const outcomes = simulateRound(
      world.drivers,
      teams,
      progress.seasonForm,
      round,
      input.rand,
      world.rules,
      progress.politics,
    );

    // Consume one-round weekend bias like career Live Weekend.
    progress.politics.weekendBias = null;

    for (const d of world.drivers) {
      const outcome = outcomes.get(d.id);
      if (!outcome) continue;
      const bucket = progress.totals.get(d.id);
      if (!bucket) continue;
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
    progress.roundsCompleted = round;

    const winnerEntry = [...outcomes.entries()].find(([, o]) => o.win);
    const winnerDriver = winnerEntry
      ? world.drivers.find((d) => d.id === winnerEntry[0])
      : null;
    const winnerTeam = winnerDriver?.team ?? "";
    const teamWon = winnerTeam === playerTeam;

    const firstOut = outcomes.get(firstId) ?? emptyOutcome();
    const secondOut = outcomes.get(secondId) ?? emptyOutcome();

    const firstSeat = seatResult(
      firstDriver.name,
      "first",
      firstOut,
      firstOnReserve,
    );
    const secondSeat = seatResult(
      secondDriver.name,
      "second",
      secondOut,
      secondOnReserve,
    );

    if (firstOnReserve) reserveAppearances += 1;
    if (secondOnReserve) reserveAppearances += 1;

    if (!teamWon && brokenAtRound == null) {
      brokenAtRound = round;
    }

    const winsSoFar =
      races.filter((r) => r.teamWon).length + (teamWon ? 1 : 0);

    let subNote: string | null = null;

    // Collision DNF → reserve covers the next race (injury proxy).
    if (reserveReady && reserveDriver) {
      if (
        firstOut.dnf &&
        firstOut.dnfReason === "collision" &&
        !firstOnReserve &&
        round < calendar.length
      ) {
        firstOutUntil = round + 1;
        cloneDriverOnto(firstDriver, reserveDriver, firstId, true);
        firstOnReserve = true;
        subNote = `${reserveDriver.name} called up for the next race after ${firstTemplate.name}'s crash.`;
      } else if (
        secondOut.dnf &&
        secondOut.dnfReason === "collision" &&
        !secondOnReserve &&
        round < calendar.length
      ) {
        secondOutUntil = round + 1;
        cloneDriverOnto(secondDriver, reserveDriver, secondId, false);
        secondOnReserve = true;
        subNote = `${reserveDriver.name} called up for the next race after ${secondTemplate.name}'s crash.`;
      }
    }

    races.push({
      round,
      name: calendar[(round - 1) % calendar.length]!,
      winnerTeam,
      winnerName: winnerDriver?.name ?? "—",
      teamWon,
      first: firstSeat,
      second: secondSeat,
      winsSoFar,
      beat: buildRaceBeat({
        teamWon,
        winsSoFar,
        calendarLength: calendar.length,
        brokenAtRound,
        round,
        winnerName: winnerDriver?.name ?? "—",
        winnerTeam,
        first: firstSeat,
        second: secondSeat,
        subNote,
      }),
    });
  }

  const teamWins = races.filter((r) => r.teamWon).length;
  return finalizeTeamSeasonResult({
    year: world.year,
    teamName: playerTeam,
    calendarLength: calendar.length,
    races,
    teamWins,
    perfect: brokenAtRound == null && teamWins === calendar.length,
    brokenAtRound,
    reserveAppearances,
    principalName: input.principal?.name ?? null,
  });
}

export function isPerfectChase(result: TeamSeasonChaseResult): boolean {
  return result.perfect;
}
