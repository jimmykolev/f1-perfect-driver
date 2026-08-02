/**
 * Build a real junior/feeder driver pool (F2, GP2, F3, GP3, F4, plus
 * soon-to-debut F1 names). No invented names.
 *
 * Usage: node --use-system-ca scripts/fetch-juniors.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const F1 = JSON.parse(
  readFileSync(join(ROOT, "src", "data", "driverSeasons.json"), "utf8"),
);
const OUT = join(ROOT, "src", "data", "juniorDrivers.json");

const UA = "f1-perfect-driver/1.0 (local offline dataset builder)";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function decodeRsc(html) {
  const pushes = [
    ...html.matchAll(/self\.__next_f\.push\(\[1,"([\s\S]*?)"\]\)/g),
  ];
  return pushes
    .map((p) =>
      p[1]
        .replace(/\\n/g, "\n")
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, "\\"),
    )
    .join("\n");
}

function cleanWikiName(name) {
  return name
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isPersonName(name) {
  if (!name || name.length < 5 || name.length > 40) return false;
  if (!/^[A-ZÀ-ÖØ-Þ]/.test(name)) return false;
  if (!name.includes(" ")) return false;
  return !/List of|Championship|Series|Formula|Grand Prix|Season|Category|Wikipedia|Template|File:|Help:|Special:|United |Edit section|Pole position|Fastest lap|By name|New Zealand|United Kingdom|United States|France|Germany|Italy|Spain|Japan|Brazil|Netherlands|Belgium|Austria|Switzerland|Denmark|Sweden|Finland|Canada|Australia|China|India|Thailand|Malaysia|Indonesia|Mexico|Argentina|Colombia|Chile|Russia|Poland|Czech|Hungary|Romania|Bulgaria|Serbia|Croatia|Slovakia|Slovenia|Estonia|Latvia|Lithuania|Norway|Ireland|Portugal|Greece|Turkey|Israel|South Africa|Saudi|UAE|Qatar|Bahrain|Monaco/i.test(
    name,
  );
}

async function wikiDriverList(title, series, yearFrom, yearTo) {
  const url =
    "https://en.wikipedia.org/w/api.php?action=parse&page=" +
    encodeURIComponent(title) +
    "&prop=text&format=json&origin=*";
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`${title}: HTTP ${res.status}`);
  const json = await res.json();
  const html = json.parse?.text?.["*"] ?? "";
  const names = [
    ...html.matchAll(/<a[^>]+title="([^"]+)"[^>]*>/gi),
  ]
    .map((m) => cleanWikiName(m[1]))
    .filter(isPersonName);

  return [...new Set(names)].map((name) => ({
    name,
    series,
    yearFrom,
    yearTo,
    source: `wikipedia:${title}`,
  }));
}

async function driverDbSeason(series, year, seriesLabel) {
  const url = `https://www.driverdb.com/championships/${series}/${year}/standings`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) return [];
  const text = decodeRsc(await res.text());
  const rows = [];
  const re =
    /"overall_position":(\d+),"overall_points":([\d.]+)[\s\S]*?"first_name":"([^"]*)","last_name":"([^"]*)"/g;
  let m;
  while ((m = re.exec(text))) {
    const name = `${m[3]} ${m[4]}`.trim();
    if (!isPersonName(name)) continue;
    const position = Number(m[1]);
    rows.push({
      name,
      series: seriesLabel,
      yearFrom: year,
      yearTo: year,
      position,
      source: `driverdb:${series}/${year}`,
    });
  }
  return rows;
}

const DRIVERDB_COVERAGE = [
  ...[2010, 2012, 2014, 2015, 2016, 2017, 2018].map((y) => [
    "gp3-series",
    y,
    "gp3",
  ]),
  ...[2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024].map((y) => [
    "formula-4-uae",
    y,
    "f4",
  ]),
  ...[2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022].map((y) => [
    "adac-formula-4",
    y,
    "f4",
  ]),
];

/** Ratings band by feeder series. */
function ratingBand(series, position) {
  const base =
    series === "f2" || series === "gp2"
      ? { baseline: 70, ceiling: 88 }
      : series === "f3" || series === "gp3"
        ? { baseline: 66, ceiling: 84 }
        : series === "f1-pipeline"
          ? { baseline: 68, ceiling: 86 }
          : { baseline: 62, ceiling: 78 };

  if (position == null) return base;
  if (position <= 3) return { baseline: base.baseline + 4, ceiling: base.ceiling + 6 };
  if (position <= 8) return { baseline: base.baseline + 2, ceiling: base.ceiling + 3 };
  if (position >= 18) return { baseline: base.baseline - 2, ceiling: base.ceiling - 2 };
  return base;
}

const DEATH_YEARS = {
  "Anthoine Hubert": 2019,
  "Jules Bianchi": 2015,
};

/** Correct yearFrom for drivers where a broad Wikipedia list year skews too early. */
const YEAR_FROM_OVERRIDES = {
  "Anthoine Hubert": 2017,
};

/** Cap feeder activity for drivers killed in competition. */
const YEAR_TO_OVERRIDES = {
  "Anthoine Hubert": 2019,
};

function mergeDrivers(entries) {
  /** @type {Map<string, any>} */
  const byName = new Map();
  for (const entry of entries) {
    const key = entry.name;
    const prev = byName.get(key);
    const band = ratingBand(entry.series, entry.position);
    if (!prev) {
      byName.set(key, {
        name: entry.name,
        series: entry.series,
        yearFrom: entry.yearFrom,
        yearTo: entry.yearTo,
        baseline: band.baseline,
        ceiling: band.ceiling,
        sources: [entry.source],
      });
      continue;
    }
    prev.yearFrom = Math.min(prev.yearFrom, entry.yearFrom);
    prev.yearTo = Math.max(prev.yearTo, entry.yearTo);
    // Prefer higher-series label if we see an upgrade.
    const rank = { f4: 1, gp3: 2, f3: 3, gp2: 4, f2: 5, "f1-pipeline": 4 };
    if ((rank[entry.series] ?? 0) >= (rank[prev.series] ?? 0)) {
      prev.series = entry.series;
      prev.baseline = Math.max(prev.baseline, band.baseline);
      prev.ceiling = Math.max(prev.ceiling, band.ceiling);
    }
    if (!prev.sources.includes(entry.source)) prev.sources.push(entry.source);
  }
  return [...byName.values()]
    .map((driver) => {
      const died = DEATH_YEARS[driver.name];
      const yearFrom = YEAR_FROM_OVERRIDES[driver.name] ?? driver.yearFrom;
      const yearTo = YEAR_TO_OVERRIDES[driver.name] ?? driver.yearTo;
      return {
        ...driver,
        yearFrom: Math.max(driver.yearFrom, yearFrom),
        yearTo: died != null ? Math.min(yearTo, died) : yearTo,
        ...(died != null ? { diedYear: died } : {}),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

console.log("Fetching Wikipedia junior lists...");
const wiki = [
  ...(await wikiDriverList(
    "List_of_FIA_Formula_2_Championship_drivers",
    "f2",
    2017,
    2026,
  )),
  ...(await wikiDriverList("List_of_GP2_Series_drivers", "gp2", 2005, 2016)),
  ...(await wikiDriverList(
    "List_of_FIA_Formula_3_Championship_drivers",
    "f3",
    2019,
    2026,
  )),
  ...(await wikiDriverList("List_of_GP3_Series_drivers", "gp3", 2010, 2018)),
];
console.log("Wikipedia names:", wiki.length);

console.log("Fetching DriverDB feeder seasons...");
const ddb = [];
for (const [series, year, label] of DRIVERDB_COVERAGE) {
  process.stdout.write(`  ${series}/${year}... `);
  const rows = await driverDbSeason(series, year, label);
  console.log(rows.length);
  ddb.push(...rows);
  await sleep(100);
}

console.log("Deriving F1 pipeline juniors from debut seasons...");
const firstF1 = new Map();
for (const row of F1.seasons) {
  const prev = firstF1.get(row.name);
  if (prev == null || row.year < prev) firstF1.set(row.name, row.year);
}
const pipeline = [];
for (const [name, debut] of firstF1) {
  // Available as a junior in the years leading up to an F1 debut.
  const yearFrom = Math.max(1988, debut - 4);
  const yearTo = debut - 1;
  if (yearTo < yearFrom) continue;
  pipeline.push({
    name,
    series: "f1-pipeline",
    yearFrom,
    yearTo,
    source: `f1-debut:${debut}`,
  });
}
console.log("Pipeline juniors:", pipeline.length);

const modernExtras = [
  // Current ladder names that may not yet be on Wikipedia lists.
  ["Alex Dunne", "f2", 2023, 2026],
  ["Rafael Câmara", "f3", 2023, 2026],
  ["Leonardo Fornaroli", "f3", 2023, 2026],
  ["Jak Crawford", "f2", 2022, 2026],
  ["Nikola Tsolov", "f3", 2023, 2026],
  ["Ugo Ugochukwu", "f3", 2023, 2026],
  ["Tuukka Taponen", "f3", 2023, 2026],
  ["Freddie Slater", "f4", 2023, 2026],
  ["James Wharton", "f3", 2023, 2026],
  ["Martinius Stenshorne", "f3", 2023, 2026],
  ["Théophile Naël", "f3", 2023, 2026],
  ["Christian Mansell", "f3", 2023, 2026],
  ["Colton Herta", "f2", 2024, 2026],
  ["Arvid Lindblad", "f3", 2024, 2026],
  ["Oliver Goethe", "f3", 2022, 2026],
  ["Kush Maini", "f2", 2022, 2026],
  ["Richard Verschoor", "f2", 2021, 2026],
  ["Ayumu Iwasa", "f2", 2022, 2025],
  ["Frederik Vesti", "f2", 2022, 2024],
  ["Victor Martins", "f2", 2023, 2025],
  ["Zane Maloney", "f2", 2023, 2025],
  ["Luke Browning", "f3", 2023, 2025],
  ["Paul Aron", "f2", 2024, 2025],
  ["Dino Beganovic", "f3", 2023, 2025],
  ["Sebastián Montoya", "f3", 2023, 2025],
  ["Brando Badoer", "f3", 2024, 2026],
].map(([name, series, yearFrom, yearTo]) => ({
  name,
  series,
  yearFrom,
  yearTo,
  source: "roster-extra",
}));

const merged = mergeDrivers([
  ...wiki,
  ...ddb,
  ...pipeline,
  ...modernExtras,
]);

const payload = {
  generatedAt: new Date().toISOString(),
  sources: [
    "wikipedia F2/GP2/F3/GP3 driver lists",
    "driverdb gp3 / formula-4-uae / adac-formula-4",
    "f1 debut pipeline from driverSeasons.json",
  ],
  count: merged.length,
  drivers: merged,
};

writeFileSync(OUT, JSON.stringify(payload, null, 2));
console.log(`Wrote ${merged.length} real juniors to ${OUT}`);
