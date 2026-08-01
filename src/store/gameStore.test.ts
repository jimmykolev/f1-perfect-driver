import { describe, expect, it, beforeEach } from "vitest";
import { attrsFromOverall, lockedFromAttrs } from "@/lib/game";
import { deriveTraits } from "@/lib/traits";
import { useGameStore } from "@/store/gameStore";

function primeForSimulate(
  careerControl: "autopilot" | "decisions",
  seed = 42,
) {
  const locked = lockedFromAttrs(attrsFromOverall(86));
  useGameStore.setState({
    locked,
    driverName: "Test Driver",
    selectedSeat: "Williams",
    careerSeed: seed,
    startYear: 2024,
    traits: deriveTraits(locked),
    careerControl,
    phase: "seat",
  });
}

describe("gameStore career phases", () => {
  beforeEach(() => {
    useGameStore.getState().reset();
  });

  it("autopilot simulate lands in replay phase with full season log", () => {
    primeForSimulate("autopilot");
    useGameStore.getState().simulate();

    const state = useGameStore.getState();
    expect(state.phase).toBe("simulate");
    expect(state.career).not.toBeNull();
    expect(state.simulatedSeasons.length).toBeGreaterThan(0);
    expect(state.simulatedSeasons.length).toBe(state.career!.seasons.length);
    expect(state.decision).toBeNull();
  });

  it("autopilot finishSimulation opens the career verdict", () => {
    primeForSimulate("autopilot");
    useGameStore.getState().simulate();
    useGameStore.getState().finishSimulation();

    const state = useGameStore.getState();
    expect(state.phase).toBe("career");
    expect(state.career).not.toBeNull();
  });

  it("decisions simulate pauses with a checkpoint when career is incomplete", () => {
    primeForSimulate("decisions", 77);
    useGameStore.getState().simulate();

    const state = useGameStore.getState();
    expect(state.phase).toBe("simulate");
    expect(state.career).toBeNull();
    expect(state.decision).not.toBeNull();
    expect(state.simulatedSeasons.length).toBeGreaterThan(0);
  });

  it("decisions finishSimulation still opens verdict when career is complete", () => {
    primeForSimulate("decisions", 101);
    const store = useGameStore.getState();
    store.simulate();

    let guards = 0;
    while (useGameStore.getState().decision && guards < 12) {
      const { decision, selectedDecisionSeat } = useGameStore.getState();
      if (!decision || !selectedDecisionSeat) break;
      useGameStore.getState().resolveDecision();
      guards++;
    }

    expect(useGameStore.getState().career).not.toBeNull();
    useGameStore.getState().finishSimulation();
    expect(useGameStore.getState().phase).toBe("career");
  });
});
