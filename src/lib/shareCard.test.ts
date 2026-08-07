import { describe, expect, it } from "vitest";
import { careerShareStoryLines, careerShareText } from "./shareCard";
import type { CareerResult, SeasonResult } from "@/types";

const season: SeasonResult = {
  year: 2028,
  age: 31,
  team: "Mercedes",
  teamTier: 5,
  position: 2,
  points: 280,
  wins: 3,
  podiums: 8,
  poles: 2,
  dnfs: 1,
  champion: false,
  races: [],
  standings: [],
  constructors: [],
  championName: "Someone Else",
  championPoints: 410,
  seatNote: "Back after sitting out 2027 at Mercedes",
  replacedDriver: null,
  offseason: null,
  goal: null,
  rival: null,
  chapter: "peak",
};

const career: CareerResult = {
  seasons: [season],
  titles: 1,
  wins: 8,
  podiums: 25,
  poles: 6,
  points: 1300,
  bestFinish: 1,
  overall: 91,
  peakOverall: 92,
  debutAge: 22,
  finalAge: 31,
  endReason: "retired",
  archetype: "Title Threat",
  tier: "champion",
  tierLabel: "World Champion",
  summary: "A scarred, brilliant career.",
  seed: 1,
  traits: [],
  rival: {
    name: "Max Verstappen",
    meetings: 4,
    wins: 2,
    losses: 2,
    titlesWhileActive: 1,
    theirTitles: 1,
    teams: ["Red Bull"],
    yearFrom: 2025,
    yearTo: 2028,
    teammateSeasons: 0,
    titleFights: 2,
    heat: "title",
    blurb: "Four title years against Max Verstappen, split down the middle.",
  },
  rivals: [],
  chapters: [],
  pathMarks: {
    hadSabbatical: true,
    number2Teams: ["Ferrari"],
    walkedAway: true,
    sabbaticalYear: 2027,
    sabbaticalChampion: "Max Verstappen",
    ghost: {
      seasons: [],
      projectedTitles: 1,
      projectedWins: 6,
      projectedFinalAge: 34,
      headline: "Another title was there at Mercedes by 34.",
    },
  },
};

describe("career share card", () => {
  it("keeps path scars and rival available for story helpers", () => {
    const lines = careerShareStoryLines(career);

    expect(lines).toEqual(
      expect.arrayContaining([
        "Loyal lieutenant at Ferrari",
        "Sat out 2027 — Max Verstappen took the title",
        "Chose to retire at 31",
        "Another title was there at Mercedes by 34.",
        "Chief rival: Four title years against Max Verstappen, split down the middle.",
      ]),
    );
  });

  it("formats punchy share text tier-first", () => {
    const copied = careerShareText("Test Driver", career, [
      { year: 2026, tag: "Title", title: "First crown at Ferrari" },
    ]);

    expect(copied).toContain(career.tierLabel.toUpperCase());
    expect(copied).toContain("Test Driver · OVR 91");
    expect(copied).toContain("1 title · 8 wins");
    expect(copied).toContain("▸ 2026 · First crown at Ferrari");
    expect(copied).toContain("Rival: Max Verstappen");
    expect(copied).toContain("Build yours →");
    expect(copied).toContain("#PerfectDriver");
  });

  it("tags weekly grid careers", () => {
    const copied = careerShareText("Test Driver", career, [], [], "2026-W32");
    expect(copied).toContain("Weekly Grid · 2026-W32");
    expect(copied).toContain("#PDGrid");
  });
});
