import { createWorld, marketValue, makePlayer, type PlayerSeed } from "@/lib/fieldSim";
import { LATEST_START_YEAR } from "@/lib/f1Meta";
import { emptyAttributes, mulberry32 } from "@/lib/ratings";
import { applyTraitBoosts, deriveTraits } from "@/lib/traits";
import type { LockedAttribute, SeatOffer } from "@/types";

function offerLabel(kind: SeatOffer["kind"]): string {
  if (kind === "reach") return "Reach";
  if (kind === "safe") return "Safe";
  return "Fit";
}

function offerBlurb(kind: SeatOffer["kind"], team: string): string {
  if (kind === "reach") {
    return `${team} is a stretch — more car, less patience.`;
  }
  if (kind === "safe") {
    return `${team} is the safer seat — room to learn, less spotlight.`;
  }
  return `${team} matches where the market thinks you belong.`;
}

function pickTeamNearRank(
  teams: ReturnType<typeof createWorld>["teams"],
  targetRank: number,
  minRank: number,
  maxRank: number,
  rand: () => number,
  used: Set<string>,
) {
  if (maxRank < minRank) return null;
  const candidates = teams.filter(
    (team) =>
      !used.has(team.name) &&
      team.rank >= minRank &&
      team.rank <= maxRank,
  );
  if (!candidates.length) return null;

  // Keep each label meaningful while allowing neighbouring teams to appear.
  // A team's chance falls gently for every place it sits from the target.
  const weighted = candidates.map((team) => ({
    team,
    weight: 1 / (1 + Math.abs(team.rank - targetRank)),
  }));
  const total = weighted.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = rand() * total;
  for (const entry of weighted) {
    roll -= entry.weight;
    if (roll <= 0) return entry.team;
  }
  return weighted[weighted.length - 1]!.team;
}

/** Three debut seat offers (reach / fit / safe) for the seat-choice phase. */
export function debutSeatOffers(
  locked: LockedAttribute[],
  seed: number,
  playerName: string,
  startYear = LATEST_START_YEAR,
): SeatOffer[] {
  const peak = emptyAttributes();
  for (const item of locked) peak[item.key] = item.value;
  const traits = deriveTraits(locked);
  const boosted = applyTraitBoosts(peak, traits);
  const rand = mulberry32(seed);
  const world = createWorld(rand, startYear);
  const age = 19 + Math.floor(rand() * 4);
  const seedPlayer: PlayerSeed = {
    name: playerName || "Driver",
    peak: boosted,
    age,
  };
  const player = makePlayer(seedPlayer);
  const value = marketValue(player);

  // Market fit as a fraction of the field, then mapped onto this year's ranks.
  let fitFraction: number;
  if (value >= 94) fitFraction = 0.15;
  else if (value >= 88) fitFraction = 0.25;
  else if (value >= 82) fitFraction = 0.35;
  else if (value >= 76) fitFraction = 0.45;
  else if (value >= 70) fitFraction = 0.6;
  else if (value >= 64) fitFraction = 0.75;
  else fitFraction = 0.85;

  const lastRank = world.teams.length - 1;
  const expectedFitRank = clampRank(
    Math.round(fitFraction * lastRank),
    1,
    Math.max(1, lastRank - 1),
  );

  const used = new Set<string>();
  const fit =
    pickTeamNearRank(
      world.teams,
      expectedFitRank,
      Math.max(1, expectedFitRank - 1),
      Math.min(Math.max(1, lastRank - 1), expectedFitRank + 1),
      rand,
      used,
    ) ?? world.teams.find((t) => t.rank === expectedFitRank)!;
  used.add(fit.name);

  const reach =
    pickTeamNearRank(
      world.teams,
      fit.rank - 2,
      0,
      Math.max(0, fit.rank - 1),
      rand,
      used,
    ) ??
    [...world.teams]
      .filter((t) => !used.has(t.name) && t.rank < fit.rank)
      .sort((a, b) => a.rank - b.rank)[0] ??
    [...world.teams].filter((t) => !used.has(t.name)).sort((a, b) => a.rank - b.rank)[0]!;
  used.add(reach.name);

  const safe =
    pickTeamNearRank(
      world.teams,
      fit.rank + 2,
      Math.min(lastRank, fit.rank + 1),
      lastRank,
      rand,
      used,
    ) ??
    [...world.teams]
      .filter((t) => !used.has(t.name) && t.rank > fit.rank)
      .sort((a, b) => a.rank - b.rank)[0] ??
    [...world.teams].filter((t) => !used.has(t.name)).sort((a, b) => b.rank - a.rank)[0]!;

  // Always present Reach / Fit / Safe in car-quality order.
  const ordered = [reach, fit, safe].sort((a, b) => a.rank - b.rank);
  const selections = [
    { team: ordered[0]!, kind: "reach" as const },
    { team: ordered[1]!, kind: "fit" as const },
    { team: ordered[2]!, kind: "safe" as const },
  ];

  return selections.map(({ team, kind }) => ({
    team: team.name,
    tier: team.tier,
    rank: team.rank,
    kind,
    label: offerLabel(kind),
    blurb: offerBlurb(kind, team.name),
  }));
}

function clampRank(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}
