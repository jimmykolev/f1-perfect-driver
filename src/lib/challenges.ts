import type { CareerResult } from "@/types";

export type ChallengeObjective =
  | { type: "winTitleByAge"; age: number }
  | { type: "titlesAtLeast"; count: number }
  | { type: "championInYear"; year: number }
  | { type: "beatNamedH2H"; name: string; minMeetings?: number };

export interface ChallengeDef {
  id: string;
  title: string;
  blurb: string;
  startYear: number;
  seed: number;
  debutTeam?: string;
  objective: ChallengeObjective;
}

export const CHALLENGES: ChallengeDef[] = [
  {
    id: "schumacher-94",
    title: "The Young Pretender",
    blurb: "Enter the volatile 1994 field and claim a title before 28.",
    startYear: 1994,
    seed: 1994007,
    objective: { type: "winTitleByAge", age: 28 },
  },
  {
    id: "williams-91",
    title: "Williams Ascendant",
    blurb: "A factory seat and the fastest car. Convert it into the 1991 crown.",
    startYear: 1991,
    seed: 1991011,
    debutTeam: "Williams",
    objective: { type: "championInYear", year: 1991 },
  },
  {
    id: "alonso-2007",
    title: "Garage War",
    blurb: "Survive the 2007 pressure cooker and beat Fernando Alonso head-to-head.",
    startYear: 2007,
    seed: 2007007,
    debutTeam: "McLaren",
    objective: { type: "beatNamedH2H", name: "Fernando Alonso", minMeetings: 1 },
  },
  {
    id: "hybrid-dynasty",
    title: "Hybrid Dynasty",
    blurb: "Start at the dawn of the hybrid era and collect at least two titles.",
    startYear: 2014,
    seed: 2014014,
    objective: { type: "titlesAtLeast", count: 2 },
  },
  {
    id: "redemption-2009",
    title: "Double Diffuser",
    blurb: "Turn the 2009 scramble into a World Championship before 30.",
    startYear: 2009,
    seed: 2009009,
    objective: { type: "winTitleByAge", age: 30 },
  },
];

export function getChallenge(id: string): ChallengeDef | undefined {
  return CHALLENGES.find((challenge) => challenge.id === id);
}

export function objectiveLabel(def: ChallengeDef): string {
  const { objective } = def;
  switch (objective.type) {
    case "winTitleByAge":
      return `Win a title by age ${objective.age}`;
    case "titlesAtLeast":
      return `Win ${objective.count}+ title${objective.count === 1 ? "" : "s"}`;
    case "championInYear":
      return `Win the ${objective.year} title`;
    case "beatNamedH2H":
      return `Beat ${objective.name} head-to-head`;
  }
}

export function evaluateChallenge(
  career: CareerResult,
  def: ChallengeDef,
): { passed: boolean; detail: string } {
  const { objective } = def;
  switch (objective.type) {
    case "winTitleByAge": {
      const titleSeason = career.seasons.find(
        (season) => season.champion && season.age <= objective.age,
      );
      return titleSeason
        ? {
            passed: true,
            detail: `Champion in ${titleSeason.year} at age ${titleSeason.age}.`,
          }
        : {
            passed: false,
            detail: `No title arrived by age ${objective.age}.`,
          };
    }
    case "titlesAtLeast":
      return career.titles >= objective.count
        ? {
            passed: true,
            detail: `${career.titles} titles secured (target: ${objective.count}).`,
          }
        : {
            passed: false,
            detail: `${career.titles} titles secured (target: ${objective.count}).`,
          };
    case "championInYear": {
      const season = career.seasons.find((item) => item.year === objective.year);
      return season?.champion
        ? { passed: true, detail: `Won the ${objective.year} World Championship.` }
        : {
            passed: false,
            detail: season
              ? `${season.championName} won the ${objective.year} title.`
              : `Did not race in ${objective.year}.`,
          };
    }
    case "beatNamedH2H": {
      const meetings = career.seasons.filter(
        (season) => season.rival?.name === objective.name,
      );
      const wins = meetings.filter((season) => season.rival?.beatThem).length;
      const minMeetings = objective.minMeetings ?? 1;
      const passed = meetings.length >= minMeetings && wins > meetings.length - wins;
      return {
        passed,
        detail:
          meetings.length < minMeetings
            ? `Only met ${objective.name} ${meetings.length}/${minMeetings} required time${minMeetings === 1 ? "" : "s"}.`
            : `${wins}–${meetings.length - wins} against ${objective.name} across ${meetings.length} meeting${meetings.length === 1 ? "" : "s"}.`,
      };
    }
  }
}
