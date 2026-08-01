/**
 * Fetch race calendars (and sprint rounds) for every year in the driver dataset.
 * Usage: node --use-system-ca scripts/fetch-calendars.mjs [startYear] [endYear]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DRIVER_DATA = join(ROOT, "src", "data", "driverSeasons.json");
const OUT = join(ROOT, "src", "data", "seasonCalendars.json");

const driverMeta = JSON.parse(readFileSync(DRIVER_DATA, "utf8"));
const startYear = Number(process.argv[2] ?? driverMeta.years[0]);
const endYear = Number(process.argv[3] ?? driverMeta.years[driverMeta.years.length - 1]);

function shortGpName(raceName) {
  return raceName
    .replace(/\s+Grand Prix$/i, " GP")
    .replace(/\s+GP$/i, " GP")
    .trim();
}

async function fetchYear(year) {
  const res = await fetch(`https://api.jolpi.ca/ergast/f1/${year}.json`, {
    headers: { "User-Agent": "f1-perfect-driver/1.0" },
  });
  if (!res.ok) throw new Error(`${year}: HTTP ${res.status}`);
  const json = await res.json();
  const races = json.MRData?.RaceTable?.Races ?? [];
  const calendar = races.map((r) => shortGpName(r.raceName));
  const sprintRounds = races
    .map((r, i) => (r.Sprint ? i + 1 : null))
    .filter((n) => n != null);

  // Jolpica may omit Sprint flags on older endpoints — also check sprint results.
  if (!sprintRounds.length && year >= 2021) {
    const sprintRes = await fetch(
      `https://api.jolpi.ca/ergast/f1/${year}/sprint.json?limit=100`,
      { headers: { "User-Agent": "f1-perfect-driver/1.0" } },
    );
    if (sprintRes.ok) {
      const sprintJson = await sprintRes.json();
      const sprintRaces = sprintJson.MRData?.RaceTable?.Races ?? [];
      for (const sprint of sprintRaces) {
        const round = Number(sprint.round);
        if (round > 0 && !sprintRounds.includes(round)) sprintRounds.push(round);
      }
      sprintRounds.sort((a, b) => a - b);
    }
  }

  return { year, races: calendar.length, calendar, sprintRounds };
}

const seasons = [];
for (let year = startYear; year <= endYear; year++) {
  process.stdout.write(`Fetching ${year}... `);
  const entry = await fetchYear(year);
  seasons.push(entry);
  console.log(`${entry.races} races${entry.sprintRounds.length ? `, sprints ${entry.sprintRounds.join(",")}` : ""}`);
  await new Promise((r) => setTimeout(r, 120));
}

const payload = {
  generatedAt: new Date().toISOString(),
  source: "jolpica/ergast",
  years: [startYear, endYear],
  seasons,
};

writeFileSync(OUT, JSON.stringify(payload, null, 2));
console.log(`Wrote ${seasons.length} calendars to ${OUT}`);
