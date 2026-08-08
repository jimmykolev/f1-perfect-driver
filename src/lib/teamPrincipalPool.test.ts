import { describe, expect, it } from "vitest";
import {
  PRINCIPAL_ATTRIBUTE_KEYS,
  buildPrincipalPool,
  derivePrincipalAttributes,
  pickPrincipal,
  principalOverall,
  resetPrincipalPoolCache,
} from "@/lib/teamPrincipalPool";

describe("teamPrincipalPool", () => {
  it("derives attributes in the 55–99 band", () => {
    const elite = derivePrincipalAttributes([
      {
        team: "Mercedes",
        year: 2016,
        rank: 1,
        fieldSize: 10,
        points: 700,
        wins: 18,
        starts: 40,
        dnfs: 2,
        bestOverall: 96,
      },
      {
        team: "Mercedes",
        year: 2017,
        rank: 1,
        fieldSize: 10,
        points: 650,
        wins: 12,
        starts: 40,
        dnfs: 3,
        bestOverall: 95,
      },
    ]);
    for (const key of PRINCIPAL_ATTRIBUTE_KEYS) {
      expect(elite[key]).toBeGreaterThanOrEqual(55);
      expect(elite[key]).toBeLessThanOrEqual(99);
    }
    expect(principalOverall(elite)).toBeGreaterThanOrEqual(80);

    const back = derivePrincipalAttributes([
      {
        team: "HRT",
        year: 2011,
        rank: 12,
        fieldSize: 12,
        points: 0,
        wins: 0,
        starts: 38,
        dnfs: 12,
        bestOverall: 58,
      },
    ]);
    expect(principalOverall(back)).toBeLessThan(principalOverall(elite));
  });

  it("builds a real-name pool from tenures with constructor joins", () => {
    resetPrincipalPoolCache();
    const pool = buildPrincipalPool();
    expect(pool.length).toBeGreaterThanOrEqual(40);
    const ids = new Set(pool.map((p) => p.id));
    expect(ids.size).toBe(pool.length);

    const wolff = pool.find((p) => p.id === "toto-wolff");
    expect(wolff).toBeTruthy();
    expect(wolff!.name).toBe("Toto Wolff");
    expect(wolff!.teams).toContain("Mercedes");
    expect(wolff!.overall).toBeGreaterThanOrEqual(75);

    const horner = pool.find((p) => p.id === "christian-horner");
    expect(horner).toBeTruthy();
    expect(horner!.overall).toBeGreaterThanOrEqual(75);
  });

  it("avoids reusing principals when possible", () => {
    resetPrincipalPoolCache();
    const pool = buildPrincipalPool();
    const first = pickPrincipal(pool, []);
    const second = pickPrincipal(pool, [first.id]);
    expect(second.id).not.toBe(first.id);
  });
});
