/**
 * Fetch real driver birth dates from Jolpica (Ergast successor) so historical
 * grids show true ages instead of an "everyone debuted at 22" estimate.
 *
 *   npm run fetch-birth-years
 */
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATASET = path.join(root, "src", "data", "driverSeasons.json");
const OUT = path.join(root, "src", "data", "driverBirthDates.json");
const BASE = "https://api.jolpi.ca/ergast/f1";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url, attempt = 0) {
  const res = await fetch(url, {
    headers: { "User-Agent": "f1-perfect-driver/1.0 (data build script)" },
  });
  if (res.status === 429 || res.status >= 500) {
    if (attempt >= 5) throw new Error(`${url} -> HTTP ${res.status}`);
    await sleep(1500 * 2 ** attempt);
    return getJson(url, attempt + 1);
  }
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.json();
}

/** Strip accents/punctuation so "Nico Hülkenberg" matches "Nico Hulkenberg". */
function normalise(name) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
}

/** Our dataset uses the name drivers race under; Ergast uses the legal name. */
const ALIASES = {
  "Alex Zanardi": "Alessandro Zanardi",
  "Max Papis": "Massimiliano Papis",
  "Alex Albon": "Alexander Albon",
};

async function main() {
  const dataset = JSON.parse(await readFile(DATASET, "utf8"));
  const years = [...new Set(dataset.seasons.map((s) => s.year))].sort(
    (a, b) => a - b,
  );

  const byKey = new Map();
  for (const year of years) {
    let offset = 0;
    for (;;) {
      const json = await getJson(
        `${BASE}/${year}/drivers.json?limit=100&offset=${offset}`,
      );
      const table = json.MRData?.DriverTable?.Drivers ?? [];
      for (const d of table) {
        const born = d.dateOfBirth ?? "";
        if (!/^\d{4}-\d{2}-\d{2}$/.test(born)) continue;
        byKey.set(normalise(`${d.givenName} ${d.familyName}`), born);
      }
      offset += 100;
      if (table.length < 100) break;
    }
    process.stdout.write(`${year} `);
    await sleep(250);
  }
  process.stdout.write("\n");

  const birthDates = {};
  const missing = [];
  for (const name of [...new Set(dataset.seasons.map((s) => s.name))].sort()) {
    const born =
      byKey.get(normalise(name)) ??
      (ALIASES[name] ? byKey.get(normalise(ALIASES[name])) : undefined);
    if (born) birthDates[name] = born;
    else missing.push(name);
  }

  await writeFile(OUT, `${JSON.stringify({ birthDates }, null, 2)}\n`, "utf8");
  console.log(
    `wrote ${Object.keys(birthDates).length} birth dates, ${missing.length} unmatched`,
  );
  if (missing.length) console.log("unmatched:", missing.join(", "));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
