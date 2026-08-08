import { TEAM_GRADE_META } from "@/lib/teamOutcome";
import type { TeamSeasonChaseResult } from "@/lib/teamSeason";
import { copyText, playHost } from "@/lib/shareCard";

function hexAlpha(hex: string, alpha: number) {
  const raw = hex.replace("#", "");
  const full =
    raw.length === 3
      ? raw
          .split("")
          .map((c) => c + c)
          .join("")
      : raw;
  const n = Number.parseInt(full, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

export function teamShareText(input: {
  teamName: string;
  result: TeamSeasonChaseResult;
  archetype: string;
  heist: string | null;
}): string {
  const { result, archetype, heist } = input;
  const miss =
    result.brokenAtRound != null
      ? ` · first miss R${result.brokenAtRound}`
      : "";
  return [
    result.gradeLabel.toUpperCase(),
    `${input.teamName} · ${result.year}`,
    archetype,
    `${result.teamWins}/${result.calendarLength} wins${miss}`,
    heist ? `Car DNA · ${heist}` : null,
    result.principalName ? `Principal · ${result.principalName}` : null,
    result.summary,
    `Play at ${playHost()}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function paintTeamCard(
  ctx: CanvasRenderingContext2D,
  teamName: string,
  result: TeamSeasonChaseResult,
  archetype: string,
): void {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  const color = TEAM_GRADE_META[result.grade]?.color ?? "#e10600";

  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, "#141820");
  bg.addColorStop(1, "#07090c");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  const wash = ctx.createRadialGradient(200, 220, 20, 240, 300, 560);
  wash.addColorStop(0, hexAlpha(color, 0.3));
  wash.addColorStop(1, hexAlpha(color, 0));
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, w, 700);

  ctx.fillStyle = "#f4f1ea";
  ctx.font = "22px IBM Plex Mono, monospace";
  ctx.fillText("PERFECT GRID  ·  PERFECT TEAM", 72, 80);
  ctx.fillStyle = color;
  ctx.fillRect(72, 100, 160, 4);

  ctx.fillStyle = "#8b857c";
  ctx.font = "22px IBM Plex Mono, monospace";
  ctx.fillText(archetype.toUpperCase().slice(0, 40), 72, 180);

  ctx.fillStyle = "#f4f1ea";
  ctx.font = "bold 88px Bebas Neue, Impact, sans-serif";
  ctx.fillText(teamName.toUpperCase().slice(0, 22), 72, 280);

  ctx.fillStyle = color;
  ctx.font = "bold 64px Bebas Neue, Impact, sans-serif";
  ctx.fillText(result.gradeLabel.toUpperCase(), 72, 360);

  const stats = [
    ["YEAR", String(result.year)],
    ["WINS", `${result.teamWins}/${result.calendarLength}`],
    ["MISS", result.brokenAtRound != null ? `R${result.brokenAtRound}` : "—"],
    ["PERFECT", result.perfect ? "YES" : "NO"],
  ];
  stats.forEach(([label, value], i) => {
    const x = 72 + i * 240;
    ctx.fillStyle = "#8b857c";
    ctx.font = "20px IBM Plex Mono, monospace";
    ctx.fillText(label!, x, 480);
    ctx.fillStyle = "#f4f1ea";
    ctx.font = "bold 56px Bebas Neue, Impact, sans-serif";
    ctx.fillText(value!, x, 550);
  });

  ctx.fillStyle = "#8b857c";
  ctx.font = "22px IBM Plex Mono, monospace";
  ctx.fillText(result.summary.slice(0, 72), 72, 640);
  ctx.fillText(playHost(), 72, 700);
}

export async function shareTeamResult(input: {
  teamName: string;
  result: TeamSeasonChaseResult;
  archetype: string;
  heist: string | null;
}): Promise<"shared" | "copied" | "downloaded"> {
  const text = teamShareText(input);
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1350;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    const ok = await copyText(text);
    return ok ? "copied" : "downloaded";
  }
  paintTeamCard(ctx, input.teamName, input.result, input.archetype);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/png"),
  );

  if (blob && navigator.share && navigator.canShare) {
    const file = new File([blob], "perfect-team.png", { type: "image/png" });
    if (navigator.canShare({ files: [file], text })) {
      try {
        await navigator.share({ files: [file], text, title: input.teamName });
        return "shared";
      } catch {
        /* fall through */
      }
    }
  }

  const ok = await copyText(text);
  if (ok) return "copied";

  if (blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "perfect-team.png";
    a.click();
    URL.revokeObjectURL(url);
  }
  return "downloaded";
}

export function downloadTeamCard(input: {
  teamName: string;
  result: TeamSeasonChaseResult;
  archetype: string;
}) {
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1350;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  paintTeamCard(ctx, input.teamName, input.result, input.archetype);
  const url = canvas.toDataURL("image/png");
  const a = document.createElement("a");
  a.href = url;
  a.download = "perfect-team.png";
  a.click();
}
