import { describe, expect, it } from "vitest";
import { buildAlternateHistory, hasAlternateHistory } from "./altHistory";
import { attrsFromOverall, lockedFromAttrs, simulateCareer } from "./game";
import {
  LAST_COMPLETED_HISTORY_YEAR,
  LATEST_START_YEAR,
} from "./f1Meta";

function classicCareer(seed: number, startYear: number, overall = 88) {
  return simulateCareer(lockedFromAttrs(attrsFromOverall(overall)), {
    seed,
    playerName: "Test Driver",
    startYear,
    debutTeam: "McLaren",
  });
}

describe("alternate history", () => {
  it("skips modern-only careers", () => {
    const career = simulateCareer(lockedFromAttrs(attrsFromOverall(80)), {
      seed: 11,
      playerName: "Test Driver",
      startYear: LATEST_START_YEAR,
    });
    expect(hasAlternateHistory(career)).toBe(false);
    expect(buildAlternateHistory(career, "Test Driver")).toBeNull();
  });

  it("produces one comparable row per historical season", () => {
    const career = classicCareer(1989, 1989);
    const report = buildAlternateHistory(career, "Test Driver")!;

    expect(report.fromYear).toBe(1989);
    expect(report.years.length).toBe(report.yearsCompared);
    expect(
      report.years.every((y) => y.year <= LAST_COMPLETED_HISTORY_YEAR),
    ).toBe(true);
    expect(report.years.map((y) => y.year)).toEqual(
      [...report.years.map((y) => y.year)].sort((a, b) => a - b),
    );
    for (const row of report.years) {
      expect(row.realChampion).not.toBeNull();
      expect(row.note.length).toBeGreaterThan(20);
    }
  });

  it("never treats the live season as settled history", () => {
    const career = classicCareer(2012, 2012, 92);
    const report = buildAlternateHistory(career, "Test Driver")!;

    expect(report.toYear).toBeLessThanOrEqual(LAST_COMPLETED_HISTORY_YEAR);
    expect(report.years.every((y) => y.year < LATEST_START_YEAR)).toBe(true);
    expect(report.years.some((y) => y.year === LATEST_START_YEAR)).toBe(false);

    // Mid-2026 leaderboard is not a finished championship.
    expect(
      report.years.some(
        (y) => y.realChampion?.name === "Andrea Kimi Antonelli",
      ),
    ).toBe(false);
  });

  it("classifies each year against the real champion", () => {
    const career = classicCareer(1989, 1989);
    const report = buildAlternateHistory(career, "Test Driver")!;

    for (const row of report.years) {
      const changed = row.realChampion!.name !== row.simChampion.name;
      if (!changed) expect(row.status).toBe("held");
      else expect(row.status).toBe(row.playerIsChampion ? "youTook" : "flipped");
    }

    expect(report.titlesRewritten).toBe(
      report.years.filter((y) => y.status !== "held").length,
    );
    expect(report.titlesTaken).toBe(
      report.years.filter((y) => y.status === "youTook").length,
    );
  });

  it("tracks which titles a legend lost, kept, or gained", () => {
    const career = classicCareer(42, 1988, 94);
    const report = buildAlternateHistory(career, "Test Driver")!;

    expect(report.legends.length).toBeGreaterThan(0);
    for (const legend of report.legends) {
      expect(legend.lost.every((y) => !legend.simTitles.includes(y))).toBe(true);
      expect(legend.kept.every((y) => legend.simTitles.includes(y))).toBe(true);
      expect(legend.gained.every((y) => !legend.realTitles.includes(y))).toBe(
        true,
      );
      expect(legend.realTitles.length).toBe(
        legend.lost.length + legend.kept.length,
      );
    }

    // The player only ever appears as a title gainer.
    const player = report.legends.find((l) => l.isPlayer);
    if (player) {
      expect(player.realTitles).toHaveLength(0);
      expect(player.simTitles.length).toBe(career.titles);
    }
  });

  it("names the driver whose seat the player took", () => {
    const career = classicCareer(1989, 1989);
    const report = buildAlternateHistory(career, "Test Driver")!;

    expect(report.fork).not.toBeNull();
    expect(report.fork!.year).toBe(1989);
    expect(report.fork!.team).toBe("McLaren");
    expect(["Alain Prost", "Ayrton Senna"]).toContain(report.fork!.displaced);
    expect(report.fork!.realLineup.map((s) => s.name)).toEqual(
      expect.arrayContaining(["Alain Prost", "Ayrton Senna"]),
    );
  });

  it("writes a ledger and headline that match the numbers", () => {
    const career = classicCareer(7, 1989);
    const report = buildAlternateHistory(career, "Test Driver")!;

    expect(report.ledger.length).toBeGreaterThan(1);
    expect(report.headline.length).toBeGreaterThan(8);
    expect(report.lede.length).toBeGreaterThan(40);
    expect(report.ledger[0]).toContain(`${report.fromYear}`);
  });
});
