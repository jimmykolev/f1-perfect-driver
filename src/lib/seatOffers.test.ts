import { describe, expect, it } from "vitest";
import driverData from "@/data/driverSeasons.json";
import { attrsFromOverall, lockedFromAttrs } from "./game";
import { createWorld, runOffseason, simulateWorldSeason } from "./fieldSim";
import {
  LATEST_START_YEAR,
  TEAM_NAMES_2026,
  rulesForYear,
} from "./f1Meta";
import { allJuniorNames } from "./juniors";
import { mulberry32 } from "./ratings";
import { debutSeatOffers } from "./seatOffers";
import type { DriverDataFile } from "@/types";

const f1Names = new Set(
  (driverData as DriverDataFile).seasons.map((s) => s.name),
);
const realNames = new Set([...f1Names, ...allJuniorNames()]);

describe("debut seat offers", () => {
  it("always orders reach, fit and safe by car quality", () => {
    for (const overall of [60, 68, 76, 84, 92, 99]) {
      const locked = lockedFromAttrs(attrsFromOverall(overall));
      for (let seed = 1; seed <= 100; seed++) {
        const [reach, fit, safe] = debutSeatOffers(locked, seed, "Driver");

        expect(reach?.kind).toBe("reach");
        expect(fit?.kind).toBe("fit");
        expect(safe?.kind).toBe("safe");
        expect(reach!.rank).toBeLessThan(fit!.rank);
        expect(fit!.rank).toBeLessThan(safe!.rank);
      }
    }
  });

  it("can offer every constructor in an appropriate slot", () => {
    const offered = new Set<string>();

    for (const overall of [60, 68, 76, 84, 92, 99]) {
      const locked = lockedFromAttrs(attrsFromOverall(overall));
      for (let seed = 1; seed <= 200; seed++) {
        for (const offer of debutSeatOffers(locked, seed, "Driver")) {
          offered.add(offer.team);
        }
      }
    }

    expect([...offered].sort()).toEqual([...TEAM_NAMES_2026].sort());
  });

  it("gives stronger builds stronger market-fit seats", () => {
    const averageFitRank = (overall: number) => {
      const locked = lockedFromAttrs(attrsFromOverall(overall));
      let total = 0;
      for (let seed = 1; seed <= 200; seed++) {
        total += debutSeatOffers(locked, seed, "Driver")[1]!.rank;
      }
      return total / 200;
    };

    expect(averageFitRank(94)).toBeLessThan(averageFitRank(76));
    expect(averageFitRank(76)).toBeLessThan(averageFitRank(60));
  });

  it("offers historical constructors when starting in a classic year", () => {
    const locked = lockedFromAttrs(attrsFromOverall(84));
    const offered = new Set<string>();
    for (let seed = 1; seed <= 80; seed++) {
      for (const offer of debutSeatOffers(locked, seed, "Driver", 1994)) {
        offered.add(offer.team);
      }
    }
    expect(offered.has("Williams") || offered.has("Benetton")).toBe(true);
    expect(offered.has("Cadillac")).toBe(false);
  });
});

describe("historical worlds", () => {
  it("builds the 1994 grid with that year's calendar and points", () => {
    const world = createWorld(mulberry32(42), 1994);
    const rules = rulesForYear(1994);

    expect(world.year).toBe(1994);
    expect(world.rules.calendar).toEqual(rules.calendar);
    expect(world.rules.calendar).toContain("Pacific GP");
    expect(world.rules.pointsTable[0]).toBe(10);
    expect(world.teams.some((t) => t.name === "Benetton")).toBe(true);
    expect(world.drivers.some((d) => d.name.includes("Schumacher"))).toBe(true);
    expect(
      world.teams.every(
        (team) => world.drivers.filter((d) => d.team === team.name).length === 2,
      ),
    ).toBe(true);
  });

  it("keeps the tuned 2026 constructor set", () => {
    const world = createWorld(mulberry32(1), LATEST_START_YEAR);
    expect(world.teams.map((t) => t.name).sort()).toEqual(
      [...TEAM_NAMES_2026].sort(),
    );
    expect(world.drivers).toHaveLength(22);
  });

  it("advances calendars with the season year", () => {
    const world = createWorld(mulberry32(7), 2021);
    expect(world.rules.calendar.length).toBe(22);
    expect(world.rules.sprintRounds.size).toBeGreaterThan(0);
    world.year = 2022;
    world.rules = rulesForYear(2022);
    expect(world.rules.calendar).toContain("Miami GP");
  });

  it("never invents driver names on the grid or in the junior pool", () => {
    for (const year of [1994, 2014, 2024, 2026]) {
      const world = createWorld(mulberry32(year), year);
      for (const d of world.drivers) {
        expect(realNames.has(d.name)).toBe(true);
      }
      for (const p of world.prospects) {
        expect(realNames.has(p.name)).toBe(true);
      }
    }
  });

  it("rebrands constructors across eras and keeps promoting real juniors", () => {
    const rand = mulberry32(99);
    const world = createWorld(rand, 2024);
    expect(world.teams.some((t) => t.name === "Sauber" || t.name === "Kick Sauber" || t.name === "Audi")).toBe(true);

    // Advance toward 2026 so Audi / Cadillac can appear.
    for (let i = 0; i < 3; i++) {
      const result = simulateWorldSeason(world, rand);
      runOffseason(world, result, rand);
      for (const d of world.drivers) {
        expect(realNames.has(d.name)).toBe(true);
      }
      for (const p of world.prospects) {
        expect(realNames.has(p.name)).toBe(true);
      }
    }

    expect(world.year).toBeGreaterThanOrEqual(2026);
    expect(world.teams.some((t) => t.name === "Audi" || t.name === "Cadillac")).toBe(
      true,
    );
  });
});
