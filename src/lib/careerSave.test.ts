import { describe, expect, it } from "vitest";
import { attrsFromOverall, lockedFromAttrs } from "./game";
import { beginCareer } from "./careerSession";
import {
  buildDecisionsSaveFromSession,
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

  it("round-trips decision density through save", () => {
    const locked = lockedFromAttrs(attrsFromOverall(87));
    const session = beginCareer({
      locked,
      seed: 33,
      playerName: "Density",
      debutTeam: "Williams",
      startYear: 2024,
      control: "decisions",
      decisionDensity: "low",
    });
    session.decisionHistory.push({
      packId: "winterMarket:s3",
      trigger: "winterMarket",
      storyKind: "winterMarket",
      domain: "seat",
      year: session.world.year,
    });

    const save = buildDecisionsSaveFromSession(session, {
      v: 1,
      locked,
      driverName: "Density",
      selectedSeat: "Williams",
      traits: [],
      startYear: 2024,
      careerSeed: 33,
      careerControl: "decisions",
      choices: [],
      career: null,
      phase: "simulate",
    });

    expect(save.decisionDensity).toBe("low");
    expect(save.decisionHistory?.length).toBe(1);

    const restored = restoreDecisionsSave({
      ...save,
      choices: [],
      career: null,
      phase: "simulate",
    });
    expect(restored?.session?.decisionDensity).toBe("low");
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
    const pick =
      first!.decision!.offers.find((o) => o.kind === "stay")?.id ??
      first!.decision!.pack.options.find((o) => o.kind === "stay")?.id;
    expect(pick).toBeTruthy();

    const second = restoreDecisionsSave({
      v: 1,
      locked,
      driverName: "Choice Driver",
      selectedSeat: "McLaren",
      traits: [],
      startYear: 2022,
      careerSeed: 12,
      careerControl: "decisions",
      choices: [pick!],
      career: null,
      phase: "simulate",
    });

    expect(second).not.toBeNull();
    expect(second!.simulatedSeasons.length).toBeGreaterThanOrEqual(
      first!.simulatedSeasons.length,
    );
    expect(second!.choices.length).toBe(1);
  });
});
