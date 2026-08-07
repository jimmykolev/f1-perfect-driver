import { create } from "zustand";
import data from "@/data/driverSeasons.json";
import { maxBuildFromPool } from "@/lib/playgroundBuild";
import { isEligibleSeason, isLegendSeason } from "@/lib/era";
import {
  pickRandom,
  remainingAttributes,
} from "@/lib/game";
import { computePartialOverall } from "@/lib/ratings";
import { debutSeatOffers } from "@/lib/seatOffers";
import { deriveTraits } from "@/lib/traits";
import { LATEST_START_YEAR } from "@/lib/f1Meta";
import { archiveCareer } from "@/lib/careerArchive";
import { buildWeeklyGrid } from "@/lib/weeklyGrid";
import {
  advanceCareer,
  beginCareer,
  resolveCareerDecision,
  runAutopilot,
  type CareerControl,
  type CareerSession,
  type DecisionDensity,
  type DecisionSnapshot,
} from "@/lib/careerSession";
import {
  clearDecisionsSave,
  readDecisionsSave,
  restoreDecisionsSave,
  buildDecisionsSaveFromSession,
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
    | "decisionDensity"
    | "decisionChoices"
    | "career"
    | "phase"
  >,
) {
  if (state.careerControl !== "decisions") return;
  if (state.phase !== "simulate" && state.phase !== "career") return;
  if (state.careerSeed == null || state.locked.length < 8) return;

  const base: Omit<
    DecisionsSave,
    | "seasonProgress"
    | "pendingPack"
    | "recentDecisionIds"
    | "midSeasonDecisionsThisYear"
    | "decisionDensity"
    | "decisionHistory"
    | "seasonStoryKindsThisYear"
    | "lastPauseDomain"
    | "lastRivalBeat"
  > = {
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

  const save = liveSession
    ? buildDecisionsSaveFromSession(liveSession, base)
    : { ...base, decisionDensity: state.decisionDensity };
  writeDecisionsSave(save);
}

/** Session-only: URL ?playground=1 turns it on (?admin=1 alias); Landing toggle does not persist. */
function readPlaygroundFlag() {
  if (typeof window === "undefined") return false;
  try {
    const params = new URLSearchParams(window.location.search);
    return (
      params.get("playground") === "1" || params.get("admin") === "1"
    );
  } catch {
    return false;
  }
}

/** Session-only: URL ?expert=1 turns it on; mutually exclusive with playground. */
function readExpertFlag() {
  if (typeof window === "undefined") return false;
  try {
    const params = new URLSearchParams(window.location.search);
    if (
      params.get("playground") === "1" ||
      params.get("admin") === "1"
    ) {
      return false;
    }
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
  /** Automatically resolve each spin using the strongest available attribute. */
  autoDraft: boolean;
  passesLeft: number;
  career: CareerResult | null;
  usedSeasonIds: string[];
  playgroundMode: boolean;
  expertMode: boolean;
  /** Draft from this week's shared 8-season grid. */
  weeklyGridMode: boolean;
  /** ISO week key locked in when the weekly draft started. */
  weeklyWeekKey: string | null;
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
  /** How often career story decisions fire (both modes). */
  decisionDensity: DecisionDensity;
  /** Active mid-career decision, when phase is decide. */
  decision: DecisionSnapshot | null;
  /** Selected checkpoint option id (`stay`, `retire`, `number2:Ferrari`, …). */
  selectedDecisionSeat: string | null;
  /** Seasons already calculated for the visible decisions-mode timeline. */
  simulatedSeasons: SeasonResult[];
  /** Option ids chosen at each decisions-mode checkpoint (for save/resume). */
  decisionChoices: string[];

  setName: (name: string) => void;
  setPlaygroundMode: (on: boolean) => void;
  setExpertMode: (on: boolean) => void;
  setWeeklyGridMode: (on: boolean) => void;
  setAutoDraft: (on: boolean) => void;
  setCareerControl: (control: CareerControl) => void;
  setDecisionDensity: (density: DecisionDensity) => void;
  start: () => void;
  spin: (fast?: boolean) => void;
  finishSpin: (season: DriverSeason) => void;
  pickAttribute: (key: AttributeKey) => void;
  pass: () => void;
  goToEraChoice: () => void;
  confirmStartYear: (year: number) => void;
  selectSeat: (team: string) => void;
  selectDecisionSeat: (optionId: string) => void;
  simulate: () => void;
  resolveDecision: () => void;
  finishSimulation: () => void;
  reset: () => void;
  openSlots: () => AttributeKey[];
  buildOverall: () => number;

  playgroundLock: (key: AttributeKey, season: DriverSeason) => void;
  playgroundUnlock: (key: AttributeKey) => void;
  playgroundClear: () => void;
  playgroundMaxBuild: () => void;
  playgroundFinish: () => void;
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
    session.pending?.pack.options.find((o) => o.kind === "stay")?.id ??
    session.pending?.offers.find((o) => o.kind === "stay")?.id ??
    session.pending?.pack.options[0]?.id ??
    null;
  return {
    phase: "simulate",
    career: null,
    decision: session.pending,
    selectedDecisionSeat: stay,
    simulatedSeasons: [...session.seasons],
  };
}

/** After instant autopilot sim: same replay phase as a finished decisions run. */
function applyAutopilotResult(
  career: CareerResult,
): Pick<
  GameState,
  | "phase"
  | "career"
  | "decision"
  | "selectedDecisionSeat"
  | "simulatedSeasons"
> {
  clearLiveSession();
  return {
    phase: "simulate",
    career,
    decision: null,
    selectedDecisionSeat: null,
    simulatedSeasons: [...career.seasons],
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
  autoDraft: false,
  passesLeft: 3,
  career: null,
  usedSeasonIds: [],
  playgroundMode: readPlaygroundFlag(),
  expertMode: readExpertFlag(),
  weeklyGridMode: false,
  weeklyWeekKey: null,
  lastSpinWasLegend: false,
  nearMiss: false,
  careerSeed: null,
  startYear: LATEST_START_YEAR,
  seatOffers: [],
  selectedSeat: null,
  traits: [],
  careerControl: "autopilot",
  decisionDensity: "medium",
  decision: null,
  selectedDecisionSeat: null,
  simulatedSeasons: [],
  decisionChoices: [],

  setName: (name) => set({ driverName: name }),

  setPlaygroundMode: (on) =>
    set(
      on
        ? {
            playgroundMode: true,
            expertMode: false,
            weeklyGridMode: false,
            autoDraft: false,
          }
        : { playgroundMode: false },
    ),

  setExpertMode: (on) =>
    set(
      on
        ? { expertMode: true, playgroundMode: false }
        : { expertMode: false },
    ),

  setWeeklyGridMode: (on) =>
    set(
      on
        ? {
            weeklyGridMode: true,
            playgroundMode: false,
            autoDraft: false,
          }
        : { weeklyGridMode: false, weeklyWeekKey: null },
    ),

  setAutoDraft: (on) => {
    if (get().playgroundMode || get().weeklyGridMode) return;
    set({ autoDraft: on });
  },

  setCareerControl: (control) => set({ careerControl: control }),

  setDecisionDensity: (density) => set({ decisionDensity: density }),

  start: () => {
    if (spinTimer != null) {
      window.clearTimeout(spinTimer);
      spinTimer = null;
    }
    clearLiveSession();
    clearDecisionsSave();
    const weekly = get().weeklyGridMode;
    const grid = weekly ? buildWeeklyGrid(freshPool()) : null;
    set({
      phase: "draft",
      locked: [],
      current: null,
      spinning: false,
      autoDraft: false,
      decisionChoices: [],
      passesLeft: weekly ? 0 : 3,
      career: null,
      usedSeasonIds: [],
      pool: grid?.seasons ?? freshPool(),
      weeklyWeekKey: grid?.weekKey ?? null,
      lastSpinWasLegend: false,
      nearMiss: false,
      careerSeed: null,
      startYear: LATEST_START_YEAR,
      seatOffers: [],
      selectedSeat: null,
      traits: [],
      careerControl: "autopilot",
      decisionDensity: "medium",
      decision: null,
      selectedDecisionSeat: null,
      simulatedSeasons: [],
    });
  },

  spin: (fast = false) => {
    const { pool, usedSeasonIds, locked, lastSpinWasLegend } = get();
    if (locked.length >= 8) return;

    const available = pool.filter((s) => !usedSeasonIds.includes(s.id));
    const source = available.length ? available : pool;
    const season = pickRandom(source);

    set({
      spinning: true,
      current: null,
      nearMiss: false,
    });

    if (spinTimer != null) window.clearTimeout(spinTimer);
    spinTimer = window.setTimeout(() => {
      spinTimer = null;
      get().finishSpin(season);
      set({
        nearMiss:
          lastSpinWasLegend && !isLegendSeason(season.year, season.name),
      });
    }, fast ? 250 : 1400);
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

  selectDecisionSeat: (optionId) => set({ selectedDecisionSeat: optionId }),

  simulate: () => {
    const {
      locked,
      driverName,
      selectedSeat,
      careerSeed,
      traits,
      startYear,
      careerControl,
      decisionDensity,
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
      decisionDensity,
    });

    if (careerControl === "autopilot") {
      clearDecisionsSave();
      const career = runAutopilot(session);
      set({
        careerSeed: seed,
        decisionChoices: [],
        ...applyAutopilotResult(career),
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
    const { career, driverName } = get();
    if (!career) return;
    archiveCareer(driverName, career);
    const next = { phase: "career" as const };
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
      autoDraft: false,
      passesLeft: 3,
      career: null,
      usedSeasonIds: [],
      pool: freshPool(),
      lastSpinWasLegend: false,
      nearMiss: false,
      careerSeed: null,
      startYear: LATEST_START_YEAR,
      seatOffers: [],
      selectedSeat: null,
      traits: [],
      careerControl: "autopilot",
      decisionDensity: "medium",
      decision: null,
      selectedDecisionSeat: null,
      simulatedSeasons: [],
      decisionChoices: [],
      weeklyWeekKey: null,
    });
  },

  openSlots: () => remainingAttributes(get().locked.map((l) => l.key)),

  buildOverall: () => computePartialOverall(get().locked),

  playgroundLock: (key, season) => {
    if (!get().playgroundMode) return;
    const value = season.attributes[key];
    const next = [
      ...get().locked.filter((l) => l.key !== key),
      { key, value, from: season },
    ];
    set({ ...applyLocked(next, true), spinning: false });
  },

  playgroundUnlock: (key) => {
    if (!get().playgroundMode) return;
    set({
      locked: get().locked.filter((l) => l.key !== key),
      phase: "draft",
    });
  },

  playgroundClear: () => {
    if (!get().playgroundMode) return;
    if (!window.confirm("Clear the whole playground build?")) return;
    set({ locked: [], current: null, spinning: false, phase: "draft" });
  },

  playgroundMaxBuild: () => {
    if (!get().playgroundMode) return;
    const locked = maxBuildFromPool(get().pool);
    set({
      locked,
      current: null,
      spinning: false,
      phase: "draft",
      traits: deriveTraits(locked),
    });
  },

  playgroundFinish: () => {
    if (!get().playgroundMode) return;
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

/** Preview this week's shared grid without starting a draft. */
export function currentWeeklyGrid() {
  return buildWeeklyGrid(freshPool());
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
    decisionDensity: save.decisionDensity ?? "high",
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
