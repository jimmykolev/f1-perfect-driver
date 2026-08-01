import { describe, expect, it } from "vitest";
import { eraFlavorForYear, rulesForYear } from "./f1Meta";

describe("era flavor", () => {
  it("makes classic seasons more chaotic and brittle", () => {
    const classic = eraFlavorForYear(1990);
    const modern = eraFlavorForYear(2026);
    expect(classic.chaosMul).toBeGreaterThan(modern.chaosMul);
    expect(classic.reliabilityMul).toBeLessThan(modern.reliabilityMul);
    expect(rulesForYear(1990).chaosMul).toBe(classic.chaosMul);
  });

  it("labels hybrid and modern buckets clearly", () => {
    expect(eraFlavorForYear(2018).bucket).toBe("hybrid");
    expect(eraFlavorForYear(2026).bucket).toBe("modern");
    expect(eraFlavorForYear(2000).label.length).toBeGreaterThan(3);
  });
});
