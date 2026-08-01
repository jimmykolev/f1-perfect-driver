/**
 * Check simulated grids across eras for duplicate drivers, duplicate ids,
 * invented names, empty seats, and implausible ages.
 * Run: node scripts/run-balance.mjs grid-audit.ts
 */
import data from "../src/data/driverSeasons.json";
import juniorData from "../src/data/juniorDrivers.json";
import { createWorld, runOffseason, simulateWorldSeason } from "../src/lib/fieldSim";
import { cleanJuniorName } from "../src/lib/juniors";
import { mulberry32, simulateCareer } from "../src/lib/game";
import { ATTRIBUTE_KEYS, type DriverDataFile } from "../src/types";

const realNames = new Set((data as DriverDataFile).seasons.map((s) => s.name));
for (const j of (juniorData as { drivers: { name: string }[] }).drivers) {
  realNames.add(cleanJuniorName(j.name));
}

const YEARS = (process.env.AUDIT_YEARS ?? "1988,1994,2001,2008,2014,2021,2026")
  .split(",")
  .map(Number);
const SEASONS = Number(process.env.AUDIT_SEASONS ?? 10);
let problems = 0;

function dupes(values: string[]): string[] {
  return [...new Set(values.filter((v, i) => values.indexOf(v) !== i))];
}

for (const startYear of YEARS) {
  const rand = mulberry32(startYear * 7919);
  const world = createWorld(rand, startYear);

  for (let i = 0; i < SEASONS; i++) {
    const year = world.year;
    const result = simulateWorldSeason(world, rand);

    const issues: string[] = [];
    const dupNames = dupes(world.drivers.map((d) => d.name));
    if (dupNames.length) issues.push(`dup drivers: ${dupNames.join(", ")}`);

    const dupIds = dupes(world.drivers.map((d) => d.id));
    if (dupIds.length) issues.push(`dup ids: ${dupIds.join(", ")}`);

    const standDupes = dupes(result.standings.map((s) => s.name));
    if (standDupes.length) issues.push(`dup standings: ${standDupes.join(", ")}`);

    const fake = world.drivers
      .filter((d) => !d.isPlayer && !realNames.has(d.name))
      .map((d) => d.name);
    if (fake.length) issues.push(`invented: ${[...new Set(fake)].join(", ")}`);

    const badSeats = world.teams
      .map((t) => [t.name, world.drivers.filter((d) => d.team === t.name).length] as const)
      .filter(([, n]) => n !== 2);
    if (badSeats.length) {
      issues.push(`seats: ${badSeats.map(([n, c]) => `${n}=${c}`).join(", ")}`);
    }

    const ages = world.drivers.map((d) => d.age);
    const distinct = new Set(ages).size;
    if (distinct < 6) issues.push(`only ${distinct} distinct ages`);

    if (i === 0 || issues.length) {
      console.log(
        `${year}  teams=${world.teams.length} drivers=${world.drivers.length}` +
          ` ages ${Math.min(...ages)}-${Math.max(...ages)} (${distinct} distinct)` +
          (issues.length ? `\n   ⚠ ${issues.join("\n   ⚠ ")}` : "  ok"),
      );
    }
    problems += issues.length;

    runOffseason(world, result, rand);
  }
}

/* ---- Full player careers: the standings a real player actually sees ---- */

const LOCKED = ATTRIBUTE_KEYS.map((key, i) => ({
  key,
  value: 70 + ((i * 7) % 20),
}));

for (const startYear of YEARS) {
  for (let seed = 1; seed <= 3; seed++) {
    const career = simulateCareer(LOCKED, {
      seed: startYear * 100 + seed,
      playerName: "Test Driver",
      startYear,
    });

    const issues: string[] = [];
    for (const season of career.seasons) {
      const names = season.standings.map((s) => s.name);
      const dup = dupes(names);
      if (dup.length) issues.push(`${season.year} dup: ${dup.join(", ")}`);

      const fake = season.standings
        .filter((s) => !s.isPlayer && !realNames.has(s.name))
        .map((s) => s.name);
      if (fake.length) {
        issues.push(`${season.year} invented: ${[...new Set(fake)].join(", ")}`);
      }
    }
    if (issues.length) {
      console.log(`career ${startYear} seed ${seed}\n   ⚠ ${issues.join("\n   ⚠ ")}`);
      problems += issues.length;
    }
  }
}

console.log(problems === 0 ? "\nOK: no problems found" : `\n${problems} problems found`);
