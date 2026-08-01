/**
 * Print one simulated season table for a chosen start year.
 * Run: SEASON_YEAR=1988 node scripts/run-balance.mjs season-table.ts
 */
import { createWorld, simulateWorldSeason } from "../src/lib/fieldSim";
import { mulberry32 } from "../src/lib/game";

const year = Number(process.env.SEASON_YEAR ?? 1988);
const rand = mulberry32(Number(process.env.SEASON_SEED ?? year * 7919));
const world = createWorld(rand, year);
const result = simulateWorldSeason(world, rand);

console.log(`\n══ ${year} drivers' championship (${world.rules.calendar.length} races) ══`);
for (const row of result.standings) {
  console.log(
    `P${String(row.position).padStart(2)} ${row.name.padEnd(22)} age ${String(row.age).padStart(2)}  ` +
      `${row.team.padEnd(14)} ${String(row.wins || "—").padStart(2)}W ` +
      `${String(row.poles || "—").padStart(2)}Q ${String(row.podiums || "—").padStart(2)}P ` +
      `${String(row.points).padStart(4)} pts`,
  );
}
console.log("");
