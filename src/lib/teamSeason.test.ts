import { describe, expect, it } from "vitest";
import { driversForTeam } from "@/lib/fieldSim";
import { mulberry32 } from "@/lib/ratings";
import { rulesForYear } from "@/lib/f1Meta";
import {
  buildTeamWorld,
  carAttrsToBlueprint,
  carAttrsToChaseInject,
  simulateTeamSeasonChase,
} from "@/lib/teamSeason";
import type { DriverSeason } from "@/types";

function fakeSeason(
  name: string,
  overall: number,
  overrides: Partial<DriverSeason> = {},
): DriverSeason {
  const attr = Math.min(99, Math.max(55, overall));
  return {
    year: 2024,
    id: name.toLowerCase().replace(/\s+/g, "-"),
    driverId: name.length * 97,
    name,
    slug: name.toLowerCase().replace(/\s+/g, "-"),
    team: "McLaren",
    position: 3,
    points: 200,
    races: 24,
    wins: 2,
    poles: 1,
    podiums: 8,
    fastestLaps: 1,
    dnfs: 1,
    sharpRating: overall,
    sharpChange: 0,
    image: null,
    attributes: {
      qualifying: attr,
      racePace: attr,
      raceCraft: attr,
      frontRunning: attr,
      scoring: attr,
      mentality: attr,
      reliability: attr,
      momentum: attr,
    },
    overall,
    ...overrides,
  };
}

describe("teamSeason", () => {
  it("maps car attrs into blueprint bands", () => {
    const elite = carAttrsToBlueprint({
      aerodynamics: 96,
      chassis: 94,
      powertrain: 95,
      durability: 93,
    });
    expect(elite.power).toBeGreaterThanOrEqual(85);
    expect(elite.power).toBeLessThanOrEqual(96);
    expect(elite.reliability).toBeGreaterThanOrEqual(0.8);
    expect(elite.reliability).toBeLessThanOrEqual(0.92);

    const back = carAttrsToBlueprint({
      aerodynamics: 58,
      chassis: 56,
      powertrain: 57,
      durability: 55,
    });
    expect(back.power).toBeLessThan(elite.power);
    expect(back.reliability).toBeLessThanOrEqual(elite.reliability);
  });

  it("chase inject sits above historical blueprint ceiling", () => {
    const car = {
      aerodynamics: 90,
      chassis: 88,
      powertrain: 91,
      durability: 86,
    };
    const base = carAttrsToBlueprint(car);
    const chase = carAttrsToChaseInject(car);
    expect(chase.power).toBeGreaterThan(base.power);
    expect(chase.reliability).toBeGreaterThan(base.reliability);
    expect(chase.power).toBeGreaterThan(96);
  });

  it("injects a two-seat player team and dedups names", () => {
    const first = fakeSeason("Max Verstappen", 96);
    const second = fakeSeason("Lando Norris", 92);
    const { world, playerTeam, firstId, secondId } = buildTeamWorld({
      teamName: "Apex Racing",
      car: {
        aerodynamics: 90,
        chassis: 88,
        powertrain: 91,
        durability: 86,
      },
      first,
      second,
      year: 2024,
      rand: mulberry32(42),
    });

    expect(playerTeam).toBe("Apex Racing");
    const seats = driversForTeam(world, playerTeam);
    expect(seats).toHaveLength(2);
    expect(seats.map((d) => d.id).sort()).toEqual([firstId, secondId].sort());
    expect(world.drivers.filter((d) => d.name === "Max Verstappen")).toHaveLength(
      1,
    );
    expect(world.drivers.filter((d) => d.name === "Lando Norris")).toHaveLength(
      1,
    );
    expect(world.rules.calendar.length).toBe(rulesForYear(2024).calendar.length);
  });

  it("runs a chase season with win tally and perfect flag", () => {
    const result = simulateTeamSeasonChase({
      teamName: "Apex Racing",
      car: {
        aerodynamics: 99,
        chassis: 99,
        powertrain: 99,
        durability: 99,
      },
      first: fakeSeason("Max Verstappen", 99),
      second: fakeSeason("Charles Leclerc", 95),
      reserve: fakeSeason("Oscar Piastri", 88),
      principal: {
        id: "tp-test",
        name: "Test Principal",
        attributes: { leadership: 90, strategy: 88, development: 86 },
        overall: 88,
        teams: ["Apex"],
        startYear: 2010,
        endYear: 2020,
        peakTeam: "Apex",
        peakYear: 2015,
        yearsLed: 11,
      },
      year: 2024,
      rand: mulberry32(7),
    });

    expect(result.calendarLength).toBe(rulesForYear(2024).calendar.length);
    expect(result.races).toHaveLength(result.calendarLength);
    expect(result.teamWins).toBeGreaterThanOrEqual(0);
    expect(result.teamWins).toBeLessThanOrEqual(result.calendarLength);
    expect(result.perfect).toBe(
      result.brokenAtRound == null &&
        result.teamWins === result.calendarLength,
    );
    expect(result.gradeLabel).toBeTruthy();
    expect(result.summary).toBeTruthy();
    expect(result.races.every((r) => r.beat.length > 0)).toBe(true);
    expect(result.principalName).toBe("Test Principal");
    if (!result.perfect) {
      expect(result.brokenAtRound).toBeGreaterThanOrEqual(1);
      expect(result.races[result.brokenAtRound! - 1]!.teamWon).toBe(false);
    }
  });
});
