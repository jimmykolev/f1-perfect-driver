import {
  buildAlternateHistory,
  hasAlternateHistory,
  type AltHistoryReport,
} from "@/lib/altHistory";
import {
  exitStoryNote,
  sabbaticalGaps,
  seatNoteKind,
} from "@/lib/careerStory";
import type { CareerResult, SeasonResult } from "@/types";

export type MuseumBeatKind =
  | "debut"
  | "fork"
  | "title"
  | "rival"
  | "rivalryOrigin"
  | "rivalryResolution"
  | "transfer"
  | "role"
  | "sitout"
  | "ghost"
  | "crisis"
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

    const isNumber2 =
      season.supportRole || seatNoteKind(season.seatNote) === "number2";
    const replaced = season.replacedDriver
      ? `Took ${season.replacedDriver}'s seat`
      : undefined;

    beats.push({
      id: `transfer-${season.year}`,
      kind: isNumber2 ? "role" : "transfer",
      group: "moves",
      year: season.year,
      tag: isNumber2 ? "#2 seat" : "Move",
      headline: season.team,
      move: { from: prev.team, to: season.team },
      note: isNumber2
        ? replaced
          ? `Loyal lieutenant — ${replaced.toLowerCase()}`
          : "Loyal lieutenant — better car, smaller voice"
        : replaced,
      stats: [
        season.champion ? "Champion" : `P${season.position}`,
        `${season.wins}W`,
        `${season.points} pts`,
      ],
    });
  }
  return beats;
}

function roleSeasonBeats(seasons: SeasonResult[]): LooseBeat[] {
  const beats: LooseBeat[] = [];
  for (let i = 0; i < seasons.length; i++) {
    const season = seasons[i]!;
    if (!season.supportRole) continue;
    // Transfer beat already covers the signing year.
    if (i > 0 && seasons[i - 1]!.team !== season.team) continue;
    const teammate = season.standings.find(
      (row) => row.team === season.team && !row.isPlayer,
    );
    beats.push({
      id: `role-${season.year}`,
      kind: "role",
      group: "moments",
      year: season.year,
      tag: "Orders",
      headline: season.team,
      note: teammate
        ? teammate.position < season.position
          ? `${teammate.name} kept the lead seat — you played the lieutenant`
          : `Outscored ${teammate.name} despite the hierarchy`
        : "Playing second fiddle in a title car",
      stats: [
        `P${season.position}`,
        `${season.wins}W`,
        `${season.points} pts`,
      ],
    });
  }
  return beats;
}

function sitOutBeats(
  seasons: SeasonResult[],
  marks: CareerResult["pathMarks"],
): LooseBeat[] {
  const gaps = sabbaticalGaps(seasons);
  if (!gaps.length && marks.sabbaticalYear != null) {
    const returnSeason =
      seasons.find((s) => seatNoteKind(s.seatNote) === "return") ??
      seasons.find((s) => s.year > marks.sabbaticalYear!) ??
      null;
    if (returnSeason) {
      gaps.push({ year: marks.sabbaticalYear, returnSeason });
    }
  }

  return gaps.map(({ year, returnSeason }) => {
    const bits: string[] = [];
    if (marks.sabbaticalChampion && marks.sabbaticalYear === year) {
      bits.push(`${marks.sabbaticalChampion} took the title`);
    }
    if (marks.sabbaticalSeatTaker && marks.sabbaticalYear === year) {
      bits.push(`${marks.sabbaticalSeatTaker} filled your seat`);
    }
    if (!bits.length && seatNoteKind(returnSeason.seatNote) === "return") {
      bits.push(returnSeason.seatNote);
    }
    return {
      id: `sitout-${year}`,
      kind: "sitout" as const,
      group: "moments" as const,
      year,
      tag: "Sit out",
      headline: `Missed ${year}`,
      note:
        bits.join(" · ") ||
        `Returned with ${returnSeason.team} in ${returnSeason.year}`,
      stats: [`back ${returnSeason.year}`, returnSeason.team, "rust"],
    };
  });
}

function ghostBeat(career: CareerResult): LooseBeat | null {
  const ghost = career.pathMarks.ghost;
  if (!career.pathMarks.walkedAway || !ghost?.seasons.length) return null;
  const first = ghost.seasons[0]!;
  const last = ghost.seasons[ghost.seasons.length - 1]!;
  return {
    id: "ghost",
    kind: "ghost",
    group: "moments",
    year: first.year,
    yearTo: last.year,
    tag: "What if",
    headline: ghost.headline,
    note: ghost.seasons
      .map((s) =>
        s.champion
          ? `${s.year} title`
          : `${s.year} P${s.position}${s.wins ? ` ${s.wins}W` : ""}`,
      )
      .join(" · "),
    stats: [
      `${ghost.projectedTitles} titles`,
      `${ghost.projectedWins}W`,
      `age ${ghost.projectedFinalAge}`,
    ],
  };
}

function rivalryOriginBeat(
  seasons: SeasonResult[],
  rival: CareerResult["rival"],
): LooseBeat | null {
  if (!rival || rival.meetings < 2) return null;
  const origin = seasons.find((season) => season.rival?.name === rival.name);
  const note = origin?.rival;
  if (!origin || !note) return null;

  const spark =
    note.heat === "garage"
      ? `The other ${origin.team} seat became a fight.`
      : note.heat === "title"
        ? `A championship fight made the rivalry real.`
        : `You kept finding each other in the same fight.`;
  return {
    id: `rivalry-origin-${rival.name}`,
    kind: "rivalryOrigin",
    group: "moments",
    year: origin.year,
    tag: "Rival born",
    headline: rival.name,
    note: `${spark} ${note.beatThem ? "You drew first blood." : `${rival.name} struck first.`}`,
    stats: [
      `P${note.yourPosition} vs P${note.theirPosition}`,
      origin.team,
      note.heat === "garage"
        ? "same garage"
        : note.heat === "title"
          ? "title heat"
          : "wheel heat",
    ],
  };
}

/**
 * Close the chief rivalry with either the title swing that decided it or the
 * final championship score. This deliberately reads season notes rather than
 * adding another persisted rivalry field.
 */
function rivalryResolutionBeat(
  seasons: SeasonResult[],
  rival: CareerResult["rival"],
): LooseBeat | null {
  if (!rival || rival.meetings < 2) return null;
  const meetings = seasons.filter((season) => season.rival?.name === rival.name);
  const finalMeeting = meetings[meetings.length - 1];
  if (!finalMeeting?.rival) return null;

  const titleStolen = meetings.find(
    (season) =>
      season.standings.some(
        (row) => row.name === rival.name && row.position === 1,
      ) &&
      meetings.some(
        (earlier) => earlier.year < season.year && earlier.champion,
      ),
  );
  if (titleStolen) {
    const previousCrown = meetings
      .filter((season) => season.year < titleStolen.year && season.champion)
      .at(-1);
    return {
      id: `rivalry-resolution-${rival.name}`,
      kind: "rivalryResolution",
      group: "moments",
      year: titleStolen.year,
      tag: "Title stolen",
      headline: `${rival.name} took it back`,
      note: `After your ${previousCrown!.year} crown, ${rival.name} won ${titleStolen.year}.`,
      stats: [
        `${rival.wins}–${rival.losses} h2h`,
        `${titleStolen.year} WDC`,
        "title swing",
      ],
    };
  }

  const final = finalMeeting.rival;
  const result =
    rival.wins === rival.losses
      ? `The score stayed level at ${rival.wins}–${rival.losses}.`
      : rival.wins > rival.losses
        ? `You closed the rivalry ${rival.wins}–${rival.losses} ahead.`
        : `${rival.name} closed the rivalry ${rival.losses}–${rival.wins} ahead.`;
  return {
    id: `rivalry-resolution-${rival.name}`,
    kind: "rivalryResolution",
    group: "moments",
    year: finalMeeting.year,
    tag: "Final score",
    headline: rival.name,
    note: `${result} Final meeting: P${final.yourPosition} vs P${final.theirPosition}.`,
    stats: [
      `${rival.wins}–${rival.losses} h2h`,
      plural(rival.meetings, "season"),
      "final meeting",
    ],
  };
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

  loose.push(
    ...titleBeats(seasons),
    ...transferBeats(seasons),
    ...roleSeasonBeats(seasons),
    ...sitOutBeats(seasons, career.pathMarks),
  );

  const rivalList =
    career.rivals?.length
      ? career.rivals
      : career.rival
        ? [career.rival]
        : [];
  const origin = rivalryOriginBeat(seasons, rivalList[0] ?? null);
  if (origin) loose.push(origin);
  const resolution = rivalryResolutionBeat(seasons, rivalList[0] ?? null);
  if (resolution) loose.push(resolution);
  for (const rival of rivalList.filter((r) => r.meetings >= 2).slice(0, 3)) {
    const tag =
      rival.heat === "garage"
        ? "Garage"
        : rival.heat === "title"
          ? "Title fight"
          : rival.heat === "wheel"
            ? "Duel"
            : "Rival";
    loose.push({
      id: `rival-${rival.name}`,
      kind: "rival",
      group: "moments",
      year: rival.yearFrom,
      yearTo: rival.yearTo,
      tag,
      headline: rival.name,
      note: rival.blurb,
      stats: [
        `${rival.wins}–${rival.losses} h2h`,
        plural(rival.meetings, "season"),
        rival.teammateSeasons
          ? `${plural(rival.teammateSeasons, "season")} as teammates`
          : rival.titleFights
            ? `${plural(rival.titleFights, "title fight")}`
            : rival.teams[0] ?? "grid",
      ],
    });
  }

  const exitTag =
    career.endReason === "lostSeat"
      ? "Dropped"
      : career.pathMarks.walkedAway
        ? "Walked away"
        : "Retired";

  const ghost = ghostBeat(career);
  const dramaBeats: LooseBeat[] = (career.pathMarks.dramaBeats ?? [])
    .slice(0, 3)
    .map((line, i) => ({
      id: `drama-${i}`,
      kind: "crisis" as const,
      group: "moments" as const,
      tag: "Crisis",
      headline: line.split(" — ")[0] ?? line,
      note: line.includes(" — ")
        ? line.split(" — ").slice(1).join(" — ")
        : undefined,
      stats: [],
    }));
  const legacy: LooseBeat[] = [
    ...rewriteBeats(report),
    ...dramaBeats,
    ...(ghost ? [ghost] : []),
    {
      id: "exit",
      kind: "exit",
      group: "moments",
      year: exit.year,
      tag: exitTag,
      headline: `${exit.team}, age ${career.finalAge}`,
      note: exitStoryNote(career),
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

function firstByKind(
  beats: MuseumBeat[],
  kind: MuseumBeatKind,
): MuseumBeat | undefined {
  return beats
    .filter((b) => b.kind === kind)
    .sort((a, b) => (a.year ?? Infinity) - (b.year ?? Infinity))[0];
}

function chronologically(beats: MuseumBeat[]): MuseumBeat[] {
  return [...beats].sort(
    (a, b) => (a.year ?? Infinity) - (b.year ?? Infinity),
  );
}

/**
 * Pick a short default timeline: one beat per narrative slot, capped and
 * sorted chronologically. Used for the Highlights filter.
 */
export function selectHighlightBeats(
  acts: MuseumAct[],
  limit = 6,
): MuseumBeat[] {
  const all = acts.flatMap((act) => act.beats);
  const used = new Set<string>();

  const slot = (
    beat: MuseumBeat | undefined,
  ): MuseumBeat | undefined => {
    if (!beat || used.has(beat.id)) return undefined;
    used.add(beat.id);
    return beat;
  };

  const slots: (MuseumBeat | undefined)[] = [
    slot(firstByKind(all, "title")),
    slot(firstByKind(all, "rivalryOrigin") ?? firstByKind(all, "rival")),
    slot(firstByKind(all, "rivalryResolution") ?? firstByKind(all, "crisis")),
    slot(firstByKind(all, "sitout") ?? firstByKind(all, "role")),
    slot(firstByKind(all, "transfer")),
    slot(firstByKind(all, "ghost") ?? firstByKind(all, "rewrite")),
    slot(firstByKind(all, "exit")),
  ];

  let picked = slots.filter((beat): beat is MuseumBeat => beat != null);
  const protectedKinds = new Set<MuseumBeatKind>(["title", "exit"]);

  while (picked.length > limit) {
    const dropIndex = picked.findLastIndex(
      (beat) => !protectedKinds.has(beat.kind),
    );
    if (dropIndex === -1) break;
    picked.splice(dropIndex, 1);
  }

  const take = (beat: MuseumBeat | undefined) => {
    if (!beat || used.has(beat.id) || picked.length >= limit) return;
    used.add(beat.id);
    picked.push(beat);
  };

  for (const beat of chronologically(all)) {
    if (picked.length >= limit) break;
    if (beat.kind === "debut") take(beat);
  }
  for (const beat of chronologically(all)) {
    if (picked.length >= limit) break;
    if (beat.kind === "title") take(beat);
  }
  for (const beat of chronologically(all)) {
    if (picked.length >= limit) break;
    if (beat.kind === "crisis" || beat.kind === "transfer") take(beat);
  }

  return chronologically(picked.slice(0, limit));
}
