/**
 * Backfill one portrait per driver and reuse it across all of their seasons.
 *
 * Existing DriverDB portraits are preferred. Drivers without one are matched
 * to their English Wikipedia article and use its Wikimedia thumbnail.
 *
 * Usage: node --use-system-ca scripts/patch-images.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, "..", "src", "data", "driverSeasons.json");
const UA = "f1-perfect-driver/1.0 (local data maintenance)";

function commonsFile(filename) {
  return `https://commons.wikimedia.org/wiki/Special:Redirect/file/${encodeURIComponent(filename)}?width=512`;
}

const IMAGE_OVERRIDES = new Map([
  ["Julian Bailey", commonsFile("Julian Bailey 1991 USA.jpg")],
  [
    "Martin Donnelly",
    commonsFile("Martin Donnelly VW Scirocco R-Cup - 2012 (cropped).jpg"),
  ],
  [
    "Paul Belmondo",
    commonsFile("Paul Belmondo par Claude Truong-Ngoc juillet 2013.jpg"),
  ],
  [
    "Norberto Fontana",
    commonsFile("Norberto Fontana Rally Dakar 2011.png"),
  ],
]);

function driverKey(season) {
  return season.driverId ? `id:${season.driverId}` : `name:${season.name}`;
}

function normalizedName(name) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase();
}

async function fetchText(url, attempts = 4) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    const response = await fetch(url, {
      headers: { "User-Agent": UA },
      redirect: "follow",
    });
    if (response.ok) return response.text();
    if (response.status !== 429 || attempt === attempts - 1) {
      throw new Error(`Wikipedia HTTP ${response.status}`);
    }
    await new Promise((resolve) =>
      setTimeout(resolve, 1500 * Math.pow(2, attempt)),
    );
  }
}

function portraitFromHtml(html) {
  const match = html.match(
    /<meta\s+property="og:image"\s+content="([^"]+)"/i,
  );
  return match?.[1]?.replace(/\/1280px-/, "/512px-") ?? null;
}

function fallbackPortrait(name) {
  const initials = name
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><rect width="512" height="512" fill="#14161c"/><path d="M0 400L512 170v342H0z" fill="#1c1f28"/><circle cx="256" cy="210" r="105" fill="#2a2e38"/><path d="M91 512c18-120 79-180 165-180s147 60 165 180" fill="#2a2e38"/><text x="256" y="245" text-anchor="middle" font-family="Arial,sans-serif" font-size="92" font-weight="700" fill="#f5c518">${initials}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

async function wikipediaPortraits(names) {
  const found = new Map();
  for (const name of names) {
    const title = encodeURIComponent(name.replaceAll(" ", "_"));
    try {
      const html = await fetchText(
        `https://en.wikipedia.org/wiki/${title}`,
      );
      const image = portraitFromHtml(html);
      if (image) found.set(normalizedName(name), image);
    } catch (error) {
      if (!error.message.includes("HTTP 404")) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  return found;
}

async function searchWikipediaPortrait(name) {
  const query = encodeURIComponent(`${name} Formula One driver`);
  const html = await fetchText(
    `https://en.wikipedia.org/wiki/Special:Search?search=${query}&go=Go`,
  );
  return portraitFromHtml(html);
}

async function main() {
  const data = JSON.parse(readFileSync(DATA, "utf8"));
  const portraits = new Map();
  const drivers = new Map();

  for (const season of data.seasons) {
    const key = driverKey(season);
    if (!drivers.has(key)) drivers.set(key, season.name);
    const override = IMAGE_OVERRIDES.get(season.name);
    if (override) {
      portraits.set(key, override);
    } else if (
      season.image &&
      !season.image.startsWith("data:image/") &&
      !portraits.has(key)
    ) {
      portraits.set(key, season.image);
    }
  }

  const missing = [...drivers].filter(([key]) => !portraits.has(key));
  const exactPortraits = await wikipediaPortraits(
    missing.map(([, name]) => name),
  );
  for (let index = 0; index < missing.length; index++) {
    const [key, name] = missing[index];
    process.stdout.write(`[${index + 1}/${missing.length}] ${name}... `);
    try {
      const image =
        exactPortraits.get(normalizedName(name)) ??
        (await searchWikipediaPortrait(name));
      if (image) {
        portraits.set(key, image);
        console.log("found");
      } else {
        console.log("no image");
      }
    } catch (error) {
      console.log(`failed: ${error.message}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  let patched = 0;
  for (const season of data.seasons) {
    const image =
      portraits.get(driverKey(season)) ?? fallbackPortrait(season.name);
    if (season.image === image) continue;
    season.image = image;
    patched++;
  }

  writeFileSync(DATA, `${JSON.stringify(data, null, 2)}\n`);
  const fallbacks = [...drivers].filter(([key]) => !portraits.has(key)).length;
  console.log(
    `Patched ${patched} seasons; all ${drivers.size} drivers have images (${fallbacks} generated fallbacks).`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
