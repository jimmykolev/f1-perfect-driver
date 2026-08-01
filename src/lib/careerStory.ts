import type { CareerPathMarks, CareerResult, SeasonResult } from "@/types";
import type { ChallengeDef } from "@/lib/challenges";

export interface ChallengeStoryResult {
  def: ChallengeDef;
  passed: boolean;
}

/** Classify a season seat note for UI tags. */
export function seatNoteKind(
  note: string,
): "number2" | "return" | "other" {
  const lower = note.toLowerCase();
  if (lower.includes("number two") || lower.includes("number 2")) {
    return "number2";
  }
  if (lower.includes("sitting out") || lower.includes("back after")) {
    return "return";
  }
  return "other";
}

/** Short chips for the verdict header from path scars. */
export function pathMarkChips(marks: CareerPathMarks): string[] {
  const chips: string[] = [];
  if (marks.number2Teams.length) {
    chips.push(
      marks.number2Teams.length === 1
        ? `#2 at ${marks.number2Teams[0]}`
        : `#2 at ${marks.number2Teams.length} teams`,
    );
  }
  if (marks.hadSabbatical) chips.push("Sat a year out");
  if (marks.walkedAway) chips.push("Walked away");
  return chips;
}

/** One-line scars for share text / PNG. */
export function careerScarLines(career: CareerResult): string[] {
  const lines: string[] = [];
  const { pathMarks } = career;
  if (pathMarks.number2Teams.length) {
    lines.push(
      pathMarks.number2Teams.length === 1
        ? `Loyal lieutenant at ${pathMarks.number2Teams[0]}`
        : `Played #2 at ${pathMarks.number2Teams.join(", ")}`,
    );
  }
  if (pathMarks.hadSabbatical) {
    const year = pathMarks.sabbaticalYear;
    const champ = pathMarks.sabbaticalChampion;
    lines.push(
      year
        ? champ
          ? `Sat out ${year} — ${champ} took the title`
          : `Sat out ${year}`
        : "Sat a year out mid-career",
    );
  }
  if (pathMarks.walkedAway) {
    lines.push(`Chose to retire at ${career.finalAge}`);
    if (pathMarks.ghost?.headline) lines.push(pathMarks.ghost.headline);
  } else if (career.endReason === "lostSeat") {
    lines.push(`Lost the seat at ${career.finalAge}`);
  }
  if (pathMarks.dramaBeats?.length) {
    lines.push(...pathMarks.dramaBeats.slice(0, 2));
  }
  return lines;
}

/** Compact challenge outcome for result sharing. */
export function challengeStoryLine(result: ChallengeStoryResult): string {
  return `Challenge: ${result.def.title} · ${result.passed ? "Cleared" : "Failed"}`;
}

/** Exit beat note for the museum. */
export function exitStoryNote(career: CareerResult): string | undefined {
  if (career.endReason === "lostSeat") return "No seat left on the grid";
  if (career.pathMarks.walkedAway) {
    const ghost = career.pathMarks.ghost;
    if (ghost?.projectedTitles) {
      return `Walked away — left ${ghost.projectedTitles} more title${ghost.projectedTitles === 1 ? "" : "s"} on the table`;
    }
    return `Walked away after ${career.seasons.length} seasons`;
  }
  if (career.finalAge <= 34) {
    return `Hung it up early at ${career.finalAge}`;
  }
  return undefined;
}

/** Calendar gaps between raced seasons (sit-out years). */
export function sabbaticalGaps(
  seasons: SeasonResult[],
): { year: number; returnSeason: SeasonResult }[] {
  const gaps: { year: number; returnSeason: SeasonResult }[] = [];
  for (let i = 1; i < seasons.length; i++) {
    const prev = seasons[i - 1]!;
    const next = seasons[i]!;
    if (next.year > prev.year + 1) {
      for (let y = prev.year + 1; y < next.year; y++) {
        gaps.push({ year: y, returnSeason: next });
      }
    }
  }
  return gaps;
}
