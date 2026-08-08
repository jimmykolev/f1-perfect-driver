import type { CarAttributes, LockedCarAttribute } from "@/lib/teamCarPool";
import type { TeamPrincipal } from "@/lib/teamPrincipalPool";
import type { DriverSeason } from "@/types";

export type TeamGrade =
  | "perfect"
  | "nearMiss"
  | "contender"
  | "challenger"
  | "alsoRan";

export const TEAM_GRADE_META: Record<
  TeamGrade,
  { label: string; rank: number; color: string }
> = {
  perfect: { label: "Clean Sweep", rank: 5, color: "#f5c518" },
  nearMiss: { label: "Near Miss", rank: 4, color: "#7ddea2" },
  contender: { label: "Contender", rank: 3, color: "#e10600" },
  challenger: { label: "Challenger", rank: 2, color: "#f0a36b" },
  alsoRan: { label: "Also-Ran", rank: 1, color: "#8b857c" },
};

export interface TeamSeasonGradeInput {
  year: number;
  teamName: string;
  calendarLength: number;
  teamWins: number;
  perfect: boolean;
  brokenAtRound: number | null;
  grade?: TeamGrade;
}

export function gradeTeamSeason(result: TeamSeasonGradeInput): TeamGrade {
  if (result.perfect) return "perfect";
  const share =
    result.calendarLength > 0 ? result.teamWins / result.calendarLength : 0;
  const missed = result.calendarLength - result.teamWins;
  if (missed <= 1 || share >= 0.85) return "nearMiss";
  if (share >= 0.55) return "contender";
  if (share >= 0.3) return "challenger";
  return "alsoRan";
}

export function teamSeasonSummary(result: TeamSeasonGradeInput): string {
  const grade = result.grade ?? gradeTeamSeason(result);
  const wins = `${result.teamWins}/${result.calendarLength}`;
  if (grade === "perfect") {
    return `Clean sweep — every race in ${result.year} belonged to ${result.teamName}.`;
  }
  if (grade === "nearMiss") {
    const miss =
      result.brokenAtRound != null
        ? ` The streak cracked at round ${result.brokenAtRound}.`
        : "";
    return `So close — ${wins} wins in ${result.year}.${miss}`;
  }
  if (grade === "contender") {
    return `Proper contender pace — ${wins} wins, but the calendar wasn't yours.`;
  }
  if (grade === "challenger") {
    return `Flashes of pace — ${wins} wins. The garage still has work to do.`;
  }
  return `A hard year — ${wins} wins. Rebuild the heist and try another calendar.`;
}

/** Short team identity from car DNA + seats + principal. */
export function teamArchetype(input: {
  car: CarAttributes;
  first: DriverSeason;
  second: DriverSeason;
  reserve: DriverSeason;
  principal: TeamPrincipal;
}): string {
  const { car, first, second, reserve, principal } = input;
  const carOvr = Math.round(
    (car.aerodynamics + car.chassis + car.powertrain + car.durability) / 4,
  );
  const seatOvr = Math.round(
    (first.overall + second.overall + reserve.overall) / 3,
  );

  if (car.aerodynamics >= 90 && car.aerodynamics >= car.durability + 6) {
    return "Aero monarchy";
  }
  if (car.durability >= 90 && car.durability >= car.aerodynamics + 4) {
    return "Reliability bunker";
  }
  if (car.powertrain >= 90) {
    return "Power-unit fortress";
  }
  if (principal.attributes.strategy >= 90) {
    return "Strategy temple";
  }
  if (principal.attributes.leadership >= 90) {
    return "Pit-wall empire";
  }
  if (principal.attributes.development >= 90) {
    return "Development house";
  }
  if (Math.abs(first.overall - second.overall) <= 2 && seatOvr >= 88) {
    return "Twin spear tip";
  }
  if (first.overall >= second.overall + 8) {
    return "Number-one hierarchy";
  }
  if (carOvr >= 90 && seatOvr >= 88) {
    return "Title factory";
  }
  if (carOvr >= 85) {
    return "Front-running project";
  }
  if (seatOvr >= 85) {
    return "Driver-led outfit";
  }
  return "Constructor heist";
}

export function teamHeistCredits(
  locked: LockedCarAttribute[],
  limit = 3,
): string | null {
  if (!locked.length) return null;
  return [...locked]
    .sort((a, b) => b.value - a.value)
    .slice(0, limit)
    .map((item) => `${item.from.team} '${String(item.from.year).slice(-2)}`)
    .join(" · ");
}

export function finalizeTeamSeasonResult<T extends TeamSeasonGradeInput>(
  result: T,
): T & { grade: TeamGrade; gradeLabel: string; summary: string } {
  const grade = gradeTeamSeason(result);
  return {
    ...result,
    grade,
    gradeLabel: TEAM_GRADE_META[grade].label,
    summary: teamSeasonSummary({ ...result, grade }),
  };
}
