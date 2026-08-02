import { describe, expect, it } from "vitest";
import {
  achievementBand,
  resolveTier,
  tierSummary,
} from "./careerOutcome";
import type { CareerResult, SeasonResult } from "@/types";

function baseResult(
  overrides: Partial<Omit<CareerResult, "tier" | "tierLabel" | "summary">> = {},
): Omit<CareerResult, "tier" | "tierLabel" | "summary"> {
  return {
    seasons: [{ year: 2020, dnfs: 2 } as SeasonResult],
    titles: 0,
    wins: 0,
    podiums: 0,
    poles: 0,
    points: 0,
    bestFinish: 10,
    overall: 80,
    peakOverall: 82,
    debutAge: 22,
    finalAge: 35,
    endReason: "lostSeat",
    archetype: "Solid Midfielder",
    seed: 42,
    traits: [],
    rival: null,
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

function seasons(count: number, extra: Partial<SeasonResult> = {}): SeasonResult[] {
  return Array.from({ length: count }, (_, i) => ({
    year: 2010 + i,
    age: 22 + i,
    team: "Williams",
    teamTier: 3,
    position: 8,
    points: 40,
    wins: 0,
    podiums: 4,
    poles: 0,
    dnfs: 3,
    champion: false,
    races: [],
    standings: [],
    constructors: [],
    championName: "Someone",
    championPoints: 300,
    seatNote: "",
    replacedDriver: null,
    isNumberTwo: false,
    ...extra,
  }));
}

describe("resolveTier", () => {
  it("maps stats to career tiers", () => {
    expect(resolveTier({ titles: 4, wins: 10, podiums: 20, points: 200 })).toBe(
      "legend",
    );
    expect(resolveTier({ titles: 3, wins: 35, podiums: 50, points: 400 })).toBe(
      "legend",
    );
    expect(resolveTier({ titles: 3, wins: 10, podiums: 20, points: 200 })).toBe(
      "champion",
    );
    expect(resolveTier({ titles: 1, wins: 5, podiums: 10, points: 150 })).toBe(
      "champion",
    );
    expect(resolveTier({ titles: 0, wins: 6, podiums: 61, points: 400 })).toBe(
      "raceWinner",
    );
    expect(resolveTier({ titles: 0, wins: 4, podiums: 61, points: 400 })).toBe(
      "podiumThreat",
    );
    expect(resolveTier({ titles: 0, wins: 1, podiums: 12, points: 120 })).toBe(
      "podiumThreat",
    );
    expect(resolveTier({ titles: 0, wins: 0, podiums: 0, points: 40 })).toBe(
      "pointsRegular",
    );
  });
});

describe("achievementBand", () => {
  it("subdivides race winners by volume", () => {
    const s = seasons(13);
    expect(
      achievementBand("raceWinner", {
        titles: 0,
        wins: 4,
        podiums: 61,
        seasons: s,
      }),
    ).toBe("consistentWinner");
    expect(
      achievementBand("raceWinner", {
        titles: 0,
        wins: 3,
        podiums: 8,
        seasons: s,
      }),
    ).toBe("modestWinner");
    expect(
      achievementBand("legend", {
        titles: 4,
        wins: 30,
        podiums: 50,
        seasons: s,
      }),
    ).toBe("dynasty");
  });
});

describe("tierSummary", () => {
  it("does not use dynasty framing for modest race winners", () => {
    const result = baseResult({
      wins: 6,
      podiums: 61,
      points: 450,
      seasons: seasons(13, { wins: 0, podiums: 5, team: "Alpine", teamTier: 4 }),
      seed: 99,
    });
    const tier = resolveTier(result);
    expect(tier).toBe("raceWinner");
    const summary = tierSummary(tier, result);
    expect(summary.toLowerCase()).not.toMatch(/dynasty/);
    expect(summary).toMatch(/6/);
    expect(summary).toMatch(/61/);
    expect(summary).toMatch(/13 season/);
  });

  it("uses dynasty language for multi-title legends", () => {
    const result = baseResult({
      titles: 4,
      wins: 35,
      podiums: 80,
      seasons: seasons(15, { wins: 2, podiums: 6, team: "Red Bull", teamTier: 5 }),
      endReason: "retired",
      finalAge: 38,
      seed: 7,
    });
    const tier = resolveTier(result);
    expect(tier).toBe("legend");
    expect(achievementBand(tier, result)).toBe("dynasty");
    const summary = tierSummary(tier, result);
    expect(summary.toLowerCase()).toMatch(/dynasty|record book|measure others/);
    expect(summary).toMatch(/4/);
  });

  it("varies copy by seed for similar careers", () => {
    const base = {
      wins: 8,
      podiums: 61,
      points: 450,
      seasons: seasons(13),
    };
    const a = tierSummary(
      "raceWinner",
      baseResult({ ...base, seed: 1 }),
    );
    const b = tierSummary(
      "raceWinner",
      baseResult({ ...base, seed: 888 }),
    );
    expect(a).not.toBe(b);
  });

  it("integrates lost seat without the old bolted-on line", () => {
    const result = baseResult({
      wins: 7,
      podiums: 61,
      seasons: seasons(13),
      endReason: "lostSeat",
      finalAge: 35,
      seed: 12,
    });
    const summary = tierSummary("raceWinner", result);
    expect(summary).not.toMatch(/The seat went to someone else at 35/);
    expect(summary).toMatch(/35/);
  });

  it("mentions walking away when the player chose to retire", () => {
    const result = baseResult({
      wins: 2,
      podiums: 12,
      seasons: seasons(8),
      endReason: "retired",
      finalAge: 31,
      seed: 55,
      pathMarks: {
        hadSabbatical: false,
        number2Teams: [],
        walkedAway: true,
      },
    });
    const summary = tierSummary("podiumThreat", result);
    expect(summary.toLowerCase()).toMatch(/walked away/);
  });

  it("handles sabbatical plus lost seat", () => {
    const result = baseResult({
      wins: 1,
      podiums: 10,
      seasons: seasons(10),
      endReason: "lostSeat",
      finalAge: 34,
      seed: 3,
      pathMarks: {
        hadSabbatical: true,
        number2Teams: [],
        walkedAway: false,
        sabbaticalChampion: "Hamilton",
      },
    });
    const summary = tierSummary("podiumThreat", result);
    expect(summary.toLowerCase()).toMatch(/sabbatical|year out|sat out/);
  });
});
