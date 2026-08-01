import { describe, expect, it } from "vitest";
import { evaluateChallenge, type ChallengeDef } from "./challenges";
import type { CareerResult, SeasonResult } from "@/types";

function season(partial: Partial<SeasonResult>): SeasonResult {
  return {
    year: 2020,
    age: 25,
    team: "Test",
    teamTier: 3,
    position: 4,
    points: 100,
    wins: 1,
    podiums: 3,
    poles: 1,
    dnfs: 0,
    champion: false,
    races: [],
    standings: [],
    constructors: [],
    championName: "Someone Else",
    championPoints: 300,
    seatNote: "Debut",
    replacedDriver: null,
    offseason: null,
    goal: null,
    rival: null,
    chapter: "peak",
    ...partial,
  };
}

function career(seasons: SeasonResult[]): CareerResult {
  return {
    seasons,
    titles: seasons.filter((item) => item.champion).length,
    wins: 0,
    podiums: 0,
    poles: 0,
    points: 0,
    bestFinish: 1,
    overall: 90,
    peakOverall: 90,
    debutAge: 22,
    finalAge: 35,
    endReason: "retired",
    archetype: "Test",
    tier: "champion",
    tierLabel: "World Champion",
    summary: "Test career.",
    seed: 1,
    traits: [],
    rival: null,
    rivals: [],
    chapters: [],
    pathMarks: { hadSabbatical: false, number2Teams: [], walkedAway: false },
  };
}

function def(objective: ChallengeDef["objective"]): ChallengeDef {
  return {
    id: "test",
    title: "Test",
    blurb: "Test",
    startYear: 2020,
    seed: 1,
    objective,
  };
}

describe("evaluateChallenge", () => {
  it.each([
    [
      "title by age",
      def({ type: "winTitleByAge", age: 28 }),
      career([season({ champion: true, age: 27 })]),
      career([season({ champion: true, age: 29 })]),
    ],
    [
      "multiple titles",
      def({ type: "titlesAtLeast", count: 2 }),
      career([season({ champion: true }), season({ champion: true })]),
      career([season({ champion: true })]),
    ],
    [
      "title in a named year",
      def({ type: "championInYear", year: 2021 }),
      career([season({ year: 2021, champion: true })]),
      career([season({ year: 2021, champion: false, championName: "Rival" })]),
    ],
    [
      "named head-to-head",
      def({ type: "beatNamedH2H", name: "Rival", minMeetings: 2 }),
      career([
        season({ rival: { name: "Rival", beatThem: true } as SeasonResult["rival"] }),
        season({ rival: { name: "Rival", beatThem: true } as SeasonResult["rival"] }),
      ]),
      career([
        season({ rival: { name: "Rival", beatThem: true } as SeasonResult["rival"] }),
        season({ rival: { name: "Rival", beatThem: false } as SeasonResult["rival"] }),
      ]),
    ],
  ])("passes and fails %s", (_name, challenge, passing, failing) => {
    expect(evaluateChallenge(passing, challenge).passed).toBe(true);
    expect(evaluateChallenge(failing, challenge).passed).toBe(false);
  });
});
