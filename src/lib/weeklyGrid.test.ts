import { describe, expect, it } from "vitest";
import { isEligibleSeason } from "./era";
import {
  WEEKLY_GRID_SIZE,
  buildWeeklyGrid,
  hashWeekKey,
  isoWeekKey,
  weeklyShareLine,
} from "./weeklyGrid";
import type { DriverSeason } from "@/types";
import data from "@/data/driverSeasons.json";
import type { DriverDataFile } from "@/types";

const eligible = (data as DriverDataFile).seasons.filter(isEligibleSeason);

function fakeSeason(id: string, year: number): DriverSeason {
  return {
    id,
    driverId: 1,
    name: id,
    slug: id,
    year,
    team: "Test",
    races: 10,
    wins: 0,
    podiums: 0,
    poles: 0,
    points: 0,
    position: 5,
    dnfs: 0,
    fastestLaps: 0,
    sharpRating: 0,
    sharpChange: 0,
    image: null,
    attributes: {
      qualifying: 70,
      racePace: 70,
      raceCraft: 70,
      frontRunning: 70,
      scoring: 70,
      mentality: 70,
      reliability: 70,
      momentum: 70,
    },
    overall: 70,
  };
}

describe("weekly grid", () => {
  it("uses stable ISO week keys", () => {
    // 2026-08-07 is a Friday in ISO week 32
    expect(isoWeekKey(new Date(2026, 7, 7))).toBe("2026-W32");
    expect(isoWeekKey(new Date(2026, 7, 3))).toBe("2026-W32"); // Monday
  });

  it("hashes week keys deterministically", () => {
    expect(hashWeekKey("2026-W32")).toBe(hashWeekKey("2026-W32"));
    expect(hashWeekKey("2026-W32")).not.toBe(hashWeekKey("2026-W33"));
  });

  it("builds the same 8-season grid for the same week", () => {
    const date = new Date(2026, 7, 7);
    const a = buildWeeklyGrid(eligible, date);
    const b = buildWeeklyGrid(eligible, date);
    expect(a.weekKey).toBe("2026-W32");
    expect(a.seasons).toHaveLength(WEEKLY_GRID_SIZE);
    expect(a.seasons.map((s) => s.id)).toEqual(b.seasons.map((s) => s.id));
    expect(new Set(a.seasons.map((s) => s.id)).size).toBe(WEEKLY_GRID_SIZE);
  });

  it("changes the grid between weeks", () => {
    const weekA = buildWeeklyGrid(eligible, new Date(2026, 7, 7));
    const weekB = buildWeeklyGrid(eligible, new Date(2026, 7, 14));
    expect(weekA.weekKey).not.toBe(weekB.weekKey);
    expect(weekA.seasons.map((s) => s.id)).not.toEqual(
      weekB.seasons.map((s) => s.id),
    );
  });

  it("mixes classic and modern seasons when both exist", () => {
    const pool = [
      ...Array.from({ length: 10 }, (_, i) =>
        fakeSeason(`classic-${i}`, 1998 + i),
      ),
      ...Array.from({ length: 10 }, (_, i) =>
        fakeSeason(`modern-${i}`, 2018 + (i % 6)),
      ),
    ];
    const grid = buildWeeklyGrid(pool, new Date(2026, 7, 7));
    const classic = grid.seasons.filter((s) => s.year < 2014).length;
    const modern = grid.seasons.filter((s) => s.year >= 2014).length;
    expect(classic).toBe(3);
    expect(modern).toBe(5);
  });

  it("formats a share line", () => {
    expect(weeklyShareLine("2026-W32")).toBe("Weekly Grid · 2026-W32");
    expect(weeklyShareLine(null)).toBeNull();
  });
});
