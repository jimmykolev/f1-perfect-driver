import {
  advanceCareer,
  beginCareer,
  resolveCareerDecision,
  type CareerControl,
  type CareerSession,
} from "@/lib/careerSession";
import type {
  CareerResult,
  LockedAttribute,
  SignatureTrait,
} from "@/types";

const STORAGE_KEY = "perfect-driver.decisions-v1";

/** Browser save for an in-progress or just-finished decisions-mode career. */
export interface DecisionsSave {
  v: 1;
  locked: LockedAttribute[];
  driverName: string;
  selectedSeat: string | null;
  traits: SignatureTrait[];
  startYear: number;
  careerSeed: number;
  careerControl: Extract<CareerControl, "decisions">;
  /** Teams chosen at each contract checkpoint, in order. */
  choices: string[];
  career: CareerResult | null;
  phase: "simulate" | "career";
  /** Optional so saves created before Challenge mode still restore. */
  activeChallengeId?: string | null;
}

export function clearDecisionsSave() {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* private mode */
  }
}

export function writeDecisionsSave(save: DecisionsSave) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(save));
  } catch {
    /* quota / private mode */
  }
}

export function readDecisionsSave(): DecisionsSave | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DecisionsSave;
    if (parsed?.v !== 1 || parsed.careerControl !== "decisions") return null;
    if (!parsed.locked?.length || parsed.careerSeed == null) return null;
    return parsed;
  } catch {
    return null;
  }
}

export interface RestoredDecisions {
  session: CareerSession | null;
  career: CareerResult | null;
  phase: "simulate" | "career";
  decision: CareerSession["pending"];
  selectedDecisionSeat: string | null;
  simulatedSeasons: CareerResult["seasons"];
  choices: string[];
}

/**
 * Rebuild a decisions-mode career from seed + prior seat choices.
 * Returns null if the save cannot be replayed.
 */
export function restoreDecisionsSave(
  save: DecisionsSave,
): RestoredDecisions | null {
  try {
    if (save.career && save.phase === "career") {
      return {
        session: null,
        career: save.career,
        phase: "career",
        decision: null,
        selectedDecisionSeat: null,
        simulatedSeasons: [],
        choices: save.choices,
      };
    }

    if (save.career && save.phase === "simulate") {
      return {
        session: null,
        career: save.career,
        phase: "simulate",
        decision: null,
        selectedDecisionSeat: null,
        simulatedSeasons: [...save.career.seasons],
        choices: save.choices,
      };
    }

    const session = beginCareer({
      locked: save.locked,
      seed: save.careerSeed,
      playerName: save.driverName || "Driver",
      debutTeam: save.selectedSeat,
      traits: save.traits,
      startYear: save.startYear,
      control: "decisions",
    });

    let result = advanceCareer(session);
    for (const choice of save.choices) {
      if (!session.pending) break;
      result = resolveCareerDecision(session, choice);
    }

    if (result) {
      return {
        session: null,
        career: result,
        phase: "simulate",
        decision: null,
        selectedDecisionSeat: null,
        simulatedSeasons: [...result.seasons],
        choices: save.choices,
      };
    }

    const stay =
      session.pending?.offers.find((o) => o.kind === "stay")?.id ??
      session.pending?.offers[0]?.id ??
      null;

    return {
      session,
      career: null,
      phase: "simulate",
      decision: session.pending,
      selectedDecisionSeat: stay,
      simulatedSeasons: [...session.seasons],
      choices: save.choices,
    };
  } catch {
    return null;
  }
}
