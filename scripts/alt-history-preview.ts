/**
 * Preview the alternate-history report for a sample career.
 * Run: START_YEAR=1989 node scripts/run-balance.mjs alt-history-preview.ts
 */
import { buildAlternateHistory } from "../src/lib/altHistory";
import { attrsFromOverall, lockedFromAttrs, simulateCareer } from "../src/lib/game";

const startYear = Number(process.env.START_YEAR ?? 1989);
const seed = Number(process.env.SEED ?? startYear);
const name = process.env.PLAYER ?? "Hideki Sato";

const career = simulateCareer(lockedFromAttrs(attrsFromOverall(90)), {
  seed,
  playerName: name,
  startYear,
  debutTeam: process.env.DEBUT_TEAM || "McLaren",
});

const report = buildAlternateHistory(career, name);
if (!report) {
  console.log("No alternate history for this career.");
} else {
  console.log(`\n== ${report.headline} ==`);
  console.log(report.lede);
  console.log(
    `\nStats: ${report.titlesRewritten} changed · ${report.titlesTaken} taken by you · ${report.yearsCompared} years`,
  );
  if (report.fork) console.log(`Fork: ${report.fork.line}`);

  console.log("\n-- Timeline --");
  const mark = { youTook: "★", flipped: "▲", held: "·" } as const;
  for (const row of report.years) {
    const real = row.realChampion?.name ?? "—";
    const sim = row.playerIsChampion ? `${name} (you)` : row.simChampion.name;
    console.log(
      `${mark[row.status]} ${row.year}  real: ${real.padEnd(20)} yours: ${sim.padEnd(22)} you: P${row.playerPosition} ${row.playerTeam}`,
    );
  }

  console.log("\n-- Legends --");
  for (const legend of report.legends.slice(0, 8)) {
    const lost = legend.lost.length ? ` lost[${legend.lost.join(",")}]` : "";
    const kept = legend.kept.length ? ` kept[${legend.kept.join(",")}]` : "";
    const gained = legend.gained.length ? ` gained[${legend.gained.join(",")}]` : "";
    console.log(
      `${legend.isPlayer ? "YOU " : "    "}${legend.name.padEnd(22)}${lost}${kept}${gained}`,
    );
  }

  console.log("\n-- Ledger --");
  for (const line of report.ledger) console.log(`• ${line}`);
  console.log("");
}
