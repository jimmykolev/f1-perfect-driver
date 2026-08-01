import {
  buildAlternateHistory,
  hasAlternateHistory,
  type AltHistoryReport,
} from "@/lib/altHistory";
import type { CareerResult, SeasonResult } from "@/types";

export type MuseumBeatKind =
  | "debut"
  | "fork"
  | "title"
  | "rival"
  | "transfer"
  | "rewrite"
  | "exit";

/** Coarse grouping for the filter row. */
export type MuseumBeatGroup = "titles" | "moves" | "moments";

/**
 * One row in the timeline. Kept deliberately terse: a tag, a headline, an
 * optional short fragment, and numbers. No paragraphs.
 */
export interface MuseumBeat {
  id: string;
  kind: MuseumBeatKind;
  group: MuseumBeatGroup;
  act: string;
  year?: number;
  yearTo?: number;
  tag: string;
  headline: string;
  note?: string;
  stats: string[];
  /** Structured team change for move beats. */
  move?: { from: string; to: string };
}

export interface MuseumAct {
  id: string;
  label: string;
  blurb: string;
  yearFrom: number | null;
  yearTo: number | null;
  stats: string[];
  beats: MuseumBeat[];
}

/** One season plotted on the championship-position chart. */
export interface MuseumArcPoint {
  year: number;
  age: number;
  position: number;
  champion: boolean;
  team: string;
  points: number;
  wins: number;
  podiums: number;
  poles: number;
  /** True when this season starts at a different team than the last one. */
  teamChange: boolean;
}

export interface CareerMuseumData {
  arc: MuseumArcPoint[];
  acts: MuseumAct[];
  headline: string;
}

const LEGACY_ACT = "legacy";

type LooseBeat = Omit<MuseumBeat, "act">;

function plural(n: number, word: string, suffix = "s") {
  return `${n} ${word}${n === 1 ? "" : suffix}`;
}

function chapterStats(rows: SeasonResult[]): string[] {
  const wins = rows.reduce((n, s) => n + s.wins, 0);
  const podiums = rows.reduce((n, s) => n + s.podiums, 0);
  const points = rows.reduce((n, s) => n + s.points, 0);
  const titles = rows.filter((s) => s.champion).length;
  const best = Math.min(...rows.map((s) => s.position));
  const teams = [...new Set(rows.map((s) => s.team))];

  return [
    plural(rows.length, "season"),
    titles ? plural(titles, "title") : `best P${best}`,
    `${wins}W`,
    `${podiums} pod`,
    `${points} pts`,
    teams.length === 1 ? teams[0]! : `${teams.length} teams`,
  ];
}

function buildArc(seasons: SeasonResult[]): MuseumArcPoint[] {
  return seasons.map((season, i) => ({
    year: season.year,
    age: season.age,
    position: season.position,
    champion: season.champion,
    team: season.team,
    points: season.points,
    wins: season.wins,
    podiums: season.podiums,
    poles: season.poles,
    teamChange: i > 0 && seasons[i - 1]!.team !== season.team,
  }));
}

function transferBeats(seasons: SeasonResult[]): LooseBeat[] {
  const beats: LooseBeat[] = [];
  for (let i = 1; i < seasons.length; i++) {
    const prev = seasons[i - 1]!;
    const season = seasons[i]!;
    if (prev.team === season.team) continue;
    beats.push({
      id: `transfer-${season.year}`,
      kind: "transfer",
      group: "moves",
      year: season.year,
      tag: "Move",
      headline: season.team,
      move: { from: prev.team, to: season.team },
      note: season.replacedDriver
        ? `Took ${season.replacedDriver}'s seat`
        : undefined,
      stats: [
        season.champion ? "Champion" : `P${season.position}`,
        `${season.wins}W`,
        `${season.points} pts`,
      ],
    });
  }
  return beats;
}

function titleBeats(seasons: SeasonResult[]): LooseBeat[] {
  return seasons
    .filter((s) => s.champion)
    .map((s) => ({
      id: `title-${s.year}`,
      kind: "title" as const,
      group: "titles" as const,
      year: s.year,
      tag: "Title",
      headline: s.team,
      stats: [
        `age ${s.age}`,
        `${s.wins}W`,
        `${s.podiums} pod`,
        `${s.poles} pole`,
        `${s.points} pts`,
      ],
    }));
}

function rewriteBeats(report: AltHistoryReport | null): LooseBeat[] {
  if (!report) return [];
  const beats: LooseBeat[] = [];

  const taken = report.years.filter((y) => y.status === "youTook");
  const flipped = report.years.filter((y) => y.status === "flipped");

  if (taken.length) {
    beats.push({
      id: "rewrite-taken",
      kind: "rewrite",
      group: "titles",
      tag: "Rewrite",
      headline:
        taken.length === 1
          ? `${taken[0]!.year} taken from ${taken[0]!.realChampion?.name ?? "its real winner"}`
          : `${taken.length} titles taken from their real winners`,
      note: taken.length > 1 ? taken.map((y) => y.year).join(", ") : undefined,
      stats: [`${report.titlesTaken} taken`, `${report.yearsCompared} yrs`],
    });
  } else if (flipped.length) {
    beats.push({
      id: "rewrite-flipped",
      kind: "rewrite",
      group: "titles",
      tag: "Rewrite",
      headline: `${plural(flipped.length, "title")} found a different winner`,
      stats: [`${report.titlesRewritten} rewritten`],
    });
  }

  const wiped = report.legends.filter(
    (l) => !l.isPlayer && l.lost.length && !l.simTitles.length,
  );
  if (wiped[0]) {
    const lostTitles = wiped.reduce((n, l) => n + l.lost.length, 0);
    beats.push({
      id: "rewrite-legends",
      kind: "rewrite",
      group: "titles",
      tag: "Erased",
      headline: wiped
        .slice(0, 3)
        .map((l) => l.name)
        .join(", "),
      note: wiped.length > 3 ? `and ${wiped.length - 3} more` : undefined,
      stats: [
        `${plural(wiped.length, "champion")} left empty`,
        `${plural(lostTitles, "title")} erased`,
      ],
    });
  }

  return beats;
}

/**
 * Career story for the results page: the season-by-season championship arc,
 * headline totals, and terse timeline rows grouped into acts.
 */
export function buildCareerMuseum(
  career: CareerResult,
  playerName: string,
): CareerMuseumData {
  const seasons = career.seasons;
  if (!seasons.length) {
    return { arc: [], acts: [], headline: "" };
  }

  const debut = seasons[0]!;
  const exit = seasons[seasons.length - 1]!;
  const report = hasAlternateHistory(career)
    ? buildAlternateHistory(career, playerName)
    : null;

  const actFor = (year: number | undefined): string => {
    if (year == null) return LEGACY_ACT;
    const hit = career.chapters.find(
      (c) => year >= c.yearFrom && year <= c.yearTo,
    );
    return hit?.id ?? career.chapters[0]?.id ?? LEGACY_ACT;
  };

  const loose: LooseBeat[] = [
    {
      id: "debut",
      kind: "debut",
      group: "moments",
      year: debut.year,
      tag: "Debut",
      headline: debut.team,
      note: debut.replacedDriver
        ? `Age ${career.debutAge}, in for ${debut.replacedDriver}`
        : `Age ${career.debutAge}`,
      stats: [`P${debut.position}`, `${debut.wins}W`, `${debut.points} pts`],
    },
  ];

  if (report?.fork) {
    loose.push({
      id: "fork",
      kind: "fork",
      group: "moments",
      year: report.fork.year,
      tag: "Fork",
      headline: report.fork.displaced
        ? `History loses ${report.fork.displaced}`
        : `The ${report.fork.team} timeline splits`,
      note: report.fork.line,
      stats: [],
    });
  }

  loose.push(...titleBeats(seasons), ...transferBeats(seasons));

  if (career.rival && career.rival.meetings >= 2) {
    const met = seasons.filter((s) => s.rival?.name === career.rival!.name);
    loose.push({
      id: "rival",
      kind: "rival",
      group: "moments",
      year: met[0]?.year,
      yearTo: met[met.length - 1]?.year,
      tag: "Rival",
      headline: career.rival.name,
      stats: [
        `${career.rival.wins}–${career.rival.losses} h2h`,
        plural(career.rival.meetings, "season"),
        career.rival.titlesWhileActive
          ? `${plural(career.rival.titlesWhileActive, "title")} contested`
          : "no titles between them",
      ],
    });
  }

  const legacy: LooseBeat[] = [
    ...rewriteBeats(report),
    {
      id: "exit",
      kind: "exit",
      group: "moments",
      year: exit.year,
      tag: career.endReason === "retired" ? "Retired" : "Dropped",
      headline: `${exit.team}, age ${career.finalAge}`,
      note:
        career.endReason === "retired"
          ? undefined
          : "No seat left on the grid",
      stats: [
        career.tierLabel,
        plural(seasons.length, "season"),
        `P${exit.position} final`,
      ],
    },
  ];

  const acts: MuseumAct[] = career.chapters.map((chapter) => ({
    id: chapter.id,
    label: chapter.label,
    blurb: chapter.blurb,
    yearFrom: chapter.yearFrom,
    yearTo: chapter.yearTo,
    stats: chapterStats(seasons.filter((s) => s.chapter === chapter.id)),
    beats: [],
  }));

  const byId = new Map(acts.map((act) => [act.id, act]));

  for (const beat of loose) {
    const act = byId.get(actFor(beat.year)) ?? acts[0];
    if (!act) continue;
    act.beats.push({ ...beat, act: act.id });
  }
  for (const act of acts) {
    act.beats.sort((a, b) => (a.year ?? 0) - (b.year ?? 0));
  }

  acts.push({
    id: LEGACY_ACT,
    label: "Legacy",
    blurb: "What the record books were left holding.",
    yearFrom: null,
    yearTo: null,
    stats: [
      career.tierLabel,
      plural(career.titles, "title"),
      `${career.wins}W`,
      `${career.points} pts`,
    ],
    beats: legacy.map((beat) => ({ ...beat, act: LEGACY_ACT })),
  });

  const span = `${debut.year}–${exit.year}`;
  const headline =
    career.titles > 0
      ? `${plural(career.titles, "title")} across ${span}`
      : career.wins > 0
        ? `${plural(career.wins, "win")} across ${span}`
        : `${plural(seasons.length, "season")} across ${span}`;

  return {
    arc: buildArc(seasons),
    acts,
    headline,
  };
}
