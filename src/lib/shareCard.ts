import { careerScarLines } from "@/lib/careerStory";
import { weeklyShareLine } from "@/lib/weeklyGrid";
import type { CareerResult, LockedAttribute, SignatureTrait } from "@/types";

export interface BroadcastBeatLine {
  year?: number;
  tag: string;
  title: string;
}

const TIER_COLORS: Record<string, string> = {
  legend: "#f5c518",
  champion: "#7ddea2",
  raceWinner: "#e10600",
  podiumThreat: "#f0a36b",
  pointsRegular: "#b0aaa2",
  nobody: "#8b857c",
};

/** Story lines shared by the clipboard result and PNG card. */
export function careerShareStoryLines(career: CareerResult): string[] {
  const scars = careerScarLines(career);
  if (!career.rival) return scars;

  return [...scars, `Chief rival: ${career.rival.blurb}`];
}

/** Top DNA steals for share identity — short “heist” credits. */
export function heistCredits(
  locked: LockedAttribute[],
  limit = 3,
): string | null {
  if (!locked.length) return null;
  return [...locked]
    .sort((a, b) => b.value - a.value)
    .slice(0, limit)
    .map((item) => {
      const surname = item.from.name.trim().split(/\s+/).pop() ?? item.from.name;
      const yy = String(item.from.year).slice(-2);
      return `${surname} '${yy}`;
    })
    .join(" · ");
}

/** Host for share CTAs (no protocol). */
export function playHost(): string {
  if (typeof window === "undefined" || !window.location?.host) {
    return "Perfect Driver";
  }
  return window.location.host;
}

/** Copy text to the clipboard; falls back to a temporary textarea. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(area);
      return ok;
    } catch {
      return false;
    }
  }
}

/** Plain-text career card — short enough to post. */
export function careerShareText(
  driverName: string,
  career: CareerResult,
  beats: BroadcastBeatLine[] = [],
  locked: LockedAttribute[] = [],
  weekKey: string | null = null,
): string {
  const first = career.seasons[0];
  const last = career.seasons[career.seasons.length - 1];
  const span =
    first && last
      ? first.year === last.year
        ? `${first.year}`
        : `${first.year}–${last.year}`
      : null;
  const beat = beats[0];
  const beatLine = beat
    ? `▸ ${beat.year ? `${beat.year} · ` : ""}${beat.title}`
    : null;
  const heist = heistCredits(locked);
  const weekly = weeklyShareLine(weekKey);
  const lines = [
    career.tierLabel.toUpperCase(),
    `${driverName} · OVR ${career.overall}`,
    `${career.titles} title${career.titles === 1 ? "" : "s"} · ${career.wins} win${career.wins === 1 ? "" : "s"}`,
    first
      ? `${first.team}${span ? ` · ${span}` : ""}`
      : null,
    beatLine,
    career.rival ? `Rival: ${career.rival.name}` : null,
    heist ? `DNA: ${heist}` : null,
    weekly,
    `Build yours → ${playHost()}`,
    weekKey ? "#PerfectDriver #PDGrid" : "#PerfectDriver",
  ].filter(Boolean);
  return lines.join("\n");
}

export function buildShareText(
  driverName: string,
  overall: number,
  archetype: string,
  traits: SignatureTrait[],
  weekKey: string | null = null,
): string {
  const weekly = weeklyShareLine(weekKey);
  return [
    `${driverName} — OVR ${overall}`,
    archetype,
    traits.length ? `Traits: ${traits.map((t) => t.name).join(", ")}` : null,
    weekly,
    `Build yours → ${playHost()}`,
    weekKey ? "#PerfectDriver #PDGrid" : "#PerfectDriver",
  ]
    .filter(Boolean)
    .join("\n");
}

function paintCareerCard(
  ctx: CanvasRenderingContext2D,
  driverName: string,
  career: CareerResult,
  beats: BroadcastBeatLine[],
  locked: LockedAttribute[],
  weekKey: string | null = null,
): void {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  const tierColor = TIER_COLORS[career.tier] ?? "#e10600";

  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, "#141820");
  bg.addColorStop(0.5, "#0d1016");
  bg.addColorStop(1, "#07090c");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = "rgba(244, 241, 234, 0.035)";
  for (let x = 36; x < w; x += 48) {
    ctx.fillRect(x, 0, 1, h);
  }

  const wash = ctx.createRadialGradient(180, 200, 20, 220, 280, 580);
  wash.addColorStop(0, hexAlpha(tierColor, 0.32));
  wash.addColorStop(1, hexAlpha(tierColor, 0));
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, w, 720);

  ctx.fillStyle = "#e10600";
  ctx.fillRect(72, 64, 10, 10);
  ctx.fillStyle = "#f4f1ea";
  ctx.font = "24px IBM Plex Mono, monospace";
  ctx.fillText(
    weekKey ? `PD  ·  WEEKLY GRID  ·  ${weekKey}` : "PD  ·  CLASSIFIED",
    94,
    74,
  );
  ctx.fillStyle = tierColor;
  ctx.fillRect(72, 92, 160, 4);

  ctx.fillStyle = "rgba(0, 0, 0, 0.62)";
  ctx.fillRect(48, 160, 984, 280);
  ctx.fillStyle = tierColor;
  ctx.fillRect(48, 160, 16, 280);

  ctx.fillStyle = "#8b857c";
  ctx.font = "22px IBM Plex Mono, monospace";
  ctx.fillText(career.archetype.toUpperCase().slice(0, 42), 90, 210);

  ctx.fillStyle = "#f4f1ea";
  ctx.font = "bold 96px Bebas Neue, Impact, sans-serif";
  ctx.fillText(driverName.toUpperCase().slice(0, 20), 90, 310);

  ctx.fillStyle = tierColor;
  ctx.font = "bold 72px Bebas Neue, Impact, sans-serif";
  ctx.fillText(career.tierLabel.toUpperCase(), 90, 400);

  const stats = [
    ["TITLES", String(career.titles)],
    ["WINS", String(career.wins)],
    ["PODIUMS", String(career.podiums)],
    ["PTS", String(career.points)],
  ];
  stats.forEach(([label, value], i) => {
    const x = 72 + i * 240;
    ctx.fillStyle = "#8b857c";
    ctx.font = "22px IBM Plex Mono, monospace";
    ctx.fillText(label!, x, 520);
    ctx.fillStyle = "#f4f1ea";
    ctx.font = "bold 72px Bebas Neue, Impact, sans-serif";
    ctx.fillText(value!, x, 600);
  });

  const first = career.seasons[0];
  const last = career.seasons[career.seasons.length - 1];
  const span =
    first && last
      ? first.year === last.year
        ? `${first.year}`
        : `${first.year}–${last.year}`
      : "";

  ctx.fillStyle = "#8b857c";
  ctx.font = "24px IBM Plex Mono, monospace";
  ctx.fillText(
    first
      ? `${first.team}  ·  ${span}  ·  OVR ${career.overall}`
      : `OVR ${career.overall}`,
    72,
    670,
  );

  let cursor = 740;
  const beat = beats[0];
  if (beat) {
    ctx.fillStyle = "#8b857c";
    ctx.font = "22px IBM Plex Mono, monospace";
    ctx.fillText("DEFINING MOMENT", 72, cursor);
    cursor += 48;
    ctx.fillStyle = tierColor;
    ctx.fillRect(72, cursor - 24, 6, 52);
    ctx.fillStyle = "#b0aaa2";
    ctx.font = "22px IBM Plex Mono, monospace";
    ctx.fillText(
      `${beat.year ?? ""}  ${beat.tag}`.trim().toUpperCase(),
      92,
      cursor,
    );
    ctx.fillStyle = "#f4f1ea";
    ctx.font = "36px Barlow, sans-serif";
    cursor = wrapText(ctx, beat.title, 92, cursor + 40, 860, 40) + 56;
  } else {
    const scar = careerShareStoryLines(career)[0];
    if (scar) {
      ctx.fillStyle = "#f4f1ea";
      ctx.font = "34px Barlow, sans-serif";
      cursor = wrapText(ctx, scar, 72, cursor, 900, 40) + 48;
    }
  }

  if (career.rival) {
    ctx.fillStyle = "#8b857c";
    ctx.font = "22px IBM Plex Mono, monospace";
    ctx.fillText("CHIEF RIVAL", 72, cursor);
    ctx.fillStyle = "#f4f1ea";
    ctx.font = "bold 44px Bebas Neue, Impact, sans-serif";
    ctx.fillText(career.rival.name.toUpperCase().slice(0, 28), 72, cursor + 52);
    cursor += 100;
  }

  const heist = heistCredits(locked);
  if (heist) {
    ctx.fillStyle = "#8b857c";
    ctx.font = "22px IBM Plex Mono, monospace";
    ctx.fillText("DNA", 72, Math.min(cursor, 1180));
    ctx.fillStyle = "#b0aaa2";
    ctx.font = "28px Barlow, sans-serif";
    ctx.fillText(heist.slice(0, 48), 72, Math.min(cursor + 42, 1220));
  }

  ctx.fillStyle = "#8b857c";
  ctx.font = "22px IBM Plex Mono, monospace";
  ctx.fillText(
    weekKey
      ? `PERFECT DRIVER  ·  ${weekKey}  ·  #PDGrid`
      : `PERFECT DRIVER  ·  ${playHost()}`,
    72,
    1280,
  );
}

/** Build the share PNG as a Blob (for Web Share / download / preview). */
export async function careerCardBlob(
  driverName: string,
  career: CareerResult,
  beats: BroadcastBeatLine[] = [],
  locked: LockedAttribute[] = [],
  weekKey: string | null = null,
): Promise<Blob | null> {
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1350;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  paintCareerCard(ctx, driverName, career, beats, locked, weekKey);
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/png");
  });
}

/** Broadcast-style shareable PNG card download. */
export function downloadCareerCard(
  driverName: string,
  career: CareerResult,
  beats: BroadcastBeatLine[] = [],
  locked: LockedAttribute[] = [],
  weekKey: string | null = null,
): void {
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1350;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  paintCareerCard(ctx, driverName, career, beats, locked, weekKey);

  const link = document.createElement("a");
  link.download = `${driverName.replace(/\s+/g, "-").toLowerCase()}-career.png`;
  link.href = canvas.toDataURL("image/png");
  link.click();
}

/** Prefer OS share sheet (with image when supported); else download + copy text. */
export async function shareCareerResult(
  driverName: string,
  career: CareerResult,
  beats: BroadcastBeatLine[] = [],
  locked: LockedAttribute[] = [],
  weekKey: string | null = null,
): Promise<"shared" | "downloaded" | "failed"> {
  const text = careerShareText(driverName, career, beats, locked, weekKey);
  const blob = await careerCardBlob(driverName, career, beats, locked, weekKey);
  const fileName = `${driverName.replace(/\s+/g, "-").toLowerCase()}-career.png`;

  try {
    if (blob && typeof navigator !== "undefined" && navigator.share) {
      const file = new File([blob], fileName, { type: "image/png" });
      const data: ShareData = { title: `${driverName} — Perfect Driver`, text };
      const canFiles =
        typeof navigator.canShare === "function"
          ? navigator.canShare({ files: [file] })
          : false;
      if (canFiles) {
        await navigator.share({ ...data, files: [file] });
        return "shared";
      }
      await navigator.share(data);
      if (blob) {
        const link = document.createElement("a");
        link.download = fileName;
        link.href = URL.createObjectURL(blob);
        link.click();
        URL.revokeObjectURL(link.href);
      }
      return "shared";
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return "failed";
    }
  }

  downloadCareerCard(driverName, career, beats, locked, weekKey);
  await copyText(text);
  return "downloaded";
}

function hexAlpha(hex: string, alpha: number): string {
  const raw = hex.replace("#", "");
  if (raw.length !== 6) return `rgba(225, 6, 0, ${alpha})`;
  const r = Number.parseInt(raw.slice(0, 2), 16);
  const g = Number.parseInt(raw.slice(2, 4), 16);
  const b = Number.parseInt(raw.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
): number {
  const words = text.split(" ");
  let line = "";
  let cursor = y;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth) {
      ctx.fillText(line, x, cursor);
      line = word;
      cursor += lineHeight;
    } else {
      line = test;
    }
  }
  if (line) {
    ctx.fillText(line, x, cursor);
    return cursor;
  }
  return y;
}
