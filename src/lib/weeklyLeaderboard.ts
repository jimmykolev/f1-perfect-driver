import { isoWeekKey } from "@/lib/weeklyGrid";
import { tierLabel } from "@/lib/careerOutcome";
import type { CareerResult, CareerTier } from "@/types";

const CLIENT_ID_KEY = "f1pd-client-id-v1";
const DISPLAY_NAME_KEY = "f1pd-board-display-name-v1";
const LOCAL_BOARD_PREFIX = "f1pd-weekly-board-v1:";
const API_PATH = "/.netlify/functions/weekly-board";
const MAX_NAME_LEN = 24;
const MAX_BOARD = 100;

const TIER_RANK: Record<CareerTier, number> = {
  legend: 6,
  champion: 5,
  raceWinner: 4,
  podiumThreat: 3,
  pointsRegular: 2,
  nobody: 1,
};

const TIERS = new Set<string>(Object.keys(TIER_RANK));

export interface WeeklyBoardEntry {
  clientId: string;
  displayName: string;
  driverName: string;
  tier: CareerTier;
  tierLabel: string;
  titles: number;
  wins: number;
  points: number;
  weekKey: string;
  submittedAt: number;
}

export interface WeeklyBoardSnapshot {
  weekKey: string;
  entries: WeeklyBoardEntry[];
  /** True when served from this browser only (API unavailable). */
  localOnly: boolean;
}

export interface WeeklySubmitPayload {
  weekKey: string;
  clientId: string;
  displayName: string;
  driverName: string;
  tier: CareerTier;
  titles: number;
  wins: number;
  points: number;
}

export interface WeeklySubmitResult {
  entry: WeeklyBoardEntry;
  rank: number;
  board: WeeklyBoardSnapshot;
  improved: boolean;
}

export function tierRank(tier: CareerTier): number {
  return TIER_RANK[tier] ?? 0;
}

/** Rank order: tier → titles → wins → points → earlier submit. */
export function compareBoardEntries(
  a: Pick<WeeklyBoardEntry, "tier" | "titles" | "wins" | "points" | "submittedAt">,
  b: Pick<WeeklyBoardEntry, "tier" | "titles" | "wins" | "points" | "submittedAt">,
): number {
  const tier = tierRank(b.tier) - tierRank(a.tier);
  if (tier !== 0) return tier;
  if (b.titles !== a.titles) return b.titles - a.titles;
  if (b.wins !== a.wins) return b.wins - a.wins;
  if (b.points !== a.points) return b.points - a.points;
  return a.submittedAt - b.submittedAt;
}

export function isBetterOrEqualRun(
  next: Pick<WeeklyBoardEntry, "tier" | "titles" | "wins" | "points">,
  prev: Pick<WeeklyBoardEntry, "tier" | "titles" | "wins" | "points">,
): boolean {
  return compareBoardEntries(
    { ...next, submittedAt: 0 },
    { ...prev, submittedAt: 1 },
  ) <= 0;
}

export function sanitizeDisplayName(raw: string): string {
  const cleaned = raw
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_NAME_LEN);
  return cleaned;
}

export function rankOfClient(
  entries: WeeklyBoardEntry[],
  clientId: string,
): number | null {
  const sorted = [...entries].sort(compareBoardEntries);
  const idx = sorted.findIndex((e) => e.clientId === clientId);
  return idx >= 0 ? idx + 1 : null;
}

export function getOrCreateClientId(): string {
  try {
    const existing = localStorage.getItem(CLIENT_ID_KEY);
    if (existing && /^[0-9a-f-]{36}$/i.test(existing)) return existing;
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `pd-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(CLIENT_ID_KEY, id);
    return id;
  } catch {
    return `pd-session-${Date.now().toString(36)}`;
  }
}

export function loadSavedDisplayName(): string {
  try {
    return sanitizeDisplayName(localStorage.getItem(DISPLAY_NAME_KEY) ?? "");
  } catch {
    return "";
  }
}

export function saveDisplayName(name: string): void {
  const clean = sanitizeDisplayName(name);
  if (!clean) return;
  try {
    localStorage.setItem(DISPLAY_NAME_KEY, clean);
  } catch {
    // ignore
  }
}

function localBoardKey(weekKey: string): string {
  return `${LOCAL_BOARD_PREFIX}${weekKey}`;
}

function readLocalBoard(weekKey: string): WeeklyBoardEntry[] {
  try {
    const raw = localStorage.getItem(localBoardKey(weekKey));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as WeeklyBoardEntry[];
    return Array.isArray(parsed) ? parsed.filter(isValidEntry) : [];
  } catch {
    return [];
  }
}

function writeLocalBoard(weekKey: string, entries: WeeklyBoardEntry[]): void {
  try {
    localStorage.setItem(
      localBoardKey(weekKey),
      JSON.stringify(entries.slice(0, MAX_BOARD)),
    );
  } catch {
    // ignore
  }
}

function isValidEntry(value: unknown): value is WeeklyBoardEntry {
  if (!value || typeof value !== "object") return false;
  const e = value as WeeklyBoardEntry;
  return (
    typeof e.clientId === "string" &&
    typeof e.displayName === "string" &&
    typeof e.driverName === "string" &&
    TIERS.has(e.tier) &&
    typeof e.titles === "number" &&
    typeof e.wins === "number" &&
    typeof e.points === "number" &&
    typeof e.weekKey === "string" &&
    typeof e.submittedAt === "number"
  );
}

export function validateSubmission(
  payload: WeeklySubmitPayload,
  now = new Date(),
): { ok: true; entry: WeeklyBoardEntry } | { ok: false; error: string } {
  const weekKey = payload.weekKey?.trim() ?? "";
  if (!/^20\d{2}-W(0[1-9]|[1-4]\d|5[0-3])$/.test(weekKey)) {
    return { ok: false, error: "Invalid week." };
  }
  if (weekKey !== isoWeekKey(now)) {
    return { ok: false, error: "That week is closed. Play this week's grid." };
  }
  if (!payload.clientId || payload.clientId.length > 64) {
    return { ok: false, error: "Missing client id." };
  }
  const displayName = sanitizeDisplayName(payload.displayName);
  if (displayName.length < 2) {
    return { ok: false, error: "Display name needs at least 2 characters." };
  }
  const driverName = sanitizeDisplayName(payload.driverName || displayName);
  if (!TIERS.has(payload.tier)) {
    return { ok: false, error: "Invalid tier." };
  }
  const titles = Math.floor(Number(payload.titles));
  const wins = Math.floor(Number(payload.wins));
  const points = Math.floor(Number(payload.points));
  if (
    !Number.isFinite(titles) ||
    !Number.isFinite(wins) ||
    !Number.isFinite(points) ||
    titles < 0 ||
    titles > 20 ||
    wins < 0 ||
    wins > 400 ||
    points < 0 ||
    points > 20_000
  ) {
    return { ok: false, error: "Stats look out of range." };
  }

  return {
    ok: true,
    entry: {
      clientId: payload.clientId,
      displayName,
      driverName,
      tier: payload.tier,
      tierLabel: tierLabel(payload.tier),
      titles,
      wins,
      points,
      weekKey,
      submittedAt: Date.now(),
    },
  };
}

function upsertLocal(
  weekKey: string,
  entry: WeeklyBoardEntry,
): { entries: WeeklyBoardEntry[]; improved: boolean } {
  const prev = readLocalBoard(weekKey);
  const existing = prev.find((e) => e.clientId === entry.clientId);
  let improved = true;
  let next: WeeklyBoardEntry[];
  if (!existing) {
    next = [...prev, entry];
  } else if (isBetterOrEqualRun(entry, existing)) {
    improved = compareBoardEntries(
      { ...entry, submittedAt: 0 },
      { ...existing, submittedAt: 1 },
    ) < 0 ||
      entry.titles !== existing.titles ||
      entry.wins !== existing.wins ||
      entry.points !== existing.points ||
      entry.tier !== existing.tier;
    next = prev.map((e) =>
      e.clientId === entry.clientId
        ? { ...entry, submittedAt: existing.submittedAt }
        : e,
    );
    if (!improved) {
      // Keep name/driver updates even on equal stats
      next = prev.map((e) =>
        e.clientId === entry.clientId
          ? {
              ...existing,
              displayName: entry.displayName,
              driverName: entry.driverName,
              tierLabel: entry.tierLabel,
            }
          : e,
      );
    }
  } else {
    improved = false;
    next = prev.map((e) =>
      e.clientId === entry.clientId
        ? {
            ...existing,
            displayName: entry.displayName,
            driverName: entry.driverName,
          }
        : e,
    );
  }
  next = [...next].sort(compareBoardEntries).slice(0, MAX_BOARD);
  writeLocalBoard(weekKey, next);
  return { entries: next, improved };
}

async function fetchRemoteBoard(
  weekKey: string,
): Promise<WeeklyBoardEntry[] | null> {
  try {
    const res = await fetch(
      `${API_PATH}?weekKey=${encodeURIComponent(weekKey)}`,
      { headers: { Accept: "application/json" } },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { entries?: unknown };
    if (!Array.isArray(data.entries)) return null;
    return data.entries.filter(isValidEntry);
  } catch {
    return null;
  }
}

async function postRemote(
  payload: WeeklySubmitPayload,
): Promise<{
  entry: WeeklyBoardEntry;
  rank: number;
  entries: WeeklyBoardEntry[];
  improved: boolean;
} | null> {
  try {
    const res = await fetch(API_PATH, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      entry?: unknown;
      rank?: number;
      entries?: unknown;
      improved?: boolean;
    };
    if (!isValidEntry(data.entry) || !Array.isArray(data.entries)) return null;
    return {
      entry: data.entry,
      rank: typeof data.rank === "number" ? data.rank : 0,
      entries: data.entries.filter(isValidEntry),
      improved: Boolean(data.improved),
    };
  } catch {
    return null;
  }
}

export async function loadWeeklyBoard(
  weekKey: string,
): Promise<WeeklyBoardSnapshot> {
  const remote = await fetchRemoteBoard(weekKey);
  if (remote) {
    return {
      weekKey,
      entries: [...remote].sort(compareBoardEntries),
      localOnly: false,
    };
  }
  return {
    weekKey,
    entries: [...readLocalBoard(weekKey)].sort(compareBoardEntries),
    localOnly: true,
  };
}

export function careerToSubmitPayload(
  weekKey: string,
  displayName: string,
  driverName: string,
  career: Pick<CareerResult, "tier" | "titles" | "wins" | "points">,
): WeeklySubmitPayload {
  return {
    weekKey,
    clientId: getOrCreateClientId(),
    displayName,
    driverName,
    tier: career.tier,
    titles: career.titles,
    wins: career.wins,
    points: career.points,
  };
}

export async function submitWeeklyRun(
  payload: WeeklySubmitPayload,
): Promise<WeeklySubmitResult> {
  const checked = validateSubmission(payload);
  if (!checked.ok) {
    throw new Error(checked.error);
  }

  saveDisplayName(checked.entry.displayName);

  const remote = await postRemote(payload);
  if (remote) {
    return {
      entry: remote.entry,
      rank: remote.rank || rankOfClient(remote.entries, payload.clientId) || 1,
      board: {
        weekKey: payload.weekKey,
        entries: [...remote.entries].sort(compareBoardEntries),
        localOnly: false,
      },
      improved: remote.improved,
    };
  }

  const { entries, improved } = upsertLocal(payload.weekKey, checked.entry);
  const rank = rankOfClient(entries, payload.clientId) ?? 1;
  const entry = entries.find((e) => e.clientId === payload.clientId) ?? checked.entry;
  return {
    entry,
    rank,
    board: { weekKey: payload.weekKey, entries, localOnly: true },
    improved,
  };
}
