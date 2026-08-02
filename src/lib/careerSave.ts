import {
  advanceCareer,
  beginCareer,
  deserializeSeasonProgress,
  resolveCareerDecision,
  serializeSeasonProgress,
  type CareerControl,
  type CareerSession,
} from "@/lib/careerSession";
import type { DecisionPack, DecisionDensity } from "@/lib/decisionEngine";
import { seatOffersFromPack } from "@/lib/decisionEngine";
import type {
  CareerResult,
  LockedAttribute,
  RaceResult,
  SignatureTrait,
} from "@/types";
import type { DriverSeasonTotals, SeasonPolitics } from "@/lib/fieldSim";

const STORAGE_KEY = "perfect-driver.decisions-v1";

export interface SerializedSeasonProgress {
  totals: [string, DriverSeasonTotals][];
  seasonForm: [string, number][];
  playerRaces: RaceResult[];
  roundsCompleted: number;
  politics: SeasonPolitics;
}

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
  /** Option ids chosen at each decision pause, in order. */
  choices: string[];
  career: CareerResult | null;
  phase: "simulate" | "career";
  activeChallengeId?: string | null;
  /** Mid-season pause: in-progress calendar state. */
  seasonProgress?: SerializedSeasonProgress | null;
  pendingPack?: DecisionPack | null;
  recentDecisionIds?: string[];
  midSeasonDecisionsThisYear?: number;
  decisionDensity?: DecisionDensity;
  decisionHistory?: CareerSession["decisionHistory"];
  seasonStoryKindsThisYear?: string[];
  lastPauseDomain?: CareerSession["lastPauseDomain"];
  lastRivalBeat?: CareerSession["lastRivalBeat"];
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

export function buildDecisionsSaveFromSession(
  session: CareerSession,
  base: Omit<
    DecisionsSave,
    "seasonProgress" | "pendingPack" | "recentDecisionIds" | "midSeasonDecisionsThisYear"
    | "decisionDensity" | "decisionHistory" | "seasonStoryKindsThisYear"
    | "lastPauseDomain" | "lastRivalBeat"
  >,
): DecisionsSave {
  return {
    ...base,
    seasonProgress: session.seasonProgress
      ? serializeSeasonProgress(session.seasonProgress)
      : null,
    pendingPack: session.pending?.pack ?? null,
    recentDecisionIds: [...session.recentDecisionIds],
    midSeasonDecisionsThisYear: session.midSeasonDecisionsThisYear,
    decisionDensity: session.decisionDensity,
    decisionHistory: [...session.decisionHistory],
    seasonStoryKindsThisYear: [...session.seasonStoryKindsThisYear],
    lastPauseDomain: session.lastPauseDomain,
    lastRivalBeat: session.lastRivalBeat,
  };
}

function defaultSelectedOption(session: CareerSession): string | null {
  return (
    session.pending?.pack.options.find((o) => o.kind === "stay")?.id ??
    session.pending?.pack.options[0]?.id ??
    null
  );
}

function applySavedPause(session: CareerSession, save: DecisionsSave) {
  if (save.recentDecisionIds?.length) {
    session.recentDecisionIds = [...save.recentDecisionIds];
  }
  if (save.midSeasonDecisionsThisYear != null) {
    session.midSeasonDecisionsThisYear = save.midSeasonDecisionsThisYear;
  }
  if (save.decisionDensity) {
    session.decisionDensity = save.decisionDensity;
  }
  if (save.decisionHistory?.length) {
    session.decisionHistory = [...save.decisionHistory];
  }
  if (save.seasonStoryKindsThisYear?.length) {
    session.seasonStoryKindsThisYear = [...save.seasonStoryKindsThisYear];
  }
  if (save.lastPauseDomain !== undefined) {
    session.lastPauseDomain = save.lastPauseDomain;
  }
  if (save.lastRivalBeat !== undefined) {
    session.lastRivalBeat = save.lastRivalBeat;
  }
  if (save.seasonProgress) {
    session.seasonProgress = deserializeSeasonProgress(save.seasonProgress);
  }
  if (save.pendingPack && session.pending) {
    session.pending = {
      ...session.pending,
      pack: save.pendingPack,
      offers: session.pending.offers,
    };
  }
}

/**
 * Rebuild a decisions-mode career from seed + prior choices.
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
      decisionDensity: save.decisionDensity ?? "high",
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

    if (save.pendingPack && save.seasonProgress && !session.pending) {
      session.seasonProgress = deserializeSeasonProgress(save.seasonProgress);
      session.recentDecisionIds = [...(save.recentDecisionIds ?? [])];
      session.midSeasonDecisionsThisYear = save.midSeasonDecisionsThisYear ?? 0;
      if (save.decisionDensity) session.decisionDensity = save.decisionDensity;
      if (save.decisionHistory?.length) {
        session.decisionHistory = [...save.decisionHistory];
      }
      if (save.seasonStoryKindsThisYear?.length) {
        session.seasonStoryKindsThisYear = [...save.seasonStoryKindsThisYear];
      }
      if (save.lastPauseDomain !== undefined) {
        session.lastPauseDomain = save.lastPauseDomain;
      }
      if (save.lastRivalBeat !== undefined) {
        session.lastRivalBeat = save.lastRivalBeat;
      }
      const last = session.seasons[session.seasons.length - 1];
      if (last) {
        session.pending = {
          pack: save.pendingPack,
          year: session.world.year,
          age: session.player.age,
          seasonsDone: session.seasons.length,
          titles: session.titles,
          wins: session.wins,
          points: session.points,
          lastSeason: last,
          raceTeam: session.player.team,
          currentTeam: session.player.team,
          currentRank: session.previousRank,
          marketMove: null,
          offers: seatOffersFromPack(save.pendingPack),
          midSeason: true,
        };
      }
    } else if (session.pending) {
      applySavedPause(session, save);
    }

    return {
      session,
      career: null,
      phase: "simulate",
      decision: session.pending,
      selectedDecisionSeat: defaultSelectedOption(session),
      simulatedSeasons: [...session.seasons],
      choices: save.choices,
    };
  } catch {
    return null;
  }
}
