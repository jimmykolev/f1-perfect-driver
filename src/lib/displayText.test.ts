import { describe, expect, it } from "vitest";
import { formatCount, polishDisplayText } from "./displayText";

describe("displayText", () => {
  it("formatCount title-cases count labels", () => {
    expect(formatCount(3, "title")).toBe("3 Titles");
    expect(formatCount(1, "title fight")).toBe("1 Title Fight");
  });

  it("polishDisplayText fixes common F1 phrases", () => {
    expect(polishDisplayText("They became world champion in 2033.")).toBe(
      "They became World Champion in 2033.",
    );
    expect(polishDisplayText("Two world titles across ten seasons.")).toBe(
      "Two World Titles across ten seasons.",
    );
  });
});
