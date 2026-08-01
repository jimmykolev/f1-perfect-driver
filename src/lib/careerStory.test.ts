import { describe, expect, it } from "vitest";
import {
  careerScarLines,
  exitStoryNote,
  pathMarkChips,
  sabbaticalGaps,
  seatNoteKind,
} from "./careerStory";
import type { CareerResult, SeasonResult } from "@/types";

function season(
  partial: Pick<SeasonResult, "year" | "team" | "seatNote"> &
    Partial<SeasonResult>,
): SeasonResult {
  return {
    age: 28,
    teamTier: 3,
    position: 8,
    points: 40,
    wins: 0,
    podiums: 0,
    poles: 0,
    dnfs: 1,
    champion: false,
    races: [],
    standings: [],
    constructors: [],
    championName: "Someone",
    championPoints: 400,
    replacedDriver: null,
    offseason: null,
    goal: null,
    rival: null,
    chapter: "debut",
    ...partial,
  };
}

function career(
  partial: Partial<CareerResult> & Pick<CareerResult, "seasons" | "pathMarks">,
): CareerResult {
  return {
    titles: 0,
    wins: 2,
    podiums: 5,
    poles: 1,
    points: 200,
    bestFinish: 4,
    overall: 86,
    peakOverall: 86,
    debutAge: 22,
    finalAge: 33,
    endReason: "retired",
    archetype: "Solid Midfielder",
    tier: "raceWinner",
    tierLabel: "Race Winner",
    summary: "A solid career.",
    seed: 1,
    traits: [],
    rival: null,
    rivals: [],
    chapters: [],
    ...partial,
  };
}

describe("careerStory", () => {
  it("classifies seat notes", () => {
    expect(seatNoteKind("Signed as the Ferrari number two")).toBe("number2");
    expect(seatNoteKind("Back after sitting out 2029 at Alpine")).toBe(
      "return",
    );
    expect(seatNoteKind("Chose McLaren over Haas")).toBe("other");
  });

  it("detects sabbatical calendar gaps", () => {
    const gaps = sabbaticalGaps([
      season({ year: 2024, team: "Haas", seatNote: "Debut" }),
      season({
        year: 2026,
        team: "Alpine",
        seatNote: "Back after sitting out 2025 at Alpine",
      }),
    ]);
    expect(gaps).toEqual([
      expect.objectContaining({ year: 2025 }),
    ]);
  });

  it("builds scar lines and exit notes from path marks", () => {
    const result = career({
      finalAge: 31,
      pathMarks: {
        hadSabbatical: true,
        number2Teams: ["Ferrari"],
        walkedAway: true,
      },
      seasons: [
        season({ year: 2024, team: "Haas", seatNote: "Debut" }),
        season({
          year: 2027,
          team: "Ferrari",
          seatNote: "Signed as the Ferrari number two",
        }),
        season({
          year: 2029,
          team: "Ferrari",
          seatNote: "Back after sitting out 2028 at Ferrari",
        }),
      ],
    });

    expect(pathMarkChips(result.pathMarks)).toEqual([
      "#2 at Ferrari",
      "Sat a year out",
      "Walked away",
    ]);
    expect(careerScarLines(result)).toEqual(
      expect.arrayContaining([
        "Loyal lieutenant at Ferrari",
        "Chose to retire at 31",
      ]),
    );
    expect(exitStoryNote(result)).toBe("Walked away after 3 seasons");
  });

  it("mentions ghost titles left on the table", () => {
    const result = career({
      pathMarks: {
        hadSabbatical: false,
        number2Teams: [],
        walkedAway: true,
        ghost: {
          seasons: [
            {
              year: 2030,
              team: "Mercedes",
              position: 1,
              wins: 7,
              points: 400,
              champion: true,
            },
          ],
          projectedTitles: 1,
          projectedWins: 7,
          projectedFinalAge: 34,
          headline: "Another title was there at Mercedes by 34.",
        },
      },
      seasons: [season({ year: 2028, team: "Mercedes", seatNote: "Stay" })],
    });
    expect(exitStoryNote(result)).toMatch(/left 1 more title/);
    expect(careerScarLines(result)).toContain(
      "Another title was there at Mercedes by 34.",
    );
  });
});
