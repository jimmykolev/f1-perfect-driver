/**
 * Eyeball the simulated world: starting ratings, a season table, and how the
 * grid ages and reshuffles over a decade.
 * Run: node scripts/run-balance.mjs world-report.ts
 */
import {
  createWorld,
  marketValue,
  runOffseason,
  simulateWorldSeason,
} from "../src/lib/fieldSim";
import { mulberry32 } from "../src/lib/game";

const rand = mulberry32(Number(process.env.WORLD_SEED ?? 20260731));
const world = createWorld(rand);

console.log("\n══ 2026 grid ══");
for (const team of [...world.teams].sort((a, b) => a.rank - b.rank)) {
  const seats = world.drivers
    .filter((d) => d.team === team.name)
    .sort((a, b) => b.overall - a.overall)
    .map((d) => `${d.name} ${d.overall} (${d.age}, pot ${d.potential}, val ${marketValue(d).toFixed(0)})`);
  console.log(
    `T${team.tier} ${team.name.padEnd(14)} car ${team.power.toFixed(0)} rel ${team.reliability.toFixed(2)} | ${seats.join(" · ")}`,
  );
}

const YEARS = Number(process.env.WORLD_YEARS ?? 12);
let dnfCount = 0;
let raceStarts = 0;

for (let i = 0; i < YEARS; i++) {
  const year = world.year;
  const result = simulateWorldSeason(world, rand);

  raceStarts += result.standings.length * 24;
  dnfCount += [...result.totals.values()].reduce((sum, t) => sum + t.dnfs, 0);

  if (i === 0) {
    console.log(`\n══ ${year} championship ══`);
    for (const row of result.standings) {
      console.log(
        `P${String(row.position).padStart(2)} ${row.name.padEnd(24)} ${row.team.padEnd(14)} ${String(row.points).padStart(4)} pts · ${row.wins}W ${row.podiums}P ${row.poles}Q · age ${row.age}`,
      );
    }
    console.log("\nConstructors:");
    for (const row of result.constructors) {
      console.log(`  P${String(row.position).padStart(2)} ${row.team.padEnd(14)} ${row.points}`);
    }
  }

  const scorers = result.standings.filter((r) => r.points > 0).length;
  const report = runOffseason(world, result, rand);
  const ages = world.drivers.map((d) => d.age);
  const overalls = world.drivers.map((d) => d.overall);
  console.log(
    `\n${year}: champion ${result.championName} (${result.championTeam}, ${result.championPoints} pts)` +
      ` · winners ${result.standings.filter((r) => r.wins > 0).length}` +
      ` · scorers ${scorers}/22` +
      ` · avg age ${(ages.reduce((a, b) => a + b, 0) / ages.length).toFixed(1)}` +
      ` (${Math.min(...ages)}-${Math.max(...ages)})` +
      ` · avg OVR ${(overalls.reduce((a, b) => a + b, 0) / overalls.length).toFixed(1)}` +
      ` (max ${Math.max(...overalls)})`,
  );
  if (report.retirements.length) {
    console.log(`   retired: ${report.retirements.map((r) => `${r.name} (${r.age})`).join(", ")}`);
  }
  if (report.promotions.length) {
    console.log(`   rookies: ${report.promotions.map((p) => `${p.name}→${p.team}`).join(", ")}`);
  }
  if (report.moves.length) {
    console.log(`   moves:   ${report.moves.map((m) => `${m.name} ${m.from}→${m.to}`).join(", ")}`);
  }
}

console.log(`\nDNF rate: ${((dnfCount / raceStarts) * 100).toFixed(1)}% of race starts`);
console.log(`\n══ ${world.year} pecking order ══`);
for (const team of [...world.teams].sort((a, b) => a.rank - b.rank)) {
  const seats = world.drivers
    .filter((d) => d.team === team.name)
    .map((d) => `${d.name} ${d.overall} (${d.age})`);
  console.log(`T${team.tier} ${team.name.padEnd(14)} car ${team.power.toFixed(0)} | ${seats.join(" · ")}`);
}
console.log("");
