/**
 * Contrast a simulated career against recorded F1 history (driverSeasons.json).
 * Produces structured rows so the UI can show a real-vs-yours diff rather than
 * a wall of prose. Only seasons still covered by the dataset are compared.
 */

import data from "@/data/driverSeasons.json";
import { LAST_COMPLETED_HISTORY_YEAR, LATEST_START_YEAR } from "@/lib/f1Meta";
import type {
  CareerResult,
  DriverDataFile,
  DriverSeason,
  SeasonResult,
} from "@/types";

const dataset = data as DriverDataFile;

/** What happened to a season's championship compared with history. */
export type YearStatus = "youTook" | "flipped" | "held";

export interface ChampionSnapshot {
  name: string;
  team: string;
  points: number;
  wins: number;
}

export interface SeatSnapshot {
  name: string;
  position: number;
  points: number;
}

export interface AltHistoryYear {
  year: number;
  status: YearStatus;
  /** Null for years the dataset does not cover. */
  realChampion: ChampionSnapshot | null;
  simChampion: ChampionSnapshot;
  playerTeam: string;
  playerPosition: number;
  playerPoints: number;
  playerWins: number;
  playerIsChampion: boolean;
  /** Who actually drove for the player's team that year. */
  realLineup: SeatSnapshot[];
  /** Who shared the garage with the player in this timeline. */
  simTeammate: SeatSnapshot | null;
  note: string;
}

export interface LegendImpact {
  name: string;
  isPlayer: boolean;
  /** Title years inside the career window. */
  realTitles: number[];
  simTitles: number[];
  lost: number[];
  kept: number[];
  gained: number[];
}

export interface AltHistoryFork {
  year: number;
  team: string;
  displaced: string | null;
  realLineup: SeatSnapshot[];
  line: string;
}

export interface AltHistoryReport {
  fromYear: number;
  toYear: number;
  yearsCompared: number;
  titlesRewritten: number;
  titlesTaken: number;
  headline: string;
  lede: string;
  fork: AltHistoryFork | null;
  years: AltHistoryYear[];
  legends: LegendImpact[];
  ledger: string[];
}

function seasonsForYear(year: number): DriverSeason[] {
  return dataset.seasons
    .filter((s) => s.year === year)
    .sort((a, b) => a.position - b.position || b.points - a.points);
}

function historicalChampion(year: number): DriverSeason | null {
  return seasonsForYear(year).find((s) => s.position === 1) ?? null;
}

function historicalTeam(year: number, team: string): SeatSnapshot[] {
  return seasonsForYear(year)
    .filter((s) => s.team === team)
    .map((s) => ({ name: s.name, position: s.position, points: s.points }));
}

function comparableSeasons(career: CareerResult): SeasonResult[] {
  // Stop before the live season — 2026 (etc.) has standings but no champion yet.
  return career.seasons.filter((s) => s.year <= LAST_COMPLETED_HISTORY_YEAR);
}

/** True when a career overlaps recorded history enough to tell a story. */
export function hasAlternateHistory(career: CareerResult): boolean {
  const seasons = comparableSeasons(career);
  if (!seasons.length) return false;
  // Pure current-grid careers (debut in the live year) have nothing settled to rewrite.
  return seasons[0]!.year < LATEST_START_YEAR;
}

function ordinal(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

function formatNameList(names: string[]): string {
  if (names.length === 0) return "nobody";
  if (names.length === 1) return names[0]!;
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

function formatYearList(years: number[]): string {
  if (years.length === 1) return `${years[0]}`;
  if (years.length === 2) return `${years[0]} and ${years[1]}`;
  return `${years.slice(0, -1).join(", ")}, and ${years[years.length - 1]}`;
}

function yearNote(row: Omit<AltHistoryYear, "note">): string {
  const { realChampion, simChampion, year } = row;

  if (!realChampion) {
    return `${year} sits outside the record books — nothing to compare.`;
  }

  if (row.status === "youTook") {
    return `History gives ${year} to ${realChampion.name} (${realChampion.wins} wins, ${realChampion.points} pts for ${realChampion.team}). You took it instead on ${row.playerPoints} points for ${row.playerTeam}.`;
  }

  if (row.status === "flipped") {
    return `${realChampion.name} should have been champion. In your timeline ${simChampion.name} took it on ${simChampion.points} points, and you finished ${ordinal(row.playerPosition)} for ${row.playerTeam}.`;
  }

  return `${realChampion.name} still won the title, exactly as history recorded it. You finished ${ordinal(row.playerPosition)} for ${row.playerTeam}.`;
}

function buildYears(seasons: SeasonResult[]): AltHistoryYear[] {
  return seasons.map((season) => {
    const realRow = historicalChampion(season.year);
    const realChampion: ChampionSnapshot | null = realRow
      ? {
          name: realRow.name,
          team: realRow.team,
          points: realRow.points,
          wins: realRow.wins,
        }
      : null;

    const simChampionTeam =
      season.standings.find((s) => s.name === season.championName)?.team ?? "";
    const simChampionWins =
      season.standings.find((s) => s.name === season.championName)?.wins ?? 0;

    const teammateRow = season.standings.find(
      (s) => s.team === season.team && !s.isPlayer,
    );

    const changed = realChampion != null && realChampion.name !== season.championName;
    const status: YearStatus = !changed
      ? "held"
      : season.champion
        ? "youTook"
        : "flipped";

    const partial: Omit<AltHistoryYear, "note"> = {
      year: season.year,
      status,
      realChampion,
      simChampion: {
        name: season.championName,
        team: simChampionTeam,
        points: season.championPoints,
        wins: simChampionWins,
      },
      playerTeam: season.team,
      playerPosition: season.position,
      playerPoints: season.points,
      playerWins: season.wins,
      playerIsChampion: season.champion,
      realLineup: historicalTeam(season.year, season.team),
      simTeammate: teammateRow
        ? {
            name: teammateRow.name,
            position: teammateRow.position,
            points: teammateRow.points,
          }
        : null,
    };

    return { ...partial, note: yearNote(partial) };
  });
}

/** Title counts per driver, historical vs simulated, inside the career window. */
function buildLegends(
  years: AltHistoryYear[],
  playerName: string,
): LegendImpact[] {
  const real = new Map<string, number[]>();
  const sim = new Map<string, number[]>();

  for (const row of years) {
    if (row.realChampion) {
      const list = real.get(row.realChampion.name) ?? [];
      list.push(row.year);
      real.set(row.realChampion.name, list);
    }
    const winner = row.playerIsChampion ? playerName : row.simChampion.name;
    const list = sim.get(winner) ?? [];
    list.push(row.year);
    sim.set(winner, list);
  }

  const names = new Set([...real.keys(), ...sim.keys()]);
  const impacts: LegendImpact[] = [];

  for (const name of names) {
    const realTitles = real.get(name) ?? [];
    const simTitles = sim.get(name) ?? [];
    const kept = realTitles.filter((y) => simTitles.includes(y));
    const lost = realTitles.filter((y) => !simTitles.includes(y));
    const gained = simTitles.filter((y) => !realTitles.includes(y));

    impacts.push({
      name,
      isPlayer: name === playerName,
      realTitles,
      simTitles,
      lost,
      kept,
      gained,
    });
  }

  return impacts.sort((a, b) => {
    if (a.isPlayer !== b.isPlayer) return a.isPlayer ? -1 : 1;
    const impactA = a.lost.length * 2 + a.gained.length;
    const impactB = b.lost.length * 2 + b.gained.length;
    return impactB - impactA || b.realTitles.length - a.realTitles.length;
  });
}

function buildFork(
  debut: SeasonResult,
  playerName: string,
): AltHistoryFork | null {
  const realLineup = historicalTeam(debut.year, debut.team);
  const realNames = realLineup.map((r) => r.name);
  const displaced =
    debut.replacedDriver && realNames.includes(debut.replacedDriver)
      ? debut.replacedDriver
      : (realNames.find((n) => n !== playerName) ?? null);

  if (!realLineup.length && !displaced) return null;

  const lineup = realLineup
    .map((r) => `${r.name} (P${r.position})`)
    .join(" and ");

  return {
    year: debut.year,
    team: debut.team,
    displaced,
    realLineup,
    line: displaced
      ? `You took ${displaced}'s seat at ${debut.team}. Historically that garage ran ${lineup || displaced}.`
      : `You joined ${debut.team}, where history ran ${lineup || "a different pairing"}.`,
  };
}

function buildLedger(args: {
  playerName: string;
  years: AltHistoryYear[];
  legends: LegendImpact[];
  careerTitles: number;
  careerWins: number;
  fromYear: number;
  toYear: number;
}): string[] {
  const { playerName, years, legends, careerTitles, careerWins, fromYear, toYear } =
    args;

  const flipped = years.filter((y) => y.status !== "held");
  const taken = years.filter((y) => y.status === "youTook");
  const held = years.filter((y) => y.status === "held");
  const wiped = legends.filter(
    (l) => !l.isPlayer && l.lost.length && !l.simTitles.length,
  );
  // Only drivers who were never champion in reality count as brand new ones.
  const firstTimers = legends.filter(
    (l) => !l.isPlayer && l.gained.length && !l.realTitles.length,
  );

  const lines: string[] = [];

  lines.push(
    `${years.length} of your seasons overlap recorded history (${fromYear}–${toYear}).`,
  );

  if (flipped.length) {
    lines.push(
      `${flipped.length} World Championship${flipped.length === 1 ? "" : "s"} changed hands: ${flipped.map((y) => y.year).join(", ")}.`,
    );
  } else {
    lines.push("Every championship in that window still found its real winner.");
  }

  if (taken.length) {
    lines.push(
      `You personally took ${taken.length} of them — ${formatYearList(taken.map((y) => y.year))}.`,
    );
  }

  if (held.length) {
    lines.push(
      `${held.length} season${held.length === 1 ? "" : "s"} refused to bend and kept ${held.length === 1 ? "its" : "their"} historical champion.`,
    );
  }

  if (wiped.length) {
    const titlesLost = wiped.reduce((n, l) => n + l.lost.length, 0);
    lines.push(
      `${formatNameList(wiped.slice(0, 4).map((l) => l.name))} finished the era with nothing, ${titlesLost} real title${titlesLost === 1 ? "" : "s"} between them erased.`,
    );
  }

  if (firstTimers.length) {
    lines.push(
      `${formatNameList(firstTimers.slice(0, 4).map((l) => l.name))} became world champion${firstTimers.length === 1 ? "" : "s"} here without ever managing it in reality.`,
    );
  }

  if (careerTitles > 0) {
    lines.push(
      `${playerName} retires with ${careerTitles} title${careerTitles === 1 ? "" : "s"} and ${careerWins} wins that exist only here.`,
    );
  } else if (careerWins > 0) {
    lines.push(
      `${playerName} never took a title, but ${careerWins} win${careerWins === 1 ? "" : "s"} still rearranged those podiums.`,
    );
  } else {
    lines.push(
      `${playerName} never won a race — yet simply occupying a seat was enough to move the championship.`,
    );
  }

  return lines;
}

export function buildAlternateHistory(
  career: CareerResult,
  playerName: string,
): AltHistoryReport | null {
  if (!hasAlternateHistory(career)) return null;

  const seasons = comparableSeasons(career);
  const fromYear = seasons[0]!.year;
  const toYear = seasons[seasons.length - 1]!.year;

  const years = buildYears(seasons);
  const legends = buildLegends(years, playerName);
  const fork = buildFork(seasons[0]!, playerName);

  const titlesRewritten = years.filter((y) => y.status !== "held").length;
  const titlesTaken = years.filter((y) => y.status === "youTook").length;
  const spanLabel = fromYear === toYear ? `${fromYear}` : `${fromYear}–${toYear}`;

  const wiped = legends
    .filter((l) => !l.isPlayer && l.lost.length && !l.simTitles.length)
    .map((l) => l.name);

  const headline =
    titlesTaken > 0
      ? `You rewrote ${titlesRewritten} championship${titlesRewritten === 1 ? "" : "s"}`
      : titlesRewritten > 0
        ? `${titlesRewritten} championship${titlesRewritten === 1 ? "" : "s"} rewritten`
        : `A different ${spanLabel}`;

  const lede =
    titlesRewritten > 0
      ? wiped.length
        ? `Across ${spanLabel}, ${titlesRewritten} title${titlesRewritten === 1 ? "" : "s"} went to someone other than the driver in the record books. ${formatNameList(wiped.slice(0, 3))} left the era with nothing.`
        : `Across ${spanLabel}, ${titlesRewritten} title${titlesRewritten === 1 ? "" : "s"} went to someone other than the driver in the record books.`
      : `You raced through ${spanLabel} without taking a championship off history — but the seats and careers around you still moved.`;

  return {
    fromYear,
    toYear,
    yearsCompared: years.length,
    titlesRewritten,
    titlesTaken,
    headline,
    lede,
    fork,
    years,
    legends,
    ledger: buildLedger({
      playerName,
      years,
      legends,
      careerTitles: career.titles,
      careerWins: career.wins,
      fromYear,
      toYear,
    }),
  };
}
