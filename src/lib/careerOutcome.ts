import {
  ATTRIBUTE_KEYS,
  type Attributes,
  type CareerResult,
  type CareerTier,
  type SeasonResult,
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

type CareerBase = Omit<CareerResult, "tier" | "tierLabel" | "summary">;

/** Finer bands for player-facing copy — maps onto resolveTier, not a parallel ladder. */
export type AchievementBand =
  | "dynasty"
  | "legend"
  | "multiChampion"
  | "champion"
  | "prolificWinner"
  | "consistentWinner"
  | "modestWinner"
  | "giantKiller"
  | "podiumRegular"
  | "pointsFighter"
  | "journeyman";

export function achievementBand(
  tier: CareerTier,
  result: Pick<CareerBase, "titles" | "wins" | "podiums" | "seasons">,
): AchievementBand {
  const { titles, wins, podiums, seasons } = result;

  if (tier === "legend") {
    return titles >= 3 || wins >= 40 ? "dynasty" : "legend";
  }
  if (tier === "champion") {
    return titles >= 2 ? "multiChampion" : "champion";
  }
  if (tier === "raceWinner") {
    if (wins >= 15 || (wins >= 10 && podiums >= 50)) return "prolificWinner";
    if (wins >= 6 || podiums >= 30) return "consistentWinner";
    return "modestWinner";
  }
  if (tier === "podiumThreat") {
    return wins >= 1 ? "giantKiller" : "podiumRegular";
  }
  if (tier === "pointsRegular") return "pointsFighter";
  return seasons.length <= 3 ? "journeyman" : "journeyman";
}

function hashPick(seed: number, salt: string, count: number): number {
  let h = seed >>> 0;
  for (let i = 0; i < salt.length; i++) {
    h = Math.imul(h ^ salt.charCodeAt(i), 0x9e3779b9);
    h = (h << 13) | (h >>> 19);
  }
  return Math.abs(h) % count;
}

function seasonSpan(seasonCount: number): string {
  return `${seasonCount} season${seasonCount === 1 ? "" : "s"}`;
}

function bestTeam(seasons: SeasonResult[]): string | null {
  if (!seasons.length) return null;
  const byTeam = new Map<string, { wins: number; tier: number }>();
  for (const s of seasons) {
    const cur = byTeam.get(s.team) ?? { wins: 0, tier: 0 };
    byTeam.set(s.team, {
      wins: cur.wins + s.wins,
      tier: Math.max(cur.tier, s.teamTier),
    });
  }
  let best: string | null = null;
  let bestWins = -1;
  let bestTier = -1;
  for (const [team, stats] of byTeam) {
    if (
      stats.wins > bestWins ||
      (stats.wins === bestWins && stats.tier > bestTier)
    ) {
      best = team;
      bestWins = stats.wins;
      bestTier = stats.tier;
    }
  }
  return best;
}

function totalDnfs(seasons: SeasonResult[]): number {
  return seasons.reduce((sum, s) => sum + s.dnfs, 0);
}

function rivalAside(result: CareerBase): string {
  const rival = result.rival;
  if (!rival || rival.meetings < 4) return "";
  if (rival.theirTitles > rival.titlesWhileActive && rival.titleFights >= 1) {
    return ` Never quite got past ${rival.name} when it mattered.`;
  }
  if (rival.wins > rival.losses + 2) {
    return ` More often than not, ${rival.name} had the measure of them.`;
  }
  if (rival.losses > rival.wins + 2) {
    return ` Usually had ${rival.name}'s number when they shared a grid.`;
  }
  return "";
}

function exitLine(result: CareerBase, seed: number): string {
  const age = result.finalAge;
  const span = seasonSpan(result.seasons.length);
  const { pathMarks } = result;

  if (pathMarks.walkedAway) {
    const opts = [
      `Walked away on their own terms at ${age}.`,
      `Walked away at ${age} — no one pushed them out.`,
      `Walked away from the sport at ${age} by choice.`,
      `Walked away at ${age} while they still had leverage.`,
    ];
    return opts[hashPick(seed, "exit-walk", opts.length)]!;
  }

  if (result.endReason === "lostSeat") {
    if (pathMarks.hadSabbatical) {
      const opts = [
        `Came back from a year out, but no seat waited at ${age}.`,
        `Returned from sabbatical and still lost the fight for a drive at ${age}.`,
        `The grid had filled in while they sat out — out of options at ${age}.`,
      ];
      return opts[hashPick(seed, "exit-sabbatical-seat", opts.length)]!;
    }
    const opts = [
      `No contract on the table at ${age}.`,
      `Ran out of seats at ${age}.`,
      `The paddock moved on at ${age}.`,
      `Someone else got the call at ${age}.`,
      `Out of the sport at ${age} — not by choice.`,
    ];
    return opts[hashPick(seed, "exit-lost", opts.length)]!;
  }

  if (age <= 34) {
    const opts = [
      `Called it early at ${age}.`,
      `Hung it up at ${age} with time left on the clock.`,
      `Retired at ${age} — still quick, by their account.`,
      `Walked away from the grid at ${age}.`,
    ];
    return opts[hashPick(seed, "exit-early", opts.length)]!;
  }

  const opts = [
    `Hung up the helmet at ${age} after ${span}.`,
    `Retired at ${age} after ${span} on the grid.`,
    `Finished at ${age} — ${span} in the sport.`,
    `Last race at ${age}, ${span} in the rear-view.`,
  ];
  return opts[hashPick(seed, "exit-retire", opts.length)]!;
}

function pathAside(result: CareerBase): string {
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

type SummaryCtx = {
  span: string;
  seasonCount: number;
  titles: number;
  wins: number;
  podiums: number;
  points: number;
  poles: number;
  finalAge: number;
  bestTeam: string | null;
  dnfs: number;
  rivalAside: string;
  path: string;
  exit: string;
};

function buildCtx(
  result: CareerBase,
  path: string,
  exit: string,
  rival: string,
): SummaryCtx {
  return {
    span: seasonSpan(result.seasons.length),
    seasonCount: result.seasons.length,
    titles: result.titles,
    wins: result.wins,
    podiums: result.podiums,
    points: result.points,
    poles: result.poles,
    finalAge: result.finalAge,
    bestTeam: bestTeam(result.seasons),
    dnfs: totalDnfs(result.seasons),
    rivalAside: rival,
    path,
    exit,
  };
}

function dynastyLines(c: SummaryCtx): string[] {
  return [
    `${c.titles} world titles and ${c.wins} wins across ${c.span}. A dynasty, full stop.${c.rivalAside}${c.path} ${c.exit}`,
    `${c.titles} championships, ${c.wins} grand prix wins, ${c.span} at the sharp end — the sport will measure others against this.${c.path} ${c.exit}`,
    `Rewrote the record book: ${c.titles} titles and ${c.wins} wins in ${c.span}.${c.rivalAside}${c.path} ${c.exit}`,
  ];
}

function legendLines(c: SummaryCtx): string[] {
  return [
    `${c.wins} wins and ${c.titles} title${c.titles === 1 ? "" : "s"} across ${c.span} — an era, even if the word dynasty feels loaded.${c.path} ${c.exit}`,
    `One of the names that defined ${c.span} in Formula 1: ${c.titles} crown${c.titles === 1 ? "" : "s"}, ${c.wins} victories.${c.rivalAside}${c.path} ${c.exit}`,
    `${c.titles} world championship${c.titles === 1 ? "" : "s"} and ${c.wins} race wins. The paddock still talks about those years.${c.path} ${c.exit}`,
  ];
}

function multiChampionLines(c: SummaryCtx): string[] {
  return [
    `${c.titles} world titles and ${c.wins} wins in ${c.span}. That is champion pedigree.${c.rivalAside}${c.path} ${c.exit}`,
    `Back-to-back eras: ${c.titles} championships from ${c.wins} grand prix wins across ${c.span}.${c.path} ${c.exit}`,
    `Multiple titles, ${c.wins} wins, ${c.span} at the front — a career the sport remembers.${c.rivalAside}${c.path} ${c.exit}`,
  ];
}

function championLines(c: SummaryCtx): string[] {
  return [
    `They did it — world champion with ${c.wins} race win${c.wins === 1 ? "" : "s"} in ${c.span}.${c.rivalAside}${c.path} ${c.exit}`,
    `One world title, ${c.wins} grand prix wins, ${c.span} on the grid. Champion, no asterisk.${c.path} ${c.exit}`,
    `A world championship and ${c.wins} wins across ${c.span}. The crown makes the career.${c.rivalAside}${c.path} ${c.exit}`,
  ];
}

function prolificWinnerLines(c: SummaryCtx): string[] {
  const teamBit = c.bestTeam ? `, mostly from ${c.bestTeam}` : "";
  return [
    `${c.wins} grand prix wins and ${c.podiums} podiums in ${c.span}${teamBit} — a regular on Sunday, even without the title.${c.rivalAside}${c.path} ${c.exit}`,
    `A prolific winner: ${c.wins} victories and ${c.podiums} podiums across ${c.span}. The championship never quite landed.${c.path} ${c.exit}`,
    `${c.wins} wins from ${c.podiums} podiums over ${c.span}. Fast, often, and always in the conversation on race day.${c.rivalAside}${c.path} ${c.exit}`,
  ];
}

function consistentWinnerLines(c: SummaryCtx): string[] {
  const teamBit = c.bestTeam ? ` with ${c.bestTeam}` : "";
  return [
    `${c.wins} wins and ${c.podiums} podiums in ${c.span}${teamBit} — more Sunday regular than title hunter, but the results stack up.${c.rivalAside}${c.path} ${c.exit}`,
    `${c.podiums} podiums tell the story; ${c.wins} wins prove they could convert. ${c.span} at the sharp end without a crown.${c.path} ${c.exit}`,
    `A proper race winner — ${c.wins} grand prix wins, ${c.podiums} podiums, ${c.span} on the grid. Respectable by any measure.${c.rivalAside}${c.path} ${c.exit}`,
    `${c.wins} victories from ${c.span}, plus ${c.podiums} podiums. Never champion, always dangerous when the car was there.${c.path} ${c.exit}`,
  ];
}

function modestWinnerLines(c: SummaryCtx): string[] {
  return [
    `${c.wins} grand prix win${c.wins === 1 ? "" : "s"} in ${c.span} — proof they belonged on Sunday, even if the big prizes stayed out of reach.${c.rivalAside}${c.path} ${c.exit}`,
    `A handful of wins (${c.wins}) across ${c.span}. Giant-killer weekends, not a dynasty — and that is the honest read.${c.path} ${c.exit}`,
    `${c.wins} race win${c.wins === 1 ? "" : "s"} and ${c.podiums} podiums over ${c.span}. Occasional glory, long stretches of graft.${c.rivalAside}${c.path} ${c.exit}`,
    `Got on the top step ${c.wins} time${c.wins === 1 ? "" : "s"} in ${c.span}. Enough to say they won in Formula 1 — not enough to rewrite history.${c.path} ${c.exit}`,
  ];
}

function giantKillerLines(c: SummaryCtx): string[] {
  return [
    `${c.wins} win${c.wins === 1 ? "" : "s"} and ${c.podiums} podiums in ${c.span}. Dangerous on the right weekend, never a title threat.${c.rivalAside}${c.path} ${c.exit}`,
    `One (${c.wins}) grand prix win${c.wins === 1 ? "" : "s"} from ${c.podiums} podiums — the kind of career that lives on in highlight reels.${c.path} ${c.exit}`,
    `${c.wins} victory${c.wins === 1 ? "" : "ies"} in ${c.span}, ${c.podiums} podiums besides. Flashes of brilliance, no sustained charge at the crown.${c.rivalAside}${c.path} ${c.exit}`,
    `Snatched ${c.wins} win${c.wins === 1 ? "" : "s"} when the stars aligned — ${c.podiums} podiums overall in ${c.span}.${c.path} ${c.exit}`,
  ];
}

function podiumRegularLines(c: SummaryCtx): string[] {
  return [
    `${c.podiums} podiums in ${c.span} without a win. Always in the fight, never quite sealing Sunday.${c.rivalAside}${c.path} ${c.exit}`,
    `Podium regular, winless: ${c.podiums} trips to the rostrum across ${c.span}. So close, so often.${c.path} ${c.exit}`,
    `${c.podiums} podiums, zero wins — ${c.span} of near-misses and solid Sundays.${c.rivalAside}${c.path} ${c.exit}`,
    `Never won a grand prix, but ${c.podiums} podiums in ${c.span} kept the name in the mix.${c.path} ${c.exit}`,
  ];
}

function pointsFighterLines(c: SummaryCtx): string[] {
  const dnfBit =
    c.dnfs >= 15 ? " Plenty of DNFs along the way." : "";
  return [
    `${c.points} career points across ${c.span}. Respectable. Forgettable. The midfield remembers.${c.dnfBit}${c.path} ${c.exit}`,
    `${c.span} scrapping for points — ${c.points} in total. A grid regular without the headline weekends.${c.path} ${c.exit}`,
    `Midfield lifer: ${c.points} points from ${c.span} in Formula 1.${c.rivalAside}${c.path} ${c.exit}`,
    `${c.points} points in ${c.span}. Did the job, rarely made the news.${c.path} ${c.exit}`,
  ];
}

function journeymanLines(c: SummaryCtx): string[] {
  return [
    `${c.span} in Formula 1 and the sport barely noticed.${c.path} ${c.exit}`,
    `A brief ${c.span} on the grid — ${c.points} points and not much else to hang on.${c.path} ${c.exit}`,
    `${c.seasonCount} season${c.seasonCount === 1 ? "" : "s"}, ${c.points} points. A cameo, not a career.${c.rivalAside}${c.path} ${c.exit}`,
    `Short spell in Formula 1: ${c.span}, ${c.wins} wins, ${c.podiums} podiums. Blink and you missed it.${c.path} ${c.exit}`,
  ];
}

function linesForBand(band: AchievementBand): (c: SummaryCtx) => string[] {
  switch (band) {
    case "dynasty":
      return dynastyLines;
    case "legend":
      return legendLines;
    case "multiChampion":
      return multiChampionLines;
    case "champion":
      return championLines;
    case "prolificWinner":
      return prolificWinnerLines;
    case "consistentWinner":
      return consistentWinnerLines;
    case "modestWinner":
      return modestWinnerLines;
    case "giantKiller":
      return giantKillerLines;
    case "podiumRegular":
      return podiumRegularLines;
    case "pointsFighter":
      return pointsFighterLines;
    default:
      return journeymanLines;
  }
}

export function tierSummary(
  tier: CareerTier,
  result: CareerBase,
): string {
  const path = pathAside(result);
  const exit = exitLine(result, result.seed);
  const rival = rivalAside(result);
  const band = achievementBand(tier, result);
  const ctx = buildCtx(result, path, exit, rival);
  const templates = linesForBand(band)(ctx);
  const idx = hashPick(
    result.seed,
    `${band}-${result.wins}-${result.podiums}-${result.titles}-${result.seasons.length}-${result.endReason}`,
    templates.length,
  );
  return templates[idx]!;
}

/**
 * Career tier gates — tuned against 100-career autopilot batch (Aug 2026).
 *
 * Targets: Legend ~5%, Race Winner ~28–32%, Points Regular + Nobody ~15–20%
 * (more Points Regular than Nobody). Champion share tracks title rate (~20%)
 * once Legend is reserved for true dynasties.
 */
export function resolveTier(stats: {
  titles: number;
  wins: number;
  podiums: number;
  points: number;
}): CareerTier {
  if (
    stats.titles >= 4 ||
    (stats.titles >= 3 && stats.wins >= 32) ||
    (stats.titles >= 2 && stats.wins >= 48) ||
    stats.wins >= 78
  ) {
    return "legend";
  }
  if (stats.titles >= 1) return "champion";
  if (stats.wins >= 6) return "raceWinner";
  if (stats.wins >= 2 || stats.podiums >= 10) return "podiumThreat";
  if (stats.points >= 35) return "pointsRegular";
  return "nobody";
}
