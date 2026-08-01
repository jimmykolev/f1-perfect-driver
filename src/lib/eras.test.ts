import { describe, expect, it } from "vitest";
import juniorData from "@/data/juniorDrivers.json";
import seasonData from "@/data/driverSeasons.json";
import birthData from "@/data/driverBirthDates.json";
import { createWorld, runOffseason, simulateWorldSeason } from "./fieldSim";
import {
  attrsFromOverall,
  lockedFromAttrs,
  mulberry32,
  simulateCareer,
} from "./game";
import type { DriverDataFile } from "@/types";

const REAL_NAMES = new Set<string>([
  ...(seasonData as DriverDataFile).seasons.map((s) => s.name),
  ...(juniorData as { drivers: { name: string }[] }).drivers.map((j) =>
    j.name.replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+/g, " ").trim(),
  ),
]);

const BIRTH_DATES = (birthData as { birthDates: Record<string, string> })
  .birthDates;

const ERAS = [1988, 1994, 2003, 2012, 2021, 2026];

describe.each(ERAS)("%i grid", (year) => {
  it("seats each driver exactly once, on a full grid", () => {
    const rand = mulberry32(year);
    const world = createWorld(rand, year);

    const names = world.drivers.map((d) => d.name);
    expect(new Set(names).size).toBe(names.length);

    const ids = world.drivers.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);

    for (const team of world.teams) {
      expect(world.drivers.filter((d) => d.team === team.name)).toHaveLength(2);
    }
  });

  it("uses only real drivers and their real ages", () => {
    const rand = mulberry32(year + 1);
    const world = createWorld(rand, year);

    for (const d of world.drivers) {
      expect(REAL_NAMES).toContain(d.name);
      const born = BIRTH_DATES[d.name];
      if (born) {
        expect(Math.abs(d.age - (year - Number(born.slice(0, 4))))).toBeLessThanOrEqual(1);
      }
    }

    // A grid where everyone shares an age means ages are being guessed.
    expect(new Set(world.drivers.map((d) => d.age)).size).toBeGreaterThan(5);
  });

  it("never duplicates a driver in the standings, season after season", () => {
    const rand = mulberry32(year + 2);
    const world = createWorld(rand, year);

    for (let i = 0; i < 15; i++) {
      const result = simulateWorldSeason(world, rand);
      const names = result.standings.map((s) => s.name);
      expect(new Set(names).size).toBe(names.length);
      runOffseason(world, result, rand);
      for (const team of world.teams) {
        expect(world.drivers.filter((d) => d.team === team.name)).toHaveLength(
          2,
        );
      }
    }
  });
});

describe("careers across eras", () => {
  it.each(ERAS)("keeps %i careers free of invented and duplicated drivers", (year) => {
    const career = simulateCareer(lockedFromAttrs(attrsFromOverall(80)), {
      seed: year * 31,
      playerName: "Test Driver",
      startYear: year,
    });

    expect(career.seasons.length).toBeGreaterThan(0);
    for (const season of career.seasons) {
      const names = season.standings.map((s) => s.name);
      expect(new Set(names).size).toBe(names.length);
      for (const row of season.standings) {
        if (!row.isPlayer) expect(REAL_NAMES).toContain(row.name);
      }
    }
  });
});
