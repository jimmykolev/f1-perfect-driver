import { describe, expect, it } from "vitest";
import { attrsFromOverall, lockedFromAttrs } from "./game";
import {
  restoreDecisionsSave,
  type DecisionsSave,
} from "./careerSave";

describe("decisions save restore", () => {
  it("replays a seed to the first contract checkpoint", () => {
    const locked = lockedFromAttrs(attrsFromOverall(88));
    const save: DecisionsSave = {
      v: 1,
      locked,
      driverName: "Save Driver",
      selectedSeat: "Williams",
      traits: [],
      startYear: 2024,
      careerSeed: 55,
      careerControl: "decisions",
      choices: [],
      career: null,
      phase: "simulate",
    };

    const restored = restoreDecisionsSave(save);
    expect(restored).not.toBeNull();
    expect(restored!.phase).toBe("simulate");
    expect(restored!.session).not.toBeNull();
    expect(restored!.decision).not.toBeNull();
    expect(restored!.simulatedSeasons.length).toBeGreaterThan(0);
    expect(restored!.simulatedSeasons.length).toBe(
      restored!.decision!.seasonsDone,
    );
  });

  it("applies prior seat choices before pausing again", () => {
    const locked = lockedFromAttrs(attrsFromOverall(90));
    const first = restoreDecisionsSave({
      v: 1,
      locked,
      driverName: "Choice Driver",
      selectedSeat: "McLaren",
      traits: [],
      startYear: 2022,
      careerSeed: 12,
      careerControl: "decisions",
      choices: [],
      career: null,
      phase: "simulate",
    });
    expect(first?.decision).not.toBeNull();
    const pick = first!.decision!.offers[0]!.team;

    const second = restoreDecisionsSave({
      v: 1,
      locked,
      driverName: "Choice Driver",
      selectedSeat: "McLaren",
      traits: [],
      startYear: 2022,
      careerSeed: 12,
      careerControl: "decisions",
      choices: [pick],
      career: null,
      phase: "simulate",
    });

    expect(second).not.toBeNull();
    expect(second!.simulatedSeasons.length).toBeGreaterThan(
      first!.simulatedSeasons.length,
    );
  });
});
