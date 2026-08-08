import { getStore } from "@netlify/blobs";
import type { Context } from "@netlify/functions";

type CareerTier =
  | "legend"
  | "champion"
  | "raceWinner"
  | "podiumThreat"
  | "pointsRegular"
  | "nobody";

interface BoardEntry {
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

const MAX_BOARD = 100;
const MAX_NAME = 24;

const TIER_RANK: Record<CareerTier, number> = {
  legend: 6,
  champion: 5,
  raceWinner: 4,
  podiumThreat: 3,
  pointsRegular: 2,
  nobody: 1,
};

const TIER_LABEL: Record<CareerTier, string> = {
  legend: "Legend",
  champion: "World Champion",
  raceWinner: "Race Winner",
  podiumThreat: "Podium Threat",
  pointsRegular: "Points Regular",
  nobody: "Nobody",
};

const TIERS = new Set(Object.keys(TIER_RANK));

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

function isoWeekKey(date = new Date()): string {
  const d = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
  );
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(
    ((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7,
  );
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

function sanitizeDisplayName(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_NAME);
}

function compare(
  a: BoardEntry,
  b: BoardEntry,
): number {
  const tier = (TIER_RANK[b.tier] ?? 0) - (TIER_RANK[a.tier] ?? 0);
  if (tier !== 0) return tier;
  if (b.titles !== a.titles) return b.titles - a.titles;
  if (b.wins !== a.wins) return b.wins - a.wins;
  if (b.points !== a.points) return b.points - a.points;
  return a.submittedAt - b.submittedAt;
}

function isBetterOrEqual(next: BoardEntry, prev: BoardEntry): boolean {
  return compare({ ...next, submittedAt: 0 }, { ...prev, submittedAt: 1 }) <= 0;
}

function isEntry(value: unknown): value is BoardEntry {
  if (!value || typeof value !== "object") return false;
  const e = value as BoardEntry;
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

async function readBoard(weekKey: string): Promise<BoardEntry[]> {
  try {
    const store = getStore("weekly-leaderboard");
    const raw = await store.get(weekKey, { type: "json" });
    if (!Array.isArray(raw)) return [];
    return raw.filter(isEntry);
  } catch {
    return [];
  }
}

async function writeBoard(weekKey: string, entries: BoardEntry[]): Promise<void> {
  const store = getStore("weekly-leaderboard");
  await store.setJSON(weekKey, entries.slice(0, MAX_BOARD));
}

function parsePayload(body: unknown): BoardEntry | { error: string } {
  if (!body || typeof body !== "object") return { error: "Invalid body." };
  const p = body as Record<string, unknown>;
  const weekKey = typeof p.weekKey === "string" ? p.weekKey.trim() : "";
  if (!/^20\d{2}-W(0[1-9]|[1-4]\d|5[0-3])$/.test(weekKey)) {
    return { error: "Invalid week." };
  }
  if (weekKey !== isoWeekKey()) {
    return { error: "That week is closed. Play this week's grid." };
  }
  const clientId = typeof p.clientId === "string" ? p.clientId.trim() : "";
  if (!clientId || clientId.length > 64) return { error: "Missing client id." };
  const displayName = sanitizeDisplayName(p.displayName);
  if (displayName.length < 2) {
    return { error: "Display name needs at least 2 characters." };
  }
  const driverName = sanitizeDisplayName(p.driverName) || displayName;
  const tier = p.tier;
  if (typeof tier !== "string" || !TIERS.has(tier)) {
    return { error: "Invalid tier." };
  }
  const titles = Math.floor(Number(p.titles));
  const wins = Math.floor(Number(p.wins));
  const points = Math.floor(Number(p.points));
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
    return { error: "Stats look out of range." };
  }
  return {
    clientId,
    displayName,
    driverName,
    tier: tier as CareerTier,
    tierLabel: TIER_LABEL[tier as CareerTier],
    titles,
    wins,
    points,
    weekKey,
    submittedAt: Date.now(),
  };
}

export default async (req: Request, _context: Context) => {
  if (req.method === "OPTIONS") {
    return json({ ok: true });
  }

  if (req.method === "GET") {
    const url = new URL(req.url);
    const weekKey = url.searchParams.get("weekKey")?.trim() || isoWeekKey();
    if (!/^20\d{2}-W(0[1-9]|[1-4]\d|5[0-3])$/.test(weekKey)) {
      return json({ error: "Invalid week." }, 400);
    }
    const entries = (await readBoard(weekKey)).sort(compare);
    return json({ weekKey, entries });
  }

  if (req.method === "POST") {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return json({ error: "Invalid JSON." }, 400);
    }
    const parsed = parsePayload(body);
    if ("error" in parsed) return json({ error: parsed.error }, 400);

    const prev = await readBoard(parsed.weekKey);
    const existing = prev.find((e) => e.clientId === parsed.clientId);
    let improved = true;
    let next: BoardEntry[];

    if (!existing) {
      next = [...prev, parsed];
    } else if (isBetterOrEqual(parsed, existing)) {
      const strictlyBetter =
        compare({ ...parsed, submittedAt: 0 }, { ...existing, submittedAt: 1 }) <
        0;
      improved =
        strictlyBetter ||
        parsed.tier !== existing.tier ||
        parsed.titles !== existing.titles ||
        parsed.wins !== existing.wins ||
        parsed.points !== existing.points;
      next = prev.map((e) =>
        e.clientId === parsed.clientId
          ? {
              ...(improved ? parsed : existing),
              displayName: parsed.displayName,
              driverName: parsed.driverName,
              tierLabel: improved ? parsed.tierLabel : existing.tierLabel,
              submittedAt: existing.submittedAt,
            }
          : e,
      );
    } else {
      improved = false;
      next = prev.map((e) =>
        e.clientId === parsed.clientId
          ? {
              ...existing,
              displayName: parsed.displayName,
              driverName: parsed.driverName,
            }
          : e,
      );
    }

    next = next.sort(compare).slice(0, MAX_BOARD);
    await writeBoard(parsed.weekKey, next);
    const entry = next.find((e) => e.clientId === parsed.clientId) ?? parsed;
    const rank = next.findIndex((e) => e.clientId === parsed.clientId) + 1;
    return json({ weekKey: parsed.weekKey, entry, rank, entries: next, improved });
  }

  return json({ error: "Method not allowed." }, 405);
};
