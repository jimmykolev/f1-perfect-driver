/**
 * Print one career the way the UI would tell it.
 * Run: node scripts/run-balance.mjs career-report.ts
 */
import { attrsFromOverall, lockedFromAttrs, simulateCareer } from "../src/lib/game";

const overall = Number(process.env.CAREER_OVR ?? 84);
const seed = Number(process.env.CAREER_SEED ?? 20260731);
const career = simulateCareer(lockedFromAttrs(attrsFromOverall(overall)), seed, "Jimmy Fast");

console.log(`\n${career.tierLabel} · ${career.archetype} · OVR ${career.overall}`);
console.log(career.summary);
console.log(
  `\nDebut at ${career.debutAge}, done at ${career.finalAge} (${career.endReason})` +
    ` · ${career.titles} titles · ${career.wins} wins · ${career.podiums} podiums · ${career.points} pts\n`,
);

for (const season of career.seasons) {
  console.log(
    `${season.year}  ${season.team.padEnd(14)} T${season.teamTier}  P${String(season.position).padStart(2)}  ` +
      `${String(season.points).padStart(3)} pts  ${season.wins}W ${season.podiums}pod ${season.poles}Q ${season.dnfs}dnf  age ${season.age}`,
  );
  console.log(`        ${season.seatNote}`);
  console.log(
    `        title: ${season.championName} (${season.championPoints}) · WCC: ${season.constructors[0]!.team}`,
  );
  const note = season.offseason;
  if (note) {
    const lines = [...note.retirements, ...note.promotions, ...note.moves];
    if (lines.length) console.log(`        winter: ${lines.join(" | ")}`);
  }
}

const sample = career.seasons[Math.min(2, career.seasons.length - 1)]!;
console.log(`\nRace log sample — ${sample.year}`);
for (const race of sample.races.slice(0, 8)) {
  console.log(
    `  R${String(race.round).padStart(2)} ${race.name.padEnd(20)} grid P${String(race.grid).padStart(2)} → ` +
      `${race.finish == null ? `DNF (${race.dnfReason})` : `P${race.finish}`}  ${race.points} pts` +
      `${race.sprintPoints ? ` (sprint +${race.sprintPoints})` : ""}${race.pole ? " POLE" : ""}`,
  );
}
console.log("");
