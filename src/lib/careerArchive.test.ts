import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  archiveCareer,
  clearCareerHistory,
  getCareerHistory,
  pickPersonalBest,
  recurringRival,
} from "./careerArchive";
import type { CareerResult, SeasonResult } from "@/types";

const season: SeasonResult = {
  year: 2026,
  age: 24,
  team: "Ferrari",
  teamTier: 5,
  position: 1,
  points: 400,
  wins: 8,
  podiums: 14,
  poles: 6,
  dnfs: 0,
  champion: true,
  races: [],
  standings: [],
  constructors: [],
  championName: "Test Driver",
  championPoints: 400,
  seatNote: "",
  replacedDriver: null,
  offseason: null,
  goal: null,
  rival: null,
  chapter: "peak",
};

function makeCareer(overrides: Partial<CareerResult> = {}): CareerResult {
  return {
    seasons: [season],
    titles: 2,
    wins: 20,
    podiums: 40,
    poles: 12,
    points: 2000,
    bestFinish: 1,
    overall: 92,
    peakOverall: 94,
    debutAge: 20,
    finalAge: 30,
    endReason: "retired",
    archetype: "Title Threat",
    tier: "champion",
    tierLabel: "World Champion",
    summary: "A fierce title run.",
    seed: 42,
    traits: [],
    rival: {
      name: "Max Verstappen",
      meetings: 3,
      wins: 2,
      losses: 1,
      titlesWhileActive: 1,
      theirTitles: 1,
      teams: ["Red Bull"],
      yearFrom: 2024,
      yearTo: 2026,
      teammateSeasons: 0,
      titleFights: 2,
      heat: "title",
      blurb: "Title years against Max Verstappen.",
    },
    rivals: [],
    chapters: [],
    pathMarks: {
      hadSabbatical: false,
      number2Teams: [],
      walkedAway: false,
    },
    ...overrides,
  };
}

describe("career archive", () => {
  const storage = new Map<string, string>();

  beforeEach(() => {
    storage.clear();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
      removeItem: (key: string) => {
        storage.delete(key);
      },
    });
  });

  afterEach(() => {
    clearCareerHistory();
    vi.unstubAllGlobals();
  });

  it("archives finished careers newest-first", () => {
    archiveCareer("Alpha", makeCareer({ seed: 1 }));
    archiveCareer(
      "Bravo",
      makeCareer({
        seed: 2,
        titles: 0,
        tier: "raceWinner",
        tierLabel: "Race Winner",
      }),
    );

    const entries = getCareerHistory();
    expect(entries).toHaveLength(2);
    expect(entries[0]?.driverName).toBe("Bravo");
    expect(entries[1]?.driverName).toBe("Alpha");
    expect(entries[0]?.debutTeam).toBe("Ferrari");
  });

  it("picks personal best by tier then titles then wins", () => {
    archiveCareer(
      "Winner",
      makeCareer({
        seed: 1,
        tier: "raceWinner",
        tierLabel: "Race Winner",
        titles: 0,
        wins: 12,
      }),
    );
    archiveCareer(
      "Champ A",
      makeCareer({
        seed: 2,
        tier: "champion",
        tierLabel: "World Champion",
        titles: 2,
        wins: 18,
      }),
    );
    archiveCareer(
      "Champ B",
      makeCareer({
        seed: 3,
        tier: "champion",
        tierLabel: "World Champion",
        titles: 3,
        wins: 15,
      }),
    );

    const best = pickPersonalBest(getCareerHistory());
    expect(best?.driverName).toBe("Champ B");
  });

  it("surfaces a recurring rival only after two appearances", () => {
    archiveCareer("One", makeCareer({ seed: 1 }));
    expect(recurringRival(getCareerHistory())).toBeNull();

    archiveCareer(
      "Two",
      makeCareer({
        seed: 2,
        rival: {
          name: "Max Verstappen",
          meetings: 2,
          wins: 1,
          losses: 1,
          titlesWhileActive: 0,
          theirTitles: 1,
          teams: ["Red Bull"],
          yearFrom: 2025,
          yearTo: 2026,
          teammateSeasons: 0,
          titleFights: 1,
          heat: "title",
          blurb: "Again.",
        },
      }),
    );
    expect(recurringRival(getCareerHistory())).toEqual({
      name: "Max Verstappen",
      count: 2,
    });
  });
});
