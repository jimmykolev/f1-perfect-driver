/** Mid-career seat offer generation — shared by session runner and decisions engine. */

import {
  marketValue,
  teamByName,
  type FieldDriver,
  type World,
} from "@/lib/fieldSim";

export type CareerDecisionKind =
  | "stay"
  | "reach"
  | "fit"
  | "safe"
  | "number2"
  | "retire"
  | "sabbatical";

/** Option shown at a contract checkpoint. */
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

function carPhrase(rank: number, teams: number): string {
  if (rank === 0) return "the fastest car on the grid";
  if (rank <= 2) return "a front-running car";
  if (rank <= Math.floor(teams / 2)) return "a solid midfield car";
  if (rank <= teams - 3) return "a slow car";
  return "one of the worst cars on the grid";
}

/** Short grid-standing chip for seat cards (rank is 0-indexed power order). */
export function teamStandingLabel(rank: number, teams: number): string {
  if (rank === 0) return "Frontrunner";
  if (rank <= 2) return "Front-running";
  if (rank <= Math.floor(teams / 2)) return "Midfield";
  if (rank <= teams - 3) return "Backmarker";
  return "Tail-end";
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
  winterMove: { from: string; to: string; promoted: boolean } | null = null,
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
    label: winterMove ? "Accept their offer" : "Re-sign here",
    blurb: winterMove
      ? winterMove.promoted
        ? `${current.name} came for you after ${winterMove.from} — ${carPhrase(current.rank, teams.length)}.`
        : `${winterMove.from} moved on without you. ${current.name} is ${carPhrase(current.rank, teams.length)}.`
      : `Re-sign at ${current.name} — ${carPhrase(current.rank, teams.length)}.`,
  });

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
      label: "Step up the grid",
      blurb: `${reachTeam.name} — ${carPhrase(reachTeam.rank, teams.length)}. Faster car, shakier contract.`,
    });
  }

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
        label: moveTeam.rank < current.rank ? "Switch teams" : "Take the safer seat",
        blurb:
          moveTeam.rank < current.rank
            ? `${moveTeam.name} — ${carPhrase(moveTeam.rank, teams.length)}. A step up without the top-team gamble.`
            : `${moveTeam.name} — ${carPhrase(moveTeam.rank, teams.length)}. The safer landing if ${current.name} sours.`,
      })
    : null;

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
        label: "Sign as number two",
        blurb: `${number2Team.name} — ${carPhrase(number2Team.rank, teams.length)}, but you play support to their lead driver.`,
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

export { carPhrase };
