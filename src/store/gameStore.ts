import { create } from "zustand";
import data from "@/data/driverSeasons.json";
import { maxBuildFromPool } from "@/lib/adminBuild";
import { isEligibleSeason, isLegendSeason } from "@/lib/era";
import {
  pickRandom,
  remainingAttributes,
} from "@/lib/game";
import { computePartialOverall } from "@/lib/ratings";
import { debutSeatOffers } from "@/lib/seatOffers";
import { deriveTraits } from "@/lib/traits";
import { LATEST_START_YEAR } from "@/lib/f1Meta";
import {
  advanceCareer,
  beginCareer,
  resolveCareerDecision,
  runAutopilot,
  type CareerControl,
  type CareerSession,
  type DecisionSnapshot,
} from "@/lib/careerSession";
import {
  clearDecisionsSave,
  readDecisionsSave,
  restoreDecisionsSave,
  writeDecisionsSave,
  type DecisionsSave,
} from "@/lib/careerSave";
import type {
  AttributeKey,
  CareerResult,
  DriverDataFile,
  DriverSeason,
  LockedAttribute,
  SeasonResult,
  SeatOffer,
  SignatureTrait,
} from "@/types";

const dataset = data as DriverDataFile;

/** Live session while decisions mode is mid-career. Not in Zustand (holds RNG/world). */
let liveSession: CareerSession | null = null;

function clearLiveSession() {
  liveSession = null;
}

function persistDecisionsFrom(
  state: Pick<
    GameState,
    | "locked"
    | "driverName"
    | "selectedSeat"
    | "traits"
    | "startYear"
    | "careerSeed"
    | "careerControl"
    | "decisionChoices"
    | "career"
    | "phase"
  >,
) {
  if (state.careerControl !== "decisions") return;
  if (state.phase !== "simulate" && state.phase !== "career") return;
  if (state.careerSeed == null || state.locked.length < 8) return;

  const save: DecisionsSave = {
    v: 1,
    locked: state.locked,
    driverName: state.driverName,
    selectedSeat: state.selectedSeat,
    traits: state.traits,
    startYear: state.startYear,
    careerSeed: state.careerSeed,
    careerControl: "decisions",
    choices: state.decisionChoices,
    career: state.career,
    phase: state.phase === "career" ? "career" : "simulate",
  };
  writeDecisionsSave(save);
}

/** Session-only: URL ?admin=1 turns it on; Landing toggle does not persist. */
function readAdminFlag() {
  if (typeof window === "undefined") return false;
  try {
    return new URLSearchParams(window.location.search).get("admin") === "1";
  } catch {
    return false;
  }
}

/** Session-only: URL ?expert=1 turns it on; mutually exclusive with admin. */
function readExpertFlag() {
  if (typeof window === "undefined") return false;
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get("admin") === "1") return false;
    return params.get("expert") === "1";
  } catch {
    return false;
  }
}

export type Phase =
  | "landing"
  | "draft"
  | "reveal"
  | "era"
  | "seat"
  | "simulate"
  | "career";

interface GameState {
  phase: Phase;
  driverName: string;
  pool: DriverSeason[];
  locked: LockedAttribute[];
  current: DriverSeason | null;
  spinning: boolean;
  passesLeft: number;
  career: CareerResult | null;
  usedSeasonIds: string[];
  adminMode: boolean;
  expertMode: boolean;
  /** One-shot riskier spin this draft. */
  challengeSpinAvailable: boolean;
  challengeSpinActive: boolean;
  lastSpinWasLegend: boolean;
  nearMiss: boolean;
  careerSeed: number | null;
  /** Season the career begins in. */
  startYear: number;
  seatOffers: SeatOffer[];
  selectedSeat: string | null;
  traits: SignatureTrait[];
  /** Autopilot (default) or pause for mid-career seat choices. */
  careerControl: CareerControl;
  /** Active mid-career decision, when phase is decide. */
  decision: DecisionSnapshot | null;
  selectedDecisionSeat: string | null;
  /** Seasons already calculated for the visible decisions-mode timeline. */
  simulatedSeasons: SeasonResult[];
  /** Seat teams chosen at each decisions-mode checkpoint (for save/resume). */
  decisionChoices: string[];

  setName: (name: string) => void;
  setAdminMode: (on: boolean) => void;
  setExpertMode: (on: boolean) => void;
  setCareerControl: (control: CareerControl) => void;
  start: () => void;
  spin: () => void;
  activateChallengeSpin: () => void;
  finishSpin: (season: DriverSeason) => void;
  pickAttribute: (key: AttributeKey) => void;
  pass: () => void;
  goToEraChoice: () => void;
  confirmStartYear: (year: number) => void;
  selectSeat: (team: string) => void;
  selectDecisionSeat: (team: string) => void;
  simulate: () => void;
  resolveDecision: () => void;
  finishSimulation: () => void;
  rematch: () => void;
  reset: () => void;
  openSlots: () => AttributeKey[];
  buildOverall: () => number;

  adminLock: (key: AttributeKey, season: DriverSeason) => void;
  adminUnlock: (key: AttributeKey) => void;
  adminClear: () => void;
  adminMaxBuild: () => void;
  adminFinish: () => void;
}

function freshPool() {
  return dataset.seasons.filter(isEligibleSeason);
}

function applyLocked(next: LockedAttribute[], stayInDraft: boolean) {
  if (next.length >= 8 && !stayInDraft) {
    return {
      locked: next,
      current: null as DriverSeason | null,
      phase: "reveal" as Phase,
      traits: deriveTraits(next),
    };
  }
  return { locked: next, current: null as DriverSeason | null };
}

function challengePool(pool: DriverSeason[]) {
  const hard = pool.filter(
    (s) => s.overall < 78 || isLegendSeason(s.year, s.name),
  );
  return hard.length >= 8 ? hard : pool;
}

function applySessionResult(
  session: CareerSession,
  result: CareerResult | null,
): Pick<
  GameState,
  | "phase"
  | "career"
  | "decision"
  | "selectedDecisionSeat"
  | "simulatedSeasons"
> {
  if (result) {
    clearLiveSession();
    return {
      phase: "simulate",
      career: result,
      decision: null,
      selectedDecisionSeat: null,
      simulatedSeasons: [...result.seasons],
    };
  }
  liveSession = session;
  const stay =
    session.pending?.offers.find((o) => o.kind === "stay")?.team ??
    session.pending?.offers[0]?.team ??
    null;
  return {
    phase: "simulate",
    career: null,
    decision: session.pending,
    selectedDecisionSeat: stay,
    simulatedSeasons: [...session.seasons],
  };
}

let spinTimer: number | null = null;

export const useGameStore = create<GameState>((set, get) => ({
  phase: "landing",
  driverName: "",
  pool: freshPool(),
  locked: [],
  current: null,
  spinning: false,
  passesLeft: 3,
  career: null,
  usedSeasonIds: [],
  adminMode: readAdminFlag(),
  expertMode: readExpertFlag(),
  challengeSpinAvailable: true,
  challengeSpinActive: false,
  lastSpinWasLegend: false,
  nearMiss: false,
  careerSeed: null,
  startYear: LATEST_START_YEAR,
  seatOffers: [],
  selectedSeat: null,
  traits: [],
  careerControl: "autopilot",
  decision: null,
  selectedDecisionSeat: null,
  simulatedSeasons: [],
  decisionChoices: [],

  setName: (name) => set({ driverName: name }),

  setAdminMode: (on) =>
    set(on ? { adminMode: true, expertMode: false } : { adminMode: false }),

  setExpertMode: (on) =>
    set(on ? { expertMode: true, adminMode: false } : { expertMode: false }),

  setCareerControl: (control) => set({ careerControl: control }),

  start: () => {
    if (spinTimer != null) {
      window.clearTimeout(spinTimer);
      spinTimer = null;
    }
    clearLiveSession();
    clearDecisionsSave();
    set({
      phase: "draft",
      locked: [],
      current: null,
      spinning: false,
      decisionChoices: [],
      passesLeft: 3,
      career: null,
      usedSeasonIds: [],
      pool: freshPool(),
      challengeSpinAvailable: true,
      challengeSpinActive: false,
      lastSpinWasLegend: false,
      nearMiss: false,
      careerSeed: null,
      startYear: LATEST_START_YEAR,
      seatOffers: [],
      selectedSeat: null,
      traits: [],
      careerControl: "autopilot",
      decision: null,
      selectedDecisionSeat: null,
      simulatedSeasons: [],
    });
  },

  activateChallengeSpin: () => {
    if (!get().challengeSpinAvailable || get().spinning || get().current) {
      return;
    }
    set({ challengeSpinActive: true });
  },

  spin: () => {
    const {
      pool,
      usedSeasonIds,
      locked,
      challengeSpinActive,
      challengeSpinAvailable,
      lastSpinWasLegend,
    } = get();
    if (locked.length >= 8) return;

    const base = challengeSpinActive ? challengePool(pool) : pool;
    const available = base.filter((s) => !usedSeasonIds.includes(s.id));
    const source = available.length ? available : base;
    const season = pickRandom(source);

    set({
      spinning: true,
      current: null,
      nearMiss: false,
      challengeSpinAvailable: challengeSpinActive
        ? false
        : challengeSpinAvailable,
    });

    if (spinTimer != null) window.clearTimeout(spinTimer);
    spinTimer = window.setTimeout(() => {
      spinTimer = null;
      const wasChallenge = get().challengeSpinActive;
      get().finishSpin(season);
      set({
        challengeSpinActive: false,
        nearMiss:
          lastSpinWasLegend && !isLegendSeason(season.year, season.name),
      });
      void wasChallenge;
    }, 1400);
  },

  finishSpin: (season) => {
    if (get().phase !== "draft") return;
    set({
      spinning: false,
      current: season,
      usedSeasonIds: [...get().usedSeasonIds, season.id],
      lastSpinWasLegend: isLegendSeason(season.year, season.name),
    });
  },

  pickAttribute: (key) => {
    const { current, locked } = get();
    if (!current) return;
    if (locked.some((l) => l.key === key)) return;
    if (!(key in current.attributes)) return;

    const next: LockedAttribute[] = [
      ...locked,
      { key, value: current.attributes[key], from: current },
    ];

    set({ ...applyLocked(next, false), nearMiss: false });
  },

  pass: () => {
    const { passesLeft, current, spinning } = get();
    if (spinning || !current || passesLeft <= 0) return;
    set({ passesLeft: passesLeft - 1, current: null, nearMiss: false });
  },

  goToEraChoice: () => {
    const { locked } = get();
    if (locked.length < 8) return;
    set({
      phase: "era",
      traits: deriveTraits(locked),
      seatOffers: [],
      selectedSeat: null,
    });
  },

  confirmStartYear: (year) => {
    const { locked, driverName } = get();
    if (locked.length < 8) return;
    const seed = Date.now();
    const offers = debutSeatOffers(
      locked,
      seed,
      driverName || "Driver",
      year,
    );
    set({
      phase: "seat",
      startYear: year,
      careerSeed: seed,
      seatOffers: offers,
      selectedSeat:
        offers.find((o) => o.kind === "fit")?.team ?? offers[0]?.team ?? null,
      traits: deriveTraits(locked),
    });
  },

  selectSeat: (team) => set({ selectedSeat: team }),

  selectDecisionSeat: (team) => set({ selectedDecisionSeat: team }),

  simulate: () => {
    const {
      locked,
      driverName,
      selectedSeat,
      careerSeed,
      traits,
      startYear,
      careerControl,
    } = get();
    if (locked.length < 8) return;
    const seed = careerSeed ?? Date.now();
    clearLiveSession();
    const session = beginCareer({
      locked,
      seed,
      playerName: driverName || "Driver",
      debutTeam: selectedSeat,
      traits,
      startYear,
      control: careerControl,
    });

    if (careerControl === "autopilot") {
      clearDecisionsSave();
      const career = runAutopilot(session);
      set({
        career,
        phase: "career",
        careerSeed: seed,
        decision: null,
        simulatedSeasons: [],
        decisionChoices: [],
      });
      return;
    }

    const result = advanceCareer(session);
    const next = {
      careerSeed: seed,
      decisionChoices: [] as string[],
      ...applySessionResult(session, result),
    };
    set(next);
    persistDecisionsFrom({ ...get(), ...next });
  },

  resolveDecision: () => {
    const { selectedDecisionSeat, decision, decisionChoices } = get();
    if (!liveSession || !decision || !selectedDecisionSeat) return;
    const result = resolveCareerDecision(liveSession, selectedDecisionSeat);
    const choices = [...decisionChoices, selectedDecisionSeat];
    const next = {
      decisionChoices: choices,
      ...applySessionResult(liveSession, result),
    };
    set(next);
    persistDecisionsFrom({ ...get(), ...next });
  },

  finishSimulation: () => {
    if (!get().career) return;
    const next = { phase: "career" as const };
    set(next);
    persistDecisionsFrom({ ...get(), ...next });
  },

  rematch: () => {
    const {
      locked,
      driverName,
      selectedSeat,
      traits,
      startYear,
      careerControl,
    } = get();
    if (locked.length < 8) return;
    const seed = Date.now();
    clearLiveSession();
    clearDecisionsSave();
    const session = beginCareer({
      locked,
      seed,
      playerName: driverName || "Driver",
      debutTeam: selectedSeat,
      traits: traits.length ? traits : deriveTraits(locked),
      startYear,
      control: careerControl,
    });

    if (careerControl === "autopilot") {
      const career = runAutopilot(session);
      set({
        career,
        phase: "career",
        careerSeed: seed,
        decision: null,
        simulatedSeasons: [],
        decisionChoices: [],
      });
      return;
    }

    const result = advanceCareer(session);
    const next = {
      careerSeed: seed,
      decisionChoices: [] as string[],
      ...applySessionResult(session, result),
    };
    set(next);
    persistDecisionsFrom({ ...get(), ...next });
  },

  reset: () => {
    if (spinTimer != null) {
      window.clearTimeout(spinTimer);
      spinTimer = null;
    }
    clearLiveSession();
    clearDecisionsSave();
    set({
      phase: "landing",
      locked: [],
      current: null,
      spinning: false,
      passesLeft: 3,
      career: null,
      usedSeasonIds: [],
      pool: freshPool(),
      challengeSpinAvailable: true,
      challengeSpinActive: false,
      lastSpinWasLegend: false,
      nearMiss: false,
      careerSeed: null,
      startYear: LATEST_START_YEAR,
      seatOffers: [],
      selectedSeat: null,
      traits: [],
      careerControl: "autopilot",
      decision: null,
      selectedDecisionSeat: null,
      simulatedSeasons: [],
      decisionChoices: [],
    });
  },

  openSlots: () => remainingAttributes(get().locked.map((l) => l.key)),

  buildOverall: () => computePartialOverall(get().locked),

  adminLock: (key, season) => {
    if (!get().adminMode) return;
    const value = season.attributes[key];
    const next = [
      ...get().locked.filter((l) => l.key !== key),
      { key, value, from: season },
    ];
    set({ ...applyLocked(next, true), spinning: false });
  },

  adminUnlock: (key) => {
    if (!get().adminMode) return;
    set({
      locked: get().locked.filter((l) => l.key !== key),
      phase: "draft",
    });
  },

  adminClear: () => {
    if (!get().adminMode) return;
    if (!window.confirm("Clear the whole admin build?")) return;
    set({ locked: [], current: null, spinning: false, phase: "draft" });
  },

  adminMaxBuild: () => {
    if (!get().adminMode) return;
    const locked = maxBuildFromPool(get().pool);
    set({
      locked,
      current: null,
      spinning: false,
      phase: "draft",
      traits: deriveTraits(locked),
    });
  },

  adminFinish: () => {
    if (!get().adminMode) return;
    if (get().locked.length < 8) return;
    set({
      phase: "reveal",
      current: null,
      spinning: false,
      traits: deriveTraits(get().locked),
    });
  },
}));

export function datasetMeta() {
  return {
    years: dataset.years,
    count: dataset.count,
    generatedAt: dataset.generatedAt,
  };
}

/** True while a decisions-mode career is mid-flight (warn before closing the tab). */
export function decisionsProgressActive() {
  const state = useGameStore.getState();
  return state.careerControl === "decisions" && state.phase === "simulate";
}

/** Hydrate a saved decisions-mode career after a refresh. Returns true if restored. */
export function tryRestoreDecisions() {
  const save = readDecisionsSave();
  if (!save) return false;
  const restored = restoreDecisionsSave(save);
  if (!restored) {
    clearDecisionsSave();
    return false;
  }

  liveSession = restored.session;
  useGameStore.setState({
    phase: restored.phase,
    driverName: save.driverName,
    locked: save.locked,
    selectedSeat: save.selectedSeat,
    traits: save.traits,
    startYear: save.startYear,
    careerSeed: save.careerSeed,
    careerControl: "decisions",
    career: restored.career,
    decision: restored.decision,
    selectedDecisionSeat: restored.selectedDecisionSeat,
    simulatedSeasons: restored.simulatedSeasons,
    decisionChoices: restored.choices,
    current: null,
    spinning: false,
  });
  return true;
}
