import type {
  CareerChapter,
  CareerChapterId,
  RivalCareer,
  RivalHeat,
  RivalSeasonNote,
  SeasonGoal,
  SeasonGoalKind,
  SeasonResult,
  StandingEntry,
} from "@/types";
import type { Rng } from "@/lib/ratings";

export function pickSeasonGoal(
  ctx: {
    seasonIndex: number;
    teamTier: number;
    peakOverall: number;
    teammateName: string | null;
    /** Sticky rival from a prior season, if any. */
    rivalName?: string | null;
    /** Contracted as the clear number two — goals stay political. */
    supportRole?: boolean;
  },
  rand: Rng,
): SeasonGoal {
  const options: { kind: SeasonGoalKind; label: string; detail: string }[] = [];

  if (ctx.supportRole && ctx.teammateName) {
    options.push({
      kind: "beatTeammate",
      label: `Outscore ${ctx.teammateName}`,
      detail: "Finish ahead of the lead driver despite the team orders.",
    });
    options.push({
      kind: "podium",
      label: "Prove you belong",
      detail: "Take a podium without upsetting the garage hierarchy.",
    });
    options.push({
      kind: "scorePoints",
      label: "Loyal lieutenant",
      detail: "Score solidly while the number one hunts titles.",
    });
    const pick = options[Math.floor(rand() * options.length)] ?? options[0]!;
    return { ...pick, met: false };
  }

  if (ctx.seasonIndex === 0) {
    options.push({
      kind: "topTen",
      label: "Break into the top 10",
      detail: "Finish the championship inside the top 10.",
    });
    options.push({
      kind: "scorePoints",
      label: "Open the account",
      detail: "Score at least 10 championship points.",
    });
  }

  if (ctx.teammateName) {
    options.push({
      kind: "beatTeammate",
      label: `Beat ${ctx.teammateName}`,
      detail: "Finish ahead of your teammate in the standings.",
    });
  }

  if (ctx.rivalName) {
    options.push({
      kind: "beatRival",
      label: `Beat ${ctx.rivalName}`,
      detail: `Finish ahead of ${ctx.rivalName} in the championship.`,
    });
  }

  if (ctx.teamTier <= 2 || ctx.peakOverall >= 88) {
    options.push({
      kind: "podium",
      label: "Stand on the box",
      detail: "Take at least one podium this season.",
    });
    options.push({
      kind: "win",
      label: "Win a grand prix",
      detail: "Convert the car into a race win.",
    });
  } else if (ctx.teamTier >= 4) {
    options.push({
      kind: "survive",
      label: "Keep the seat alive",
      detail: "Finish ahead of P16 in the championship.",
    });
    options.push({
      kind: "scorePoints",
      label: "Make the car look decent",
      detail: "Score at least 15 points.",
    });
  } else {
    options.push({
      kind: "podium",
      label: "Steal a podium",
      detail: "One podium from a midfield seat.",
    });
    options.push({
      kind: "topTen",
      label: "Crack the top 10",
      detail: "Finish inside the top 10 in the championship.",
    });
  }

  const pick = options[Math.floor(rand() * options.length)] ?? options[0]!;
  return { ...pick, met: false };
}

export function evaluateSeasonGoal(
  goal: SeasonGoal,
  season: Pick<SeasonResult, "position" | "points" | "wins" | "podiums">,
  standings: StandingEntry[],
  playerName: string,
  rivalName?: string | null,
): SeasonGoal {
  let met = false;
  switch (goal.kind) {
    case "beatTeammate": {
      const you = standings.find((row) => row.isPlayer);
      const mate = standings.find(
        (row) =>
          !row.isPlayer &&
          row.team === you?.team &&
          row.name !== playerName,
      );
      met = Boolean(you && mate && you.position < mate.position);
      break;
    }
    case "beatRival": {
      const you = standings.find((row) => row.isPlayer);
      const rival = standings.find(
        (row) => row.name === rivalName || row.name === goal.label.replace(/^Beat /, ""),
      );
      met = Boolean(you && rival && you.position < rival.position);
      break;
    }
    case "scorePoints":
      met = season.points >= (goal.detail.includes("15") ? 15 : 10);
      break;
    case "podium":
      met = season.podiums >= 1;
      break;
    case "win":
      met = season.wins >= 1;
      break;
    case "topTen":
      met = season.position <= 10;
      break;
    case "survive":
      met = season.position <= 16;
      break;
  }
  return { ...goal, met };
}

export function rivalHeatFor(
  you: StandingEntry,
  rival: StandingEntry,
): RivalHeat {
  if (you.team === rival.team) return "garage";
  if (you.position <= 3 && rival.position <= 3) return "title";
  if (Math.abs(you.position - rival.position) <= 3) return "wheel";
  return "distant";
}

export function rivalNoteFromStandings(
  standings: StandingEntry[],
  rivalName: string | null,
): RivalSeasonNote | null {
  if (!rivalName) return null;
  const you = standings.find((row) => row.isPlayer);
  const rival = standings.find((row) => row.name === rivalName);
  if (!you || !rival) return null;
  return {
    name: rival.name,
    team: rival.team,
    theirPosition: rival.position,
    yourPosition: you.position,
    beatThem: you.position < rival.position,
    sameTeam: you.team === rival.team,
    pointsDelta: you.points - rival.points,
    winsDelta: you.wins - rival.wins,
    titleFight: you.position <= 3 && rival.position <= 3,
    heat: rivalHeatFor(you, rival),
  };
}

/** One-line flavour for the season log. */
export function rivalSeasonLine(note: RivalSeasonNote): string {
  const score = `P${note.yourPosition} vs P${note.theirPosition}`;
  const pts =
    note.pointsDelta === 0
      ? "level on points"
      : note.pointsDelta > 0
        ? `+${note.pointsDelta} pts`
        : `${note.pointsDelta} pts`;
  if (note.heat === "garage") {
    return note.beatThem
      ? `Garage war with ${note.name} — you won the seat ${score} (${pts}).`
      : `Garage war with ${note.name} — they had you ${score} (${pts}).`;
  }
  if (note.heat === "title") {
    return note.beatThem
      ? `Title scrap with ${note.name} — you finished ahead ${score}.`
      : `Title scrap with ${note.name} — they finished ahead ${score}.`;
  }
  if (note.heat === "wheel") {
    return note.beatThem
      ? `Wheel-to-wheel with ${note.name} — ${score}, ${pts}.`
      : `${note.name} edged you ${score} (${pts}).`;
  }
  return note.beatThem
    ? `Marked ${note.name} — still ahead ${score}.`
    : `Marked ${note.name} — they pulled clear ${score}.`;
}

export function chooseRival(
  standings: StandingEntry[],
  playerTeam: string,
  rand: Rng,
): string | null {
  const you = standings.find((row) => row.isPlayer);
  const others = standings.filter((row) => !row.isPlayer);
  if (!others.length) return null;

  const teammate = others.find((row) => row.team === playerTeam);
  // Garage wars fire often — but not always, or every teammate becomes destiny.
  if (teammate && rand() < 0.55) return teammate.name;

  if (you) {
    // Prefer someone in the same championship neighbourhood, weighted nearer.
    const near = others
      .map((row) => ({
        row,
        gap: Math.abs(row.position - you.position),
      }))
      .filter((entry) => entry.gap <= 4)
      .sort(
        (a, b) =>
          a.gap - b.gap || a.row.position - b.row.position,
      );
    if (near.length) {
      // Soft pick among the closest few.
      const pool = near.slice(0, Math.min(3, near.length));
      return pool[Math.floor(rand() * pool.length)]!.row.name;
    }
  }

  return others[0]?.name ?? null;
}

/**
 * Keep a sticky rival until they leave, drift too far, or a hotter foe appears.
 */
export function resolveSeasonRival(
  currentName: string | null,
  standings: StandingEntry[],
  playerTeam: string,
  distantStreak: number,
  rand: Rng,
): { name: string | null; distantStreak: number } {
  const you = standings.find((row) => row.isPlayer);
  const stillAround =
    currentName != null &&
    standings.some((row) => row.name === currentName && !row.isPlayer);

  if (!stillAround) {
    return {
      name: chooseRival(standings, playerTeam, rand),
      distantStreak: 0,
    };
  }

  const rival = standings.find((row) => row.name === currentName)!;
  const gap = you ? Math.abs(you.position - rival.position) : 99;
  const sameTeam = you?.team === rival.team;
  const nextDistant = sameTeam || gap <= 5 ? 0 : distantStreak + 1;

  // A closer threat can steal the spotlight after a quiet stretch.
  const challenger = chooseRival(standings, playerTeam, rand);
  const challengerRow = challenger
    ? standings.find((row) => row.name === challenger)
    : null;
  const challengerGap =
    you && challengerRow
      ? Math.abs(you.position - challengerRow.position)
      : 99;
  const hotter =
    challenger &&
    challenger !== currentName &&
    (challengerRow?.team === playerTeam || challengerGap + 1 < gap);

  if (hotter && nextDistant >= 2 && rand() < 0.55) {
    return { name: challenger, distantStreak: 0 };
  }
  if (nextDistant >= 3 && rand() < 0.4) {
    return {
      name: chooseRival(standings, playerTeam, rand),
      distantStreak: 0,
    };
  }

  return { name: currentName, distantStreak: nextDistant };
}

function aggregateRival(
  name: string,
  seasons: SeasonResult[],
): RivalCareer | null {
  const meetings = seasons.filter((s) => s.rival?.name === name);
  if (!meetings.length) return null;
  const notes = meetings.map((s) => s.rival!);
  const teammateSeasons = notes.filter((n) => n.sameTeam).length;
  const titleFights = notes.filter((n) => n.titleFight).length;
  const theirTitles = meetings.filter((s) =>
    s.standings.some((row) => row.name === name && row.position === 1),
  ).length;
  const teams = [...new Set(notes.map((n) => n.team))];
  const heatCounts: Record<RivalHeat, number> = {
    garage: 0,
    title: 0,
    wheel: 0,
    distant: 0,
  };
  for (const note of notes) heatCounts[note.heat]++;
  const heat = (
    Object.entries(heatCounts) as [RivalHeat, number][]
  ).sort((a, b) => b[1] - a[1])[0]![0];

  const wins = notes.filter((n) => n.beatThem).length;
  const losses = notes.length - wins;
  const titlesWhileActive = meetings.filter((s) => s.champion).length;
  const yearFrom = meetings[0]!.year;
  const yearTo = meetings[meetings.length - 1]!.year;

  return {
    name,
    meetings: notes.length,
    wins,
    losses,
    titlesWhileActive,
    theirTitles,
    teams,
    yearFrom,
    yearTo,
    teammateSeasons,
    titleFights,
    heat,
    blurb: rivalCareerBlurb({
      name,
      meetings: notes.length,
      wins,
      losses,
      titlesWhileActive,
      theirTitles,
      teams,
      yearFrom,
      yearTo,
      teammateSeasons,
      titleFights,
      heat,
      blurb: "",
    }),
  };
}

export function rivalCareerBlurb(rival: RivalCareer): string {
  const record = `${rival.wins}–${rival.losses}`;
  const span =
    rival.yearFrom === rival.yearTo
      ? `${rival.yearFrom}`
      : `${rival.yearFrom}–${rival.yearTo}`;
  if (rival.heat === "garage" || rival.teammateSeasons >= 2) {
    return `${rival.name} in the other garage — ${record} across ${rival.meetings} seasons (${span}).`;
  }
  if (rival.heat === "title" || rival.titleFights >= 2) {
    const titles = [
      rival.titlesWhileActive
        ? `${rival.titlesWhileActive} yours`
        : null,
      rival.theirTitles ? `${rival.theirTitles} theirs` : null,
    ]
      .filter(Boolean)
      .join(", ");
    return titles
      ? `Title years with ${rival.name} — ${record}, ${titles} (${span}).`
      : `Title years with ${rival.name} — ${record} (${span}).`;
  }
  if (rival.heat === "wheel") {
    return `Wheel-to-wheel with ${rival.name} — ${record} over ${span}.`;
  }
  return `Marked ${rival.name} for ${rival.meetings} seasons — ${record} (${span}).`;
}

export function buildRivalCareer(
  seasons: SeasonResult[],
): RivalCareer | null {
  const all = buildRivalCareers(seasons);
  return all[0] ?? null;
}

/** Every rival with at least one meeting, strongest first. */
export function buildRivalCareers(seasons: SeasonResult[]): RivalCareer[] {
  const names = new Set(
    seasons.map((s) => s.rival?.name).filter(Boolean) as string[],
  );
  const rivals = [...names]
    .map((name) => aggregateRival(name, seasons))
    .filter((r): r is RivalCareer => r != null)
    .sort(
      (a, b) =>
        b.meetings - a.meetings ||
        b.titleFights - a.titleFights ||
        b.teammateSeasons - a.teammateSeasons ||
        a.name.localeCompare(b.name),
    );
  return rivals;
}

/** How good a season was, used to find where the peak years sit. */
function seasonWeight(season: SeasonResult): number {
  return (
    (season.champion ? 40 : 0) +
    season.wins * 6 +
    season.podiums * 2 +
    Math.max(0, 21 - season.position)
  );
}

/**
 * Chapters are contiguous spans of a career, in order, so the season log stays
 * chronological when it is grouped. We find the peak years first, then read
 * outwards: everything before is debut/breakthrough, everything after twilight.
 */
function chapterBoundaries(seasons: SeasonResult[]): {
  breakthroughAt: number;
  peakAt: number;
  twilightAt: number;
} {
  const total = seasons.length;
  const weights = seasons.map(seasonWeight);

  // The peak is the best sustained run, not the single best year: slide a
  // window sized to the career and take the stretch that scored the most.
  const span = Math.min(
    Math.max(Math.round(total * 0.4), 2),
    Math.max(total - 1, 1),
  );
  let peakAt = 0;
  let bestSum = -Infinity;
  for (let start = 0; start + span <= total; start++) {
    let sum = 0;
    for (let i = start; i < start + span; i++) sum += weights[i]!;
    if (sum > bestSum) {
      bestSum = sum;
      peakAt = start;
    }
  }

  // Let the peak grow into neighbouring seasons that were just as good.
  const average = bestSum / span;
  const keep = average * 0.7;
  let peakEnd = peakAt + span - 1;
  while (peakAt > 1 && weights[peakAt - 1]! >= keep) peakAt--;
  while (peakEnd < total - 1 && weights[peakEnd + 1]! >= keep) peakEnd++;

  const breakthroughAt = Math.min(1, peakAt);
  const twilightAt = Math.max(peakAt + 1, peakEnd + 1);
  return { breakthroughAt, peakAt: Math.max(peakAt, 1), twilightAt };
}

function chapterForIndex(
  index: number,
  bounds: ReturnType<typeof chapterBoundaries>,
): CareerChapterId {
  if (index === 0) return "debut";
  if (index >= bounds.twilightAt) return "twilight";
  if (index >= bounds.peakAt) return "peak";
  if (index >= bounds.breakthroughAt) return "breakthrough";
  return "debut";
}

const CHAPTER_COPY: Record<
  CareerChapterId,
  { label: string; blurb: string }
> = {
  debut: {
    label: "Debut",
    blurb: "Learning the paddock, proving the seat was earned.",
  },
  breakthrough: {
    label: "Breakthrough",
    blurb: "Results start matching the reputation.",
  },
  peak: {
    label: "Peak",
    blurb: "The years they will put on the highlight reel.",
  },
  twilight: {
    label: "Twilight",
    blurb: "The body slows; the craft has to carry it.",
  },
};

export function assignChapters(seasons: SeasonResult[]): {
  seasons: SeasonResult[];
  chapters: CareerChapter[];
} {
  if (!seasons.length) return { seasons, chapters: [] };

  const bounds = chapterBoundaries(seasons);
  const tagged = seasons.map((season, index) => ({
    ...season,
    chapter: chapterForIndex(index, bounds),
  }));

  const chapters: CareerChapter[] = [];
  for (const season of tagged) {
    const last = chapters[chapters.length - 1];
    if (last && last.id === season.chapter) {
      last.yearTo = season.year;
      continue;
    }
    chapters.push({
      id: season.chapter,
      label: CHAPTER_COPY[season.chapter].label,
      blurb: CHAPTER_COPY[season.chapter].blurb,
      yearFrom: season.year,
      yearTo: season.year,
    });
  }

  return { seasons: tagged, chapters };
}
