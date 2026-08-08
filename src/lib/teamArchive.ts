import type { TeamGrade } from "@/lib/teamOutcome";
import { TEAM_GRADE_META } from "@/lib/teamOutcome";
import type { TeamSeasonChaseResult } from "@/lib/teamSeason";

const STORAGE_KEY = "f1pd-team-archive-v1";
const MAX_ENTRIES = 24;

export interface TeamArchiveEntry {
  id: string;
  teamName: string;
  year: number;
  grade: TeamGrade;
  gradeLabel: string;
  wins: number;
  calendarLength: number;
  perfect: boolean;
  brokenAtRound: number | null;
  archetype: string;
  principalName: string | null;
  summary: string;
  finishedAt: number;
  seed: number;
}

function readRaw(): TeamArchiveEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as TeamArchiveEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeRaw(entries: TeamArchiveEntry[]) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(entries.slice(0, MAX_ENTRIES)),
    );
  } catch {
    /* ignore */
  }
}

export function getTeamHistory(): TeamArchiveEntry[] {
  return readRaw().sort((a, b) => b.finishedAt - a.finishedAt);
}

export function pickBestTeamChase(
  entries: TeamArchiveEntry[],
): TeamArchiveEntry | null {
  if (!entries.length) return null;
  return [...entries].sort((a, b) => {
    const grade =
      (TEAM_GRADE_META[b.grade]?.rank ?? 0) -
      (TEAM_GRADE_META[a.grade]?.rank ?? 0);
    if (grade !== 0) return grade;
    const shareB = b.wins / Math.max(1, b.calendarLength);
    const shareA = a.wins / Math.max(1, a.calendarLength);
    if (shareB !== shareA) return shareB - shareA;
    return b.finishedAt - a.finishedAt;
  })[0]!;
}

export function archiveTeamChase(input: {
  teamName: string;
  result: TeamSeasonChaseResult;
  archetype: string;
  seed: number;
}): TeamArchiveEntry {
  const { result } = input;
  const entry: TeamArchiveEntry = {
    id: `${input.seed}-${result.year}-${Date.now()}`,
    teamName: input.teamName || result.teamName,
    year: result.year,
    grade: result.grade,
    gradeLabel: result.gradeLabel,
    wins: result.teamWins,
    calendarLength: result.calendarLength,
    perfect: result.perfect,
    brokenAtRound: result.brokenAtRound,
    archetype: input.archetype,
    principalName: result.principalName,
    summary: result.summary,
    finishedAt: Date.now(),
    seed: input.seed,
  };
  writeRaw([entry, ...readRaw().filter((e) => e.id !== entry.id)]);
  return entry;
}

export function clearTeamHistory() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
