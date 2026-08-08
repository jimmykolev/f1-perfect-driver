import { describe, expect, it } from "vitest";
import {
  compareBoardEntries,
  isBetterOrEqualRun,
  sanitizeDisplayName,
  validateSubmission,
  type WeeklyBoardEntry,
} from "@/lib/weeklyLeaderboard";
import { isoWeekKey } from "@/lib/weeklyGrid";

function entry(
  partial: Partial<WeeklyBoardEntry> & Pick<WeeklyBoardEntry, "tier" | "titles" | "wins">,
): WeeklyBoardEntry {
  return {
    clientId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    displayName: "Test",
    driverName: "Test Driver",
    points: 100,
    weekKey: isoWeekKey(),
    submittedAt: 1,
    tierLabel: "x",
    ...partial,
  };
}

describe("weeklyLeaderboard ranking", () => {
  it("orders by tier, then titles, then wins, then points", () => {
    const a = entry({ tier: "champion", titles: 1, wins: 20, points: 500 });
    const b = entry({ tier: "legend", titles: 2, wins: 10, points: 100 });
    const c = entry({ tier: "champion", titles: 2, wins: 5, points: 200 });
    const d = entry({ tier: "champion", titles: 1, wins: 25, points: 400 });
    const sorted = [a, b, c, d].sort(compareBoardEntries);
    expect(sorted.map((e) => e.tier + e.titles + "-" + e.wins)).toEqual([
      "legend2-10",
      "champion2-5",
      "champion1-25",
      "champion1-20",
    ]);
  });

  it("treats equal-or-better runs for upsert", () => {
    const prev = entry({ tier: "raceWinner", titles: 0, wins: 8, points: 300 });
    expect(
      isBetterOrEqualRun(
        { tier: "champion", titles: 1, wins: 3, points: 200 },
        prev,
      ),
    ).toBe(true);
    expect(
      isBetterOrEqualRun(
        { tier: "podiumThreat", titles: 0, wins: 1, points: 50 },
        prev,
      ),
    ).toBe(false);
  });
});

describe("weeklyLeaderboard validation", () => {
  it("sanitizes display names", () => {
    expect(sanitizeDisplayName("  Max   Verstappen  ")).toBe("Max Verstappen");
    expect(sanitizeDisplayName("x".repeat(40)).length).toBe(24);
  });

  it("accepts a current-week payload", () => {
    const weekKey = isoWeekKey();
    const result = validateSubmission({
      weekKey,
      clientId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      displayName: "Jimmy",
      driverName: "Ghost Pace",
      tier: "champion",
      titles: 1,
      wins: 12,
      points: 400,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.entry.displayName).toBe("Jimmy");
      expect(result.entry.tierLabel).toBe("World Champion");
    }
  });

  it("rejects closed weeks and junk stats", () => {
    const badWeek = validateSubmission({
      weekKey: "1999-W01",
      clientId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      displayName: "Jimmy",
      driverName: "Ghost",
      tier: "legend",
      titles: 1,
      wins: 1,
      points: 1,
    });
    expect(badWeek.ok).toBe(false);

    const badStats = validateSubmission({
      weekKey: isoWeekKey(),
      clientId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      displayName: "Jimmy",
      driverName: "Ghost",
      tier: "legend",
      titles: 99,
      wins: 1,
      points: 1,
    });
    expect(badStats.ok).toBe(false);
  });
});
