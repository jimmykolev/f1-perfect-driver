import {
  ATTRIBUTE_KEYS,
  type Attributes,
  type CareerResult,
  type CareerTier,
} from "@/types";
import { computeOverall } from "@/lib/ratings";

export function archetypeFrom(attrs: Attributes): string {
  const ranked = ATTRIBUTE_KEYS.map((k) => ({
    k,
    v: attrs[k],
  })).sort((a, b) => b.v - a.v);

  const top = ranked[0]?.k;
  const second = ranked[1]?.k;
  const overall = computeOverall(attrs);

  if (overall >= 92 && attrs.raceCraft >= 90 && attrs.qualifying >= 88) {
    return "All-Time Great";
  }
  if (top === "qualifying" && second === "racePace") return "Qualifying Demon";
  if (
    top === "raceCraft" ||
    (attrs.raceCraft >= 88 && attrs.frontRunning >= 85)
  ) {
    return "Sunday Specialist";
  }
  if (top === "reliability" && attrs.scoring >= 75) return "Points Machine";
  if (top === "mentality") return "Ice Cool Operator";
  if (top === "momentum") return "Late Bloomer";
  if (top === "frontRunning") return "Podium Predator";
  if (attrs.qualifying >= 85 && attrs.raceCraft < 70) return "Saturday Hero";
  if (overall >= 85) return "Title Contender";
  if (overall >= 75) return "Solid Midfielder";
  if (overall >= 65) return "Grid Regular";
  return "Pay Driver Energy";
}

export function tierLabel(tier: CareerTier): string {
  switch (tier) {
    case "legend":
      return "Legend";
    case "champion":
      return "World Champion";
    case "raceWinner":
      return "Race Winner";
    case "podiumThreat":
      return "Podium Threat";
    case "pointsRegular":
      return "Points Regular";
    default:
      return "Nobody";
  }
}

function exitLine(
  result: Omit<CareerResult, "tier" | "tierLabel" | "summary">,
): string {
  if (result.endReason === "lostSeat") {
    return `The seat went to someone else at ${result.finalAge}.`;
  }
  if (result.pathMarks.walkedAway) {
    return `Walked away on their own terms at ${result.finalAge}.`;
  }
  if (result.finalAge <= 34) {
    return `Called it early at ${result.finalAge}.`;
  }
  return `Hung up the helmet at ${result.finalAge}.`;
}

function pathAside(
  result: Omit<CareerResult, "tier" | "tierLabel" | "summary">,
): string {
  const bits: string[] = [];
  if (result.pathMarks.number2Teams.length === 1) {
    bits.push(
      `served as loyal lieutenant at ${result.pathMarks.number2Teams[0]}`,
    );
  } else if (result.pathMarks.number2Teams.length > 1) {
    bits.push("spent years as a number two");
  }
  if (result.pathMarks.hadSabbatical) {
    bits.push(
      result.pathMarks.sabbaticalChampion
        ? `sat out while ${result.pathMarks.sabbaticalChampion} took a title`
        : "sat a year out and came back rusty",
    );
  }
  if (!bits.length) return "";
  return ` Along the way, ${bits.join(" and ")}.`;
}

export function tierSummary(
  tier: CareerTier,
  result: Omit<CareerResult, "tier" | "tierLabel" | "summary">,
): string {
  const span = `${result.seasons.length} season${result.seasons.length === 1 ? "" : "s"}`;
  const exit = exitLine(result);
  const path = pathAside(result);

  switch (tier) {
    case "legend":
      return `A career for the ages — ${result.titles} titles and ${result.wins} wins across ${span}.${path} ${exit}`;
    case "champion":
      return `They did it. ${result.titles} world championship${result.titles > 1 ? "s" : ""} and ${result.wins} race wins in ${span}.${path} ${exit}`;
    case "raceWinner":
      return `${result.wins} grand prix wins and ${result.podiums} podiums over ${span} — a proper winner, if not quite a dynasty.${path} ${exit}`;
    case "podiumThreat":
      return result.wins > 0
        ? `${result.wins} win${result.wins > 1 ? "s" : ""} and ${result.podiums} podiums in ${span}. Dangerous on the right weekend, never a title threat.${path} ${exit}`
        : `${result.podiums} podiums in ${span} without a win. Always in the fight, never quite sealing Sunday.${path} ${exit}`;
    case "pointsRegular":
      return `${result.points} career points across ${span}. Respectable. Forgettable. The midfield remembers.${path} ${exit}`;
    default:
      return `${span} in Formula 1 and the sport barely noticed.${path} ${exit}`;
  }
}

export function resolveTier(stats: {
  titles: number;
  wins: number;
  podiums: number;
  points: number;
}): CareerTier {
  if (
    stats.titles >= 3 ||
    (stats.titles >= 2 && stats.wins >= 20) ||
    stats.wins >= 55
  ) {
    return "legend";
  }
  if (stats.titles >= 1) return "champion";
  if (stats.wins >= 3) return "raceWinner";
  if (stats.wins >= 1 || stats.podiums >= 4) return "podiumThreat";
  if (stats.points >= 90) return "pointsRegular";
  return "nobody";
}
