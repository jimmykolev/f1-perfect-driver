import { create } from "zustand";
import data from "@/data/driverSeasons.json";
import { isEligibleSeason } from "@/lib/era";
import {
  TEAM_SEAT_ORDER,
  buildConstructorSeasonPool,
  pickConstructorSeason,
  pickDriverSeasonForSeat,
  remainingCarAttributes,
  type CarAttributeKey,
  type ConstructorSeason,
  type LockedCarAttribute,
  type TeamSeatId,
} from "@/lib/teamCarPool";
import {
  buildPrincipalPool,
  pickPrincipal,
  type TeamPrincipal,
} from "@/lib/teamPrincipalPool";
import { archiveTeamChase } from "@/lib/teamArchive";
import { teamArchetype } from "@/lib/teamOutcome";
import {
  clearTeamSave,
  readTeamSave,
  writeTeamSave,
  type TeamSessionSave,
} from "@/lib/teamSave";
import {
  lockedCarToAttributes,
  simulateTeamSeasonChase,
  type TeamSeasonChaseResult,
} from "@/lib/teamSeason";
import { mulberry32 } from "@/lib/ratings";
import type { DriverDataFile, DriverSeason } from "@/types";

const dataset = data as DriverDataFile;
const driverPool = () => dataset.seasons.filter(isEligibleSeason);

export type TeamPhase =
  | "idle"
  | "carDraft"
  | "seatDraft"
  | "principalDraft"
  | "sheet"
  | "yearSelect"
  | "seasonRun"
  | "seasonResult";

type TeamSeats = Partial<Record<TeamSeatId, DriverSeason>>;

interface TeamState {
  phase: TeamPhase;
  teamName: string;
  /** Car draft */
  carPool: ConstructorSeason[];
  carLocked: LockedCarAttribute[];
  carCurrent: ConstructorSeason | null;
  carSpinning: boolean;
  carUsedIds: string[];
  /** Seat draft */
  seats: TeamSeats;
  seatCurrent: DriverSeason | null;
  seatSpinning: boolean;
  seatUsedDriverIds: number[];
  /** Principal draft */
  principalPool: TeamPrincipal[];
  principal: TeamPrincipal | null;
  principalCurrent: TeamPrincipal | null;
  principalSpinning: boolean;
  principalUsedIds: string[];
  /** Shared across car, seats, and principal (total for the build). */
  passesLeft: number;
  autoDraft: boolean;
  /** Season chase */
  seasonYear: number | null;
  seasonSeed: number;
  seasonResult: TeamSeasonChaseResult | null;
  seasonRevealCount: number;
  teamArchetypeLabel: string;

  start: () => void;
  reset: () => void;
  setTeamName: (name: string) => void;
  setAutoDraft: (on: boolean) => void;
  setSeasonRevealCount: (count: number) => void;

  spinCar: (fast?: boolean) => void;
  finishCarSpin: (card: ConstructorSeason) => void;
  pickCarAttribute: (key: CarAttributeKey) => void;
  passCar: () => void;
  beginSeatDraft: () => void;

  spinSeat: (fast?: boolean) => void;
  finishSeatSpin: (season: DriverSeason) => void;
  /** Assign the spun driver into an open seat. */
  lockSeat: (seat: TeamSeatId) => void;
  passSeat: () => void;
  beginPrincipalDraft: () => void;

  spinPrincipal: (fast?: boolean) => void;
  finishPrincipalSpin: (card: TeamPrincipal) => void;
  lockPrincipal: () => void;
  passPrincipal: () => void;

  beginYearSelect: () => void;
  confirmSeasonYear: (year: number) => void;
  /** After the race-by-race replay finishes, open the verdict screen. */
  finishSeason: () => void;
  retrySeason: () => void;
  backToSheet: () => void;

  carOverall: () => number;
  openCarSlots: () => CarAttributeKey[];
  openSeats: () => TeamSeatId[];
  seatsComplete: () => boolean;
  rosterReady: () => boolean;
}

const initial = {
  phase: "idle" as TeamPhase,
  teamName: "",
  carPool: [] as ConstructorSeason[],
  carLocked: [] as LockedCarAttribute[],
  carCurrent: null as ConstructorSeason | null,
  carSpinning: false,
  carUsedIds: [] as string[],
  seats: {} as TeamSeats,
  seatCurrent: null as DriverSeason | null,
  seatSpinning: false,
  seatUsedDriverIds: [] as number[],
  principalPool: [] as TeamPrincipal[],
  principal: null as TeamPrincipal | null,
  principalCurrent: null as TeamPrincipal | null,
  principalSpinning: false,
  principalUsedIds: [] as string[],
  passesLeft: 3,
  autoDraft: false,
  seasonYear: null as number | null,
  seasonSeed: 0,
  seasonResult: null as TeamSeasonChaseResult | null,
  seasonRevealCount: 0,
  teamArchetypeLabel: "",
};

function persistTeamState(state: {
  phase: TeamPhase;
  teamName: string;
  carLocked: LockedCarAttribute[];
  carUsedIds: string[];
  seats: TeamSeats;
  seatUsedDriverIds: number[];
  principal: TeamPrincipal | null;
  principalUsedIds: string[];
  passesLeft: number;
  autoDraft: boolean;
  seasonYear: number | null;
  seasonSeed: number;
  seasonResult: TeamSeasonChaseResult | null;
  seasonRevealCount: number;
}) {
  if (state.phase === "idle") {
    clearTeamSave();
    return;
  }
  const save: TeamSessionSave = {
    v: 1,
    phase: state.phase,
    teamName: state.teamName,
    carLocked: state.carLocked,
    carUsedIds: state.carUsedIds,
    seats: state.seats,
    seatUsedDriverIds: state.seatUsedDriverIds,
    principal: state.principal,
    principalUsedIds: state.principalUsedIds,
    passesLeft: state.passesLeft,
    autoDraft: state.autoDraft,
    seasonYear: state.seasonYear,
    seasonSeed: state.seasonSeed,
    seasonResult: state.seasonResult,
    seasonRevealCount: state.seasonRevealCount,
    savedAt: Date.now(),
  };
  writeTeamSave(save);
}

function computeArchetype(state: {
  carLocked: LockedCarAttribute[];
  seats: TeamSeats;
  principal: TeamPrincipal | null;
}): string {
  const { seats, principal, carLocked } = state;
  if (!seats.first || !seats.second || !seats.reserve || !principal) return "";
  return teamArchetype({
    car: lockedCarToAttributes(carLocked),
    first: seats.first,
    second: seats.second,
    reserve: seats.reserve,
    principal,
  });
}

let carSpinTimer: number | null = null;
let seatSpinTimer: number | null = null;
let principalSpinTimer: number | null = null;

function clearTimers() {
  if (carSpinTimer != null) {
    window.clearTimeout(carSpinTimer);
    carSpinTimer = null;
  }
  if (seatSpinTimer != null) {
    window.clearTimeout(seatSpinTimer);
    seatSpinTimer = null;
  }
  if (principalSpinTimer != null) {
    window.clearTimeout(principalSpinTimer);
    principalSpinTimer = null;
  }
}

function nextOpenSeat(seats: TeamSeats): TeamSeatId | null {
  return TEAM_SEAT_ORDER.find((id) => !seats[id]) ?? null;
}

export const useTeamStore = create<TeamState>((set, get) => ({
  ...initial,

  start: () => {
    clearTimers();
    clearTeamSave();
    const next = {
      ...initial,
      phase: "carDraft" as const,
      carPool: buildConstructorSeasonPool(),
      principalPool: buildPrincipalPool(),
      teamName: get().teamName || "Perfect Team",
    };
    set(next);
    persistTeamState(next);
  },

  reset: () => {
    clearTimers();
    clearTeamSave();
    set({ ...initial, teamName: get().teamName });
  },

  setTeamName: (name) => set({ teamName: name }),

  setAutoDraft: (on) => {
    set({ autoDraft: on });
    persistTeamState({ ...get(), autoDraft: on });
  },

  setSeasonRevealCount: (count) => {
    set({ seasonRevealCount: count });
    persistTeamState({ ...get(), seasonRevealCount: count });
  },

  spinCar: (fast = false) => {
    const { phase, carPool, carUsedIds, carLocked, carSpinning } = get();
    if (phase !== "carDraft" || carSpinning || carLocked.length >= 4) return;

    const card = pickConstructorSeason(carPool, carUsedIds);
    set({ carSpinning: true, carCurrent: null });
    if (carSpinTimer != null) window.clearTimeout(carSpinTimer);
    carSpinTimer = window.setTimeout(() => {
      carSpinTimer = null;
      get().finishCarSpin(card);
    }, fast ? 250 : 1200);
  },

  finishCarSpin: (card) => {
    if (get().phase !== "carDraft") return;
    set({
      carSpinning: false,
      carCurrent: card,
      carUsedIds: [...get().carUsedIds, card.id],
    });
  },

  pickCarAttribute: (key) => {
    const { carCurrent, carLocked, phase } = get();
    if (phase !== "carDraft" || !carCurrent) return;
    if (carLocked.some((l) => l.key === key)) return;
    if (!(key in carCurrent.attributes)) return;

    const next = [
      ...carLocked,
      { key, value: carCurrent.attributes[key], from: carCurrent },
    ];
    if (next.length >= 4) {
      set({
        carLocked: next,
        carCurrent: null,
        phase: "seatDraft",
        seats: {},
        seatCurrent: null,
        seatSpinning: false,
        seatUsedDriverIds: [],
      });
      return;
    }
    set({
      carLocked: next,
      carCurrent: null,
    });
  },

  passCar: () => {
    const { passesLeft, carCurrent, carSpinning, phase } = get();
    if (phase !== "carDraft" || carSpinning || !carCurrent || passesLeft <= 0)
      return;
    set({ passesLeft: passesLeft - 1, carCurrent: null });
  },

  beginSeatDraft: () => {
    if (get().carLocked.length < 4) return;
    clearTimers();
    set({
      phase: "seatDraft",
      seats: {},
      seatCurrent: null,
      seatSpinning: false,
      seatUsedDriverIds: [],
    });
  },

  spinSeat: (fast = false) => {
    const { phase, seats, seatSpinning, seatUsedDriverIds } = get();
    if (phase !== "seatDraft" || seatSpinning) return;
    if (TEAM_SEAT_ORDER.every((id) => seats[id])) return;

    const season = pickDriverSeasonForSeat(driverPool(), seatUsedDriverIds);
    set({ seatSpinning: true, seatCurrent: null });
    if (seatSpinTimer != null) window.clearTimeout(seatSpinTimer);
    seatSpinTimer = window.setTimeout(() => {
      seatSpinTimer = null;
      get().finishSeatSpin(season);
    }, fast ? 250 : 1200);
  },

  finishSeatSpin: (season) => {
    if (get().phase !== "seatDraft") return;
    set({ seatSpinning: false, seatCurrent: season });
  },

  lockSeat: (seat) => {
    const { phase, seatCurrent, seats, seatUsedDriverIds, principalPool } =
      get();
    if (phase !== "seatDraft" || !seatCurrent) return;
    if (seats[seat]) return;

    const nextSeats: TeamSeats = { ...seats, [seat]: seatCurrent };
    const nextUsed = [...seatUsedDriverIds, seatCurrent.driverId];

    if (!nextOpenSeat(nextSeats)) {
      set({
        seats: nextSeats,
        seatUsedDriverIds: nextUsed,
        seatCurrent: null,
        phase: "principalDraft",
        principal: null,
        principalCurrent: null,
        principalSpinning: false,
        principalUsedIds: [],
        principalPool:
          principalPool.length > 0 ? principalPool : buildPrincipalPool(),
      });
      return;
    }

    set({
      seats: nextSeats,
      seatUsedDriverIds: nextUsed,
      seatCurrent: null,
    });
  },

  passSeat: () => {
    const { phase, seatCurrent, seatSpinning, passesLeft } = get();
    if (
      phase !== "seatDraft" ||
      seatSpinning ||
      !seatCurrent ||
      passesLeft <= 0
    ) {
      return;
    }
    set({ passesLeft: passesLeft - 1, seatCurrent: null });
  },

  beginPrincipalDraft: () => {
    if (!get().seatsComplete()) return;
    clearTimers();
    set({
      phase: "principalDraft",
      principal: null,
      principalCurrent: null,
      principalSpinning: false,
      principalUsedIds: [],
      principalPool: buildPrincipalPool(),
    });
  },

  spinPrincipal: (fast = false) => {
    const {
      phase,
      principalPool,
      principalUsedIds,
      principalSpinning,
      principal,
    } = get();
    if (phase !== "principalDraft" || principalSpinning || principal) return;

    const card = pickPrincipal(principalPool, principalUsedIds);
    set({ principalSpinning: true, principalCurrent: null });
    if (principalSpinTimer != null) window.clearTimeout(principalSpinTimer);
    principalSpinTimer = window.setTimeout(() => {
      principalSpinTimer = null;
      get().finishPrincipalSpin(card);
    }, fast ? 250 : 1200);
  },

  finishPrincipalSpin: (card) => {
    if (get().phase !== "principalDraft") return;
    set({
      principalSpinning: false,
      principalCurrent: card,
      principalUsedIds: [...get().principalUsedIds, card.id],
    });
  },

  lockPrincipal: () => {
    const { phase, principalCurrent, principalSpinning, seats, carLocked } =
      get();
    if (phase !== "principalDraft" || principalSpinning || !principalCurrent)
      return;
    const label = computeArchetype({
      carLocked,
      seats,
      principal: principalCurrent,
    });
    set({
      principal: principalCurrent,
      principalCurrent: null,
      phase: "sheet",
      teamArchetypeLabel: label,
    });
    persistTeamState(get());
  },

  passPrincipal: () => {
    const { phase, principalCurrent, principalSpinning, passesLeft } = get();
    if (
      phase !== "principalDraft" ||
      principalSpinning ||
      !principalCurrent ||
      passesLeft <= 0
    ) {
      return;
    }
    set({
      passesLeft: passesLeft - 1,
      principalCurrent: null,
    });
  },

  beginYearSelect: () => {
    if (!get().rosterReady()) return;
    set({
      phase: "yearSelect",
      seasonYear: null,
      seasonResult: null,
      seasonRevealCount: 0,
    });
    persistTeamState(get());
  },

  confirmSeasonYear: (year) => {
    const { teamName, carLocked, seats, principal, rosterReady } = get();
    if (!rosterReady()) return;
    const first = seats.first;
    const second = seats.second;
    const reserve = seats.reserve;
    if (!first || !second || !reserve || !principal) return;

    const seed =
      (Math.floor(Math.random() * 0x7fffffff) ^ (year * 9973) ^ Date.now()) >>>
      0;
    const result = simulateTeamSeasonChase({
      teamName: teamName || "Perfect Team",
      car: lockedCarToAttributes(carLocked),
      first,
      second,
      reserve,
      principal,
      year,
      rand: mulberry32(seed),
    });

    set({
      phase: "seasonRun",
      seasonYear: year,
      seasonSeed: seed,
      seasonResult: result,
      seasonRevealCount: 0,
      teamArchetypeLabel:
        get().teamArchetypeLabel ||
        computeArchetype({ carLocked, seats, principal }),
    });
    persistTeamState(get());
  },

  finishSeason: () => {
    const {
      phase,
      seasonResult,
      teamName,
      seasonSeed,
      teamArchetypeLabel,
      carLocked,
      seats,
      principal,
    } = get();
    if (phase !== "seasonRun" || !seasonResult) return;
    const archetype =
      teamArchetypeLabel ||
      computeArchetype({ carLocked, seats, principal }) ||
      "Constructor heist";
    archiveTeamChase({
      teamName: teamName || seasonResult.teamName,
      result: seasonResult,
      archetype,
      seed: seasonSeed,
    });
    set({
      seasonRevealCount: seasonResult.calendarLength,
      phase: "seasonResult",
      teamArchetypeLabel: archetype,
    });
    clearTeamSave();
  },

  retrySeason: () => {
    if (!get().rosterReady()) return;
    set({
      phase: "yearSelect",
      seasonYear: null,
      seasonResult: null,
      seasonRevealCount: 0,
    });
    persistTeamState(get());
  },

  backToSheet: () => {
    set({
      phase: "sheet",
      seasonYear: null,
      seasonResult: null,
      seasonRevealCount: 0,
    });
    persistTeamState(get());
  },

  carOverall: () => {
    const locked = get().carLocked;
    if (!locked.length) return 0;
    const attrs = Object.fromEntries(
      locked.map((l) => [l.key, l.value]),
    ) as Partial<Record<CarAttributeKey, number>>;
    const keys = remainingCarAttributes([]);
    const filled = keys.filter((k) => attrs[k] != null);
    if (!filled.length) return 0;
    const sum = filled.reduce((n, k) => n + (attrs[k] ?? 0), 0);
    return Math.round(sum / filled.length);
  },

  openCarSlots: () =>
    remainingCarAttributes(get().carLocked.map((l) => l.key)),

  openSeats: () => TEAM_SEAT_ORDER.filter((id) => !get().seats[id]),

  seatsComplete: () => TEAM_SEAT_ORDER.every((id) => Boolean(get().seats[id])),

  rosterReady: () => {
    const { carLocked, seats, principal } = get();
    return (
      carLocked.length >= 4 &&
      Boolean(seats.first && seats.second && seats.reserve) &&
      Boolean(principal)
    );
  },
}));

/** Convenience for tests without timers. */
export function lockCarAttrForTest(
  store: typeof useTeamStore,
  card: ConstructorSeason,
  key: CarAttributeKey,
) {
  store.setState({
    phase: "carDraft",
    carCurrent: card,
    carSpinning: false,
  });
  store.getState().pickCarAttribute(key);
}

export function assignSeatForTest(
  store: typeof useTeamStore,
  seat: TeamSeatId,
  season: DriverSeason,
) {
  store.setState({
    phase: "seatDraft",
    seatCurrent: season,
    seatSpinning: false,
  });
  store.getState().lockSeat(seat);
}

export function lockPrincipalForTest(
  store: typeof useTeamStore,
  card: TeamPrincipal,
) {
  store.setState({
    phase: "principalDraft",
    principalCurrent: card,
    principalSpinning: false,
  });
  store.getState().lockPrincipal();
}

/** Restore an in-progress Perfect Team session from sessionStorage. */
export function tryRestoreTeam(): boolean {
  const save = readTeamSave();
  if (!save || save.phase === "idle") return false;
  useTeamStore.setState({
    ...initial,
    phase: save.phase,
    teamName: save.teamName,
    carPool: buildConstructorSeasonPool(),
    carLocked: save.carLocked,
    carUsedIds: save.carUsedIds,
    seats: save.seats,
    seatUsedDriverIds: save.seatUsedDriverIds,
    principalPool: buildPrincipalPool(),
    principal: save.principal,
    principalUsedIds: save.principalUsedIds,
    passesLeft: save.passesLeft,
    autoDraft: save.autoDraft,
    seasonYear: save.seasonYear,
    seasonSeed: save.seasonSeed,
    seasonResult: save.seasonResult,
    seasonRevealCount: save.seasonRevealCount,
    teamArchetypeLabel: computeArchetype({
      carLocked: save.carLocked,
      seats: save.seats,
      principal: save.principal,
    }),
  });
  return true;
}

export function teamSessionActive(): boolean {
  const phase = useTeamStore.getState().phase;
  return phase !== "idle" && phase !== "seasonResult";
}

if (typeof window !== "undefined") {
  useTeamStore.subscribe((state) => {
    if (state.carSpinning || state.seatSpinning || state.principalSpinning) {
      return;
    }
    persistTeamState(state);
  });
}
