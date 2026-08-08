import { describe, expect, it } from "vitest";
import { isEligibleSeason } from "@/lib/era";
import data from "@/data/driverSeasons.json";
import type { DriverDataFile } from "@/types";
import {
  CAR_ATTRIBUTE_KEYS,
  buildConstructorSeasonPool,
  carOverall,
  deriveCarAttributes,
  pickConstructorSeason,
  pickDriverSeasonForSeat,
  remainingCarAttributes,
} from "@/lib/teamCarPool";

const eligible = (data as DriverDataFile).seasons.filter(isEligibleSeason);

describe("teamCarPool", () => {
  it("derives car attributes in the 55–99 band", () => {
    const attrs = deriveCarAttributes({
      power: 94,
      reliability: 0.9,
      resources: 0.95,
      bestOverall: 96,
    });
    for (const key of CAR_ATTRIBUTE_KEYS) {
      expect(attrs[key]).toBeGreaterThanOrEqual(55);
      expect(attrs[key]).toBeLessThanOrEqual(99);
    }
    expect(carOverall(attrs)).toBeGreaterThanOrEqual(55);
  });

  it("builds unique team-year cards", () => {
    const pool = buildConstructorSeasonPool();
    expect(pool.length).toBeGreaterThan(100);
    const ids = new Set(pool.map((c) => c.id));
    expect(ids.size).toBe(pool.length);
    for (const card of pool.slice(0, 40)) {
      expect(card.team.length).toBeGreaterThan(0);
      expect(card.year).toBeGreaterThanOrEqual(1988);
      expect(remainingCarAttributes([]).length).toBe(4);
    }
  });

  it("avoids reusing constructor cards when possible", () => {
    const pool = buildConstructorSeasonPool();
    const first = pickConstructorSeason(pool, []);
    const second = pickConstructorSeason(pool, [first.id]);
    expect(second.id).not.toBe(first.id);
  });

  it("avoids reusing drivers across seats when possible", () => {
    const first = pickDriverSeasonForSeat(eligible, []);
    const second = pickDriverSeasonForSeat(eligible, [first.driverId]);
    expect(second.driverId).not.toBe(first.driverId);
  });

  it("lists remaining car attributes", () => {
    expect(remainingCarAttributes(["aerodynamics", "chassis"])).toEqual([
      "powertrain",
      "durability",
    ]);
  });
});
