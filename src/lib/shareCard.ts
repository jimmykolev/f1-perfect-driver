import type { CareerResult, SignatureTrait } from "@/types";

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

/** Plain-text career card for clipboard sharing. */
export function careerShareText(
  driverName: string,
  career: CareerResult,
): string {
  const first = career.seasons[0];
  const last = career.seasons[career.seasons.length - 1];
  const span =
    first && last
      ? first.year === last.year
        ? `${first.year}`
        : `${first.year}–${last.year}`
      : null;
  const debut =
    first != null ? `Debut: ${first.team}${span ? ` · ${span}` : ""}` : null;
  const rival = career.rival
    ? `Rival: ${career.rival.name} (${career.rival.wins}–${career.rival.losses})`
    : null;
  const traits = career.traits.length
    ? `Traits: ${career.traits.map((t) => t.name).join(", ")}`
    : null;
  const lines = [
    `${driverName} — ${career.tierLabel}`,
    career.summary,
    `${career.titles} titles · ${career.wins} wins · ${career.podiums} podiums · ${career.points} pts`,
    `OVR ${career.overall} · ${career.archetype}`,
    debut,
    rival,
    traits,
    "Built in Perfect Driver",
  ].filter(Boolean);
  return lines.join("\n");
}

export function buildShareText(
  driverName: string,
  overall: number,
  archetype: string,
  traits: SignatureTrait[],
): string {
  return [
    `${driverName} — OVR ${overall}`,
    archetype,
    traits.length ? `Traits: ${traits.map((t) => t.name).join(", ")}` : null,
    "Perfect Driver build",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Draw a simple shareable PNG card to a canvas and trigger download. */
export function downloadCareerCard(
  driverName: string,
  career: CareerResult,
): void {
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1350;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const bg = ctx.createLinearGradient(0, 0, 0, canvas.height);
  bg.addColorStop(0, "#151820");
  bg.addColorStop(1, "#08090c");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "#e10600";
  ctx.fillRect(0, 0, 18, canvas.height);

  ctx.fillStyle = "#8b857c";
  ctx.font = "28px IBM Plex Mono, monospace";
  ctx.fillText("PERFECT DRIVER", 72, 90);

  ctx.fillStyle = "#f4f1ea";
  ctx.font = "bold 96px Bebas Neue, Impact, sans-serif";
  ctx.fillText(driverName.toUpperCase(), 72, 210);

  ctx.fillStyle = "#f5c518";
  ctx.font = "bold 64px Bebas Neue, Impact, sans-serif";
  ctx.fillText(career.tierLabel.toUpperCase(), 72, 290);

  ctx.fillStyle = "#b0aaa2";
  ctx.font = "32px Barlow, sans-serif";
  wrapText(ctx, career.summary, 72, 360, 920, 42);

  const stats = [
    ["TITLES", String(career.titles)],
    ["WINS", String(career.wins)],
    ["PODIUMS", String(career.podiums)],
    ["POINTS", String(career.points)],
  ];
  stats.forEach(([label, value], i) => {
    const x = 72 + i * 240;
    ctx.fillStyle = "#8b857c";
    ctx.font = "22px IBM Plex Mono, monospace";
    ctx.fillText(label!, x, 560);
    ctx.fillStyle = "#f4f1ea";
    ctx.font = "bold 72px Bebas Neue, Impact, sans-serif";
    ctx.fillText(value!, x, 640);
  });

  ctx.fillStyle = "#8b857c";
  ctx.font = "24px IBM Plex Mono, monospace";
  const first = career.seasons[0];
  const last = career.seasons[career.seasons.length - 1];
  const span =
    first && last
      ? first.year === last.year
        ? `${first.year}`
        : `${first.year}–${last.year}`
      : "";
  ctx.fillText(
    first
      ? `OVR ${career.overall}  ·  ${career.archetype}  ·  ${first.team}  ·  ${span}`
      : `OVR ${career.overall}  ·  ${career.archetype}`,
    72,
    740,
  );

  if (career.rival) {
    ctx.fillStyle = "#f4f1ea";
    ctx.font = "28px Barlow, sans-serif";
    ctx.fillText(
      `Rival ${career.rival.name}: ${career.rival.wins}–${career.rival.losses}`,
      72,
      820,
    );
  }

  if (career.traits.length) {
    ctx.fillStyle = "#f5c518";
    ctx.font = "26px IBM Plex Mono, monospace";
    ctx.fillText(
      career.traits.map((t) => t.name.toUpperCase()).join("  ·  "),
      72,
      900,
    );
  }

  ctx.fillStyle = "#8b857c";
  ctx.font = "22px IBM Plex Mono, monospace";
  ctx.fillText("perfect-driver", 72, 1260);

  const link = document.createElement("a");
  link.download = `${driverName.replace(/\s+/g, "-").toLowerCase()}-career.png`;
  link.href = canvas.toDataURL("image/png");
  link.click();
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
) {
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
  if (line) ctx.fillText(line, x, cursor);
}
