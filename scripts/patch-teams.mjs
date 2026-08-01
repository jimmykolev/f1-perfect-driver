/**
 * Fill "Unknown Team" entries using Jolpica/Ergast driver standings.
 * Usage: node --use-system-ca scripts/patch-teams.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "src", "data", "driverSeasons.json");

function normalizeName(name) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase();
}

function isMissingTeam(team) {
  if (!team?.trim()) return true;
  const t = team.trim();
  if (/^unknown(?:\s+team)?$/i.test(t)) return true;
  // DriverDB sometimes returns the championship title instead of a constructor.
  if (/formula\s*one|world championship|fia /i.test(t)) return true;
  return false;
}

/** Manual fixes for drivers Jolpica lists under a different spelling. */
const NAME_ALIASES = {
  "alex zanardi": "alessandro zanardi",
  "max papis": "massimiliano papis",
  "nelson piquet jr": "nelson piquet jr",
  "nelson angelo piquet": "nelson piquet jr",
};

async function fetchYearTeams(year) {
  const url = `https://api.jolpi.ca/ergast/f1/${year}/driverStandings.json?limit=100`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Jolpica ${year}: HTTP ${res.status}`);
  const json = await res.json();
  const standings =
    json.MRData?.StandingsTable?.StandingsLists?.[0]?.DriverStandings ?? [];

  const byName = new Map();
  for (const row of standings) {
    const given = row.Driver?.givenName ?? "";
    const family = row.Driver?.familyName ?? "";
    const full = `${given} ${family}`.trim();
    const team = row.Constructors?.[0]?.name?.trim();
    if (!full || !team) continue;
    const key = normalizeName(full);
    byName.set(key, team);
    // Also index family-only for rare collisions we handle carefully later.
  }
  return byName;
}

async function main() {
  const data = JSON.parse(readFileSync(OUT, "utf8"));
  const years = [
    ...new Set(
      data.seasons.filter((s) => isMissingTeam(s.team)).map((s) => s.year),
    ),
  ].sort((a, b) => a - b);

  console.log(
    `Patching teams for ${years.length} years with unknown entries…`,
  );

  const teamsByYear = new Map();
  for (const year of years) {
    process.stdout.write(`  ${year}… `);
    try {
      const map = await fetchYearTeams(year);
      teamsByYear.set(year, map);
      console.log(`${map.size} drivers`);
    } catch (err) {
      console.log(`failed: ${err.message}`);
      teamsByYear.set(year, new Map());
    }
    await new Promise((r) => setTimeout(r, 120));
  }

  let fixed = 0;
  let stillMissing = 0;
  const unresolved = [];

  for (const season of data.seasons) {
    if (!isMissingTeam(season.team)) continue;
    const map = teamsByYear.get(season.year);
    const key = normalizeName(season.name);
    const aliasKey = NAME_ALIASES[key] ?? key;
    const team = map?.get(aliasKey) ?? map?.get(key);
    if (team) {
      season.team = team;
      fixed++;
    } else {
      stillMissing++;
      unresolved.push(`${season.year}:${season.name}`);
    }
  }

  writeFileSync(OUT, JSON.stringify(data, null, 2));
  console.log(`\nFixed ${fixed} · still unknown ${stillMissing}`);
  if (unresolved.length) {
    console.log("Unresolved:");
    for (const row of unresolved.slice(0, 40)) console.log(`  ${row}`);
    if (unresolved.length > 40) console.log(`  …+${unresolved.length - 40} more`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
