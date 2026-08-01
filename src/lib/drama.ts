import type {
  CareerChapter,
  CareerChapterId,
  RivalCareer,
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
  },
  rand: Rng,
): SeasonGoal {
  const options: { kind: SeasonGoalKind; label: string; detail: string }[] = [];

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
  };
}

export function chooseRival(
  standings: StandingEntry[],
  playerTeam: string,
  rand: Rng,
): string | null {
  const others = standings.filter((row) => !row.isPlayer);
  const teammate = others.find((row) => row.team === playerTeam);
  if (teammate && rand() < 0.55) return teammate.name;
  const near = others
    .filter((row) => {
      const you = standings.find((r) => r.isPlayer);
      return you ? Math.abs(row.position - you.position) <= 4 : false;
    })
    .sort((a, b) => a.position - b.position);
  return near[0]?.name ?? others[0]?.name ?? null;
}

export function buildRivalCareer(
  seasons: SeasonResult[],
): RivalCareer | null {
  const notes = seasons.map((s) => s.rival).filter(Boolean) as RivalSeasonNote[];
  if (!notes.length) return null;

  // Careers can run through more than one rival; the headline goes to whoever
  // the player raced most often.
  const counts = new Map<string, number>();
  for (const note of notes) {
    counts.set(note.name, (counts.get(note.name) ?? 0) + 1);
  }
  const name = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]![0];
  const same = notes.filter((n) => n.name === name);
  if (!same.length) return null;
  return {
    name,
    meetings: same.length,
    wins: same.filter((n) => n.beatThem).length,
    losses: same.filter((n) => !n.beatThem).length,
    titlesWhileActive: seasons.filter(
      (s) => s.rival?.name === name && s.champion,
    ).length,
  };
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
