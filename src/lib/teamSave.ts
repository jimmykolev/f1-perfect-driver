import type { LockedCarAttribute, TeamSeatId } from "@/lib/teamCarPool";
import type { TeamPrincipal } from "@/lib/teamPrincipalPool";
import type { TeamSeasonChaseResult } from "@/lib/teamSeason";
import type { DriverSeason } from "@/types";

const STORAGE_KEY = "perfect-team.session-v1";

export type SavedTeamPhase =
  | "idle"
  | "carDraft"
  | "seatDraft"
  | "principalDraft"
  | "sheet"
  | "yearSelect"
  | "seasonRun"
  | "seasonResult";

export interface TeamSessionSave {
  v: 1;
  phase: SavedTeamPhase;
  teamName: string;
  carLocked: LockedCarAttribute[];
  carUsedIds: string[];
  seats: Partial<Record<TeamSeatId, DriverSeason>>;
  seatUsedDriverIds: number[];
  principal: TeamPrincipal | null;
  principalUsedIds: string[];
  passesLeft: number;
  autoDraft: boolean;
  seasonYear: number | null;
  seasonSeed: number;
  seasonResult: TeamSeasonChaseResult | null;
  seasonRevealCount: number;
  savedAt: number;
}

export function writeTeamSave(save: TeamSessionSave) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(save));
  } catch {
    /* ignore */
  }
}

export function readTeamSave(): TeamSessionSave | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TeamSessionSave;
    if (!parsed || parsed.v !== 1) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearTeamSave() {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function teamProgressActive(phase: SavedTeamPhase): boolean {
  return phase !== "idle" && phase !== "seasonResult";
}
