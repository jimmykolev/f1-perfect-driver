import { describe, expect, it } from "vitest";
import { pickAutoDraftAttribute } from "./autoDraft";
import type { DriverSeason } from "@/types";

const season = {
  attributes: {
    qualifying: 88,
    racePace: 94,
    raceCraft: 90,
    frontRunning: 86,
    scoring: 92,
    mentality: 91,
    reliability: 84,
    momentum: 89,
  },
} as DriverSeason;

describe("pickAutoDraftAttribute", () => {
  it("chooses the highest-value attribute that is not locked", () => {
    expect(pickAutoDraftAttribute(season, [])).toBe("racePace");
    expect(pickAutoDraftAttribute(season, ["racePace", "scoring"])).toBe(
      "mentality",
    );
  });

  it("uses attribute order to break rating ties", () => {
    const tied = {
      ...season,
      attributes: { ...season.attributes, qualifying: 94 },
    };

    expect(pickAutoDraftAttribute(tied, [])).toBe("qualifying");
  });

  it("returns null when every attribute is locked", () => {
    expect(
      pickAutoDraftAttribute(season, [
        "qualifying",
        "racePace",
        "raceCraft",
        "frontRunning",
        "scoring",
        "mentality",
        "reliability",
        "momentum",
      ]),
    ).toBeNull();
  });
});
