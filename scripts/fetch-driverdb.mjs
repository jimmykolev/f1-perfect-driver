/**
 * Fetch F1 driver-season data from DriverDB standings + statistics pages.
 * Usage: node --use-system-ca scripts/fetch-driverdb.mjs [startYear] [endYear]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT = join(ROOT, "src", "data", "driverSeasons.json");

const startYear = Number(process.argv[2] ?? 1988);
const endYear = Number(process.argv[3] ?? 2026);

const UA = "Mozilla/5.0 (compatible; f1-perfect-driver/1.0; +local)";
const careerTeamCache = new Map();
const jolpicaTeamCache = new Map();
// DriverDB's legacy career records occasionally expose a blank team even in
// the Seasons view. These are the affected F1 entries in our modern pool.
const LEGACY_TEAM_OVERRIDES = {
  "2014:lewis-hamilton": "Mercedes",
  "2014:nico-rosberg": "Mercedes",
  "2014:daniel-ricciardo": "Red Bull",
  "2014:valtteri-bottas": "Williams",
  "2014:sebastian-vettel": "Red Bull",
  "2014:fernando-alonso": "Ferrari",
  "2014:felipe-massa": "Williams",
  "2014:jenson-button": "McLaren",
  "2014:nico-hulkenberg": "Force India",
  "2014:sergio-perez": "Force India",
  "2014:kevin-magnussen": "McLaren",
  "2014:kimi-raikkonen": "Ferrari",
  "2014:jean-eric-vergne": "Toro Rosso",
  "2014:romain-grosjean": "Lotus F1",
  "2014:daniil-kvyat": "Toro Rosso",
  "2014:pastor-maldonado": "Lotus F1",
  "2014:jules-bianchi": "Marussia",
  "2014:adrian-sutil": "Sauber",
  "2014:marcus-ericsson": "Caterham",
  "2014:esteban-gutierrez": "Sauber",
  "2014:max-chilton": "Marussia",
  "2014:kamui-kobayashi": "Caterham",
  "2015:sergio-perez": "Force India",
  "2015:nico-hulkenberg": "Force India",
  "2015:alexander-rossi": "Manor",
  "2022:nyck-de-vries": "Williams",
};

function normalizeName(name) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase();
}

/** DriverDB short names → Jolpica full given names. */
const NAME_ALIASES = {
  "alex zanardi": "alessandro zanardi",
  "max papis": "massimiliano papis",
};

function decodeRsc(html) {
  const pushes = [...html.matchAll(/self\.__next_f\.push\(\[1,"([\s\S]*?)"\]\)/g)];
  return pushes
    .map((p) =>
      p[1]
        .replace(/\\n/g, "\n")
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, "\\"),
    )
    .join("\n");
}

function extractJsonArrayAfter(label, text) {
  const key = `"${label}":`;
  const start = text.indexOf(key);
  if (start < 0) return null;
  let i = start + key.length;
  while (i < text.length && /\s/.test(text[i])) i++;
  if (text[i] !== "[") return null;

  let depth = 0;
  let inString = false;
  let escape = false;
  for (let j = i; j < text.length; j++) {
    const ch = text[j];
    if (inString) {
      if (escape) escape = false;
      else if (ch === "\\") escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "[") depth++;
    else if (ch === "]") {
      depth--;
      if (depth === 0) {
        const raw = text.slice(i, j + 1);
        try {
          return JSON.parse(raw);
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

/** Fallback: pull discrete driver season objects via regex when JSON parse fails. */
function extractStandingsFallback(text) {
  const results = [];
  const re =
    /"driver_id":(\d+),"stats_type":"full","num_events":(\d+),"overall_position":(\d+),"overall_points":([\d.]+),"pace_score":[^,]*,"consistency_score":[^,]*,"net_elo_accrued":[^,]*,"num_fast_laps":(\d+),"num_poles":(\d+),"num_wins":(\d+),"num_podiums":(\d+)[\s\S]*?"sharp_rating":([\d.]+)[\s\S]*?"sharp_rating_change":(-?[\d.]+)[\s\S]*?"team_name":"([^"]*)"[\s\S]*?"first_name":"([^"]*)","last_name":"([^"]*)"[\s\S]*?"ddb_url":"([^"]*)"/g;
  let m;
  while ((m = re.exec(text))) {
    results.push({
      driver_id: Number(m[1]),
      num_events: Number(m[2]),
      overall_position: Number(m[3]),
      overall_points: Number(m[4]),
      num_fast_laps: Number(m[5]),
      num_poles: Number(m[6]),
      num_wins: Number(m[7]),
      num_podiums: Number(m[8]),
      sharp_rating: Number(m[9]),
      sharp_rating_change: Number(m[10]),
      team_name: m[11],
      first_name: m[12],
      last_name: m[13],
      ddb_url: m[14],
    });
  }
  return results;
}

function extractStatsMap(text) {
  const map = new Map();
  const re =
    /"stats":\{"races":(\d+),"wins":(\d+),"poles":(\d+),"podiums":(\d+),"fastest_laps":(\d+),"sharp_rating":([\d.]+)[^}]*"dnfs":(\d+)[^}]*"rank":(\d+)[^}]*\}[^}]*"full_name":"([^"]+)"/g;
  let m;
  while ((m = re.exec(text))) {
    map.set(m[9], {
      races: Number(m[1]),
      wins: Number(m[2]),
      poles: Number(m[3]),
      podiums: Number(m[4]),
      fastest_laps: Number(m[5]),
      sharp_rating: Number(m[6]),
      dnfs: Number(m[7]),
      rank: Number(m[8]),
    });
  }
  return map;
}

async function fetchCareerTeams(slug, driverId) {
  if (!slug) return new Map();
  if (careerTeamCache.has(slug)) return careerTeamCache.get(slug);

  const promise = (async () => {
    if (driverId) {
      const apiUrl =
        `https://www.driverdb.com/api/drivers/career?ddbUrl=${encodeURIComponent(slug)}` +
        `&driverId=${driverId}&skip=0&limit=100`;
      const apiResponse = await fetch(apiUrl, {
        headers: { "User-Agent": UA },
      });
      if (apiResponse.ok) {
        const payload = await apiResponse.json();
        const teams = new Map();
        for (const entry of payload.data ?? []) {
          if (
            entry.season?.legacy_url === "formula-1" &&
            entry.season?.legacy_year &&
            entry.team?.name?.trim()
          ) {
            teams.set(entry.season.legacy_year, entry.team.name.trim());
          }
        }
        if (teams.size) return teams;
      }
    }

    const response = await fetch(`https://www.driverdb.com/drivers/${slug}`, {
      headers: { "User-Agent": UA },
    });
    if (!response.ok) return new Map();

    const text = decodeRsc(await response.text());
    const teams = new Map();
    const pattern =
      /"season":\{[\s\S]{0,500}?"legacy_year":(\d+)[\s\S]{0,300}?\},"team":\{[\s\S]{0,200}?"name":"([^"]+)"/g;
    let match;
    while ((match = pattern.exec(text))) {
      const year = Number(match[1]);
      const team = match[2].trim();
      if (team && !teams.has(year)) teams.set(year, team);
    }
    return teams;
  })().catch(() => new Map());

  careerTeamCache.set(slug, promise);
  return promise;
}

function isMissingTeam(team) {
  if (!team?.trim()) return true;
  const t = team.trim();
  if (/^unknown(?:\s+team)?$/i.test(t)) return true;
  // DriverDB sometimes returns the championship title instead of a constructor.
  if (/formula\s*one|world championship|fia /i.test(t)) return true;
  return false;
}

/** Jolpica/Ergast has reliable constructor names for every championship year. */
async function fetchJolpicaTeams(year) {
  if (jolpicaTeamCache.has(year)) return jolpicaTeamCache.get(year);

  const promise = (async () => {
    const url = `https://api.jolpi.ca/ergast/f1/${year}/driverStandings.json?limit=100`;
    const res = await fetch(url);
    if (!res.ok) return new Map();
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
      byName.set(normalizeName(full), team);
    }
    return byName;
  })().catch(() => new Map());

  jolpicaTeamCache.set(year, promise);
  return promise;
}

function teamFromCarName(carName) {
  if (!carName?.trim()) return "";
  // "Ferrari F2004" / "McLaren MP4/4" → brand before the model code.
  const cleaned = carName.trim();
  const known = [
    "Red Bull",
    "Racing Point",
    "Force India",
    "Aston Martin",
    "AlphaTauri",
    "Toro Rosso",
    "Team Lotus",
    "Lotus F1",
    "Haas F1 Team",
    "Racing Bulls",
    "Kick Sauber",
    "RB F1 Team",
  ];
  for (const brand of known) {
    if (cleaned.toLowerCase().startsWith(brand.toLowerCase())) return brand;
  }
  const first = cleaned.split(/\s+/)[0];
  if (/^(Ferrari|McLaren|Williams|Mercedes|Renault|Sauber|Jordan|Benetton|Tyrrell|Minardi|Prost|BAR|Honda|Toyota|Jaguar|Stewart|Arrows|Ligier|March|Brabham|Alfa|Haas|Alpine|Audi)$/i.test(first)) {
    return first;
  }
  return "";
}

async function fetchYear(year) {
  const standingsUrl = `https://www.driverdb.com/championships/formula-1/${year}/standings`;
  const statsUrl = `https://www.driverdb.com/championships/formula-1/${year}/statistics`;

  const [standingsRes, statsRes, jolpicaTeams] = await Promise.all([
    fetch(standingsUrl, { headers: { "User-Agent": UA } }),
    fetch(statsUrl, { headers: { "User-Agent": UA } }),
    fetchJolpicaTeams(year),
  ]);

  if (!standingsRes.ok) {
    throw new Error(`Standings ${year}: HTTP ${standingsRes.status}`);
  }

  const standingsHtml = await standingsRes.text();
  const standingsText = decodeRsc(standingsHtml);

  let rows =
    extractJsonArrayAfter("data", standingsText) ??
    extractStandingsFallback(standingsText);

  // Prefer the initialStandingsWithType block if present
  const typedIdx = standingsText.indexOf("initialStandingsWithType");
  if (typedIdx >= 0) {
    const slice = standingsText.slice(typedIdx, typedIdx + 500000);
    const parsed = extractJsonArrayAfter("data", slice);
    if (parsed?.length) rows = parsed;
  }

  if (!rows?.length) {
    rows = extractStandingsFallback(standingsText);
  }

  let statsMap = new Map();
  if (statsRes.ok) {
    const statsHtml = await statsRes.text();
    statsMap = extractStatsMap(decodeRsc(statsHtml));
  }

  const drivers = [];
  for (const row of rows) {
    const driver = row.driver ?? {};
    const first = driver.first_name ?? row.first_name;
    const last = driver.last_name ?? row.last_name;
    if (!first || !last) continue;

    const fullName = `${first} ${last}`;
    const events = Number(row.num_events ?? 0);
    const points = Number(row.overall_points ?? 0);
    // Skip non-starters / reserves with zero events
    if (events < 3 && points <= 0) continue;

    const extra = statsMap.get(fullName) ?? {};
    const races = Number(extra.races ?? events);
    const wins = Number(row.num_wins ?? extra.wins ?? 0);
    const poles = Number(row.num_poles ?? extra.poles ?? 0);
    const podiums = Number(row.num_podiums ?? extra.podiums ?? 0);
    const fastestLaps = Number(row.num_fast_laps ?? extra.fastest_laps ?? 0);
    const dnfs = Number(extra.dnfs ?? 0);
    const sharp = Number(row.sharp_rating ?? extra.sharp_rating ?? 0);
    const sharpChange = Number(row.sharp_rating_change ?? 0);
    const position = Number(row.overall_position ?? extra.rank ?? 99);
    const carName = row.car_name ?? "";
    let team = row.team_name ?? "";
    const slug = driver.ddb_url ?? row.ddb_url ?? "";

    if (isMissingTeam(team)) {
      const key = normalizeName(fullName);
      team =
        jolpicaTeams.get(NAME_ALIASES[key] ?? key) ??
        jolpicaTeams.get(key) ??
        "";
    }
    if (isMissingTeam(team)) {
      team = teamFromCarName(carName);
    }
    if (isMissingTeam(team)) {
      const careerTeams = await fetchCareerTeams(
        slug,
        Number(row.driver_id ?? driver.id ?? 0),
      );
      team = careerTeams.get(year) ?? "";
    }
    if (isMissingTeam(team)) {
      team = LEGACY_TEAM_OVERRIDES[`${year}:${slug}`] ?? "";
    }
    if (isMissingTeam(team)) team = "Unknown Team";
    const image =
      driver.profile_image_url ??
      driver.stats?.profile_image_url ??
      null;

    drivers.push({
      year,
      id: `${slug || `${first}-${last}`.toLowerCase()}-${year}`,
      driverId: Number(row.driver_id ?? driver.id ?? 0),
      name: fullName,
      slug,
      team,
      position,
      points,
      races,
      wins,
      poles,
      podiums,
      fastestLaps,
      dnfs,
      sharpRating: Math.round(sharp),
      sharpChange: Math.round(sharpChange * 10) / 10,
      image,
      source: {
        standings: standingsUrl,
        statistics: statsUrl,
      },
    });
  }

  // Deduplicate by driverId / name keeping best race count
  const byKey = new Map();
  for (const d of drivers) {
    const key = d.driverId || d.name;
    const prev = byKey.get(key);
    if (!prev || d.races > prev.races || d.points > prev.points) {
      byKey.set(key, d);
    }
  }

  return [...byKey.values()].sort((a, b) => a.position - b.position);
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

/** Fraction of the field at or below this value (0..1). */
function percentileScores(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return values.map((v) => {
    let lo = 0;
    for (const s of sorted) {
      if (s <= v) lo++;
      else break;
    }
    return sorted.length <= 1 ? 0.5 : (lo - 1) / (sorted.length - 1);
  });
}

/**
 * Map a 0..1 field percentile onto a 55–99 band.
 * Midfield (~p50) lands near 70; elites still reach the high 90s.
 */
function ratingFromPercentile(p) {
  const t = clamp(p, 0, 1);
  return Math.round(55 + Math.pow(t, 1.15) * 44);
}

function rateField(drivers, getter) {
  const values = drivers.map(getter);
  const percentiles = percentileScores(values);
  return percentiles.map(ratingFromPercentile);
}

function deriveAttributes(drivers) {
  if (!drivers.length) return [];

  const maxPoints = Math.max(...drivers.map((d) => d.points), 1);
  const maxRaces = Math.max(...drivers.map((d) => d.races), 1);
  const n = drivers.length;

  // Championship position as a strong midfield-friendly signal (P1 best).
  const positionScore = drivers.map((d) => n - d.position);

  const qualifying = rateField(drivers, (d) => {
    const poleRate = d.races > 0 ? d.poles / d.races : 0;
    return poleRate * 3 + (n - d.position) * 0.15 + d.sharpRating / 5000;
  });
  const racePace = rateField(drivers, (d) => {
    const flRate = d.races > 0 ? d.fastestLaps / d.races : 0;
    return flRate * 3 + d.points / Math.max(maxPoints, 1) + d.sharpRating / 5000;
  });
  const raceCraft = rateField(drivers, (d) => {
    const winRate = d.races > 0 ? d.wins / d.races : 0;
    const convert = d.poles > 0 ? Math.min(d.wins / d.poles, 2) : winRate;
    return winRate * 4 + convert * 0.5 + d.podiums / Math.max(d.races, 1) + (n - d.position) * 0.1;
  });
  const frontRunning = rateField(drivers, (d) => {
    const podiumRate = d.races > 0 ? d.podiums / d.races : 0;
    return podiumRate * 4 + d.points / Math.max(maxPoints, 1);
  });
  const scoring = rateField(drivers, (d) => d.points / maxPoints);
  const mentality = rateField(drivers, (d) => d.sharpRating);
  const reliability = rateField(drivers, (d) => {
    const availability = d.races / maxRaces;
    const swing = Math.abs(d.sharpChange);
    const swingCap = Math.max(...drivers.map((x) => Math.abs(x.sharpChange)), 1);
    const stability = 1 - Math.min(swing / swingCap, 1);
    return availability * 0.75 + stability * 0.25;
  });
  const momentum = rateField(drivers, (d) => d.sharpChange);

  // Absolute sharp blend so stacked seasons don't flatten everyone
  const sharpPerc = percentileScores(drivers.map((d) => d.sharpRating));

  return drivers.map((d, i) => {
    const sharpBlend = ratingFromPercentile(sharpPerc[i]);
    const posBlend = ratingFromPercentile(percentileScores(positionScore)[i]);
    const attrs = {
      qualifying: Math.round(qualifying[i] * 0.65 + sharpBlend * 0.2 + posBlend * 0.15),
      racePace: Math.round(racePace[i] * 0.65 + sharpBlend * 0.2 + posBlend * 0.15),
      raceCraft: Math.round(raceCraft[i] * 0.7 + sharpBlend * 0.15 + posBlend * 0.15),
      frontRunning: Math.round(frontRunning[i] * 0.7 + sharpBlend * 0.15 + posBlend * 0.15),
      scoring: Math.round(scoring[i] * 0.75 + posBlend * 0.25),
      mentality: Math.round(mentality[i] * 0.85 + posBlend * 0.15),
      reliability: reliability[i],
      momentum: Math.round(momentum[i] * 0.7 + sharpBlend * 0.3),
    };

    for (const k of Object.keys(attrs)) {
      attrs[k] = clamp(attrs[k], 55, 99);
    }

    const overall = Math.round(
      attrs.qualifying * 0.14 +
        attrs.racePace * 0.14 +
        attrs.raceCraft * 0.16 +
        attrs.frontRunning * 0.14 +
        attrs.scoring * 0.12 +
        attrs.mentality * 0.14 +
        attrs.reliability * 0.08 +
        attrs.momentum * 0.08,
    );

    return { ...d, attributes: attrs, overall };
  });
}

async function main() {
  const all = [];
  for (let year = startYear; year <= endYear; year++) {
    process.stdout.write(`Fetching ${year}... `);
    try {
      const raw = await fetchYear(year);
      const withAttrs = deriveAttributes(raw);
      console.log(`${withAttrs.length} drivers`);
      all.push(...withAttrs);
    } catch (err) {
      console.log(`failed: ${err.message}`);
    }
    // Be polite to DriverDB
    await new Promise((r) => setTimeout(r, 400));
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    source: "https://www.driverdb.com/championships/formula-1/{year}/standings",
    years: [...new Set(all.map((d) => d.year))].sort((a, b) => a - b),
    count: all.length,
    attributeKeys: [
      "qualifying",
      "racePace",
      "raceCraft",
      "frontRunning",
      "scoring",
      "mentality",
      "reliability",
      "momentum",
    ],
    seasons: all,
  };

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(payload, null, 2));
  console.log(`\nWrote ${all.length} driver-seasons → ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
