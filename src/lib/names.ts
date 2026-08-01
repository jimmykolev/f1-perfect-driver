import data from "@/data/driverSeasons.json";
import type { DriverDataFile } from "@/types";

const pool = (data as DriverDataFile).seasons;

const SURNAME_PARTICLES = new Set([
  "de",
  "van",
  "von",
  "di",
  "da",
  "del",
  "der",
]);

const GENERATIONAL_SUFFIXES = new Set(["jr.", "jr", "sr.", "sr", "ii", "iii"]);

function splitName(full: string): { first: string; last: string } | null {
  const parts = full.trim().split(/\s+/);
  // "Nelson Piquet Jr." should lend the surname Piquet, not "Jr.".
  while (
    parts.length > 2 &&
    GENERATIONAL_SUFFIXES.has(parts[parts.length - 1]!.toLowerCase())
  ) {
    parts.pop();
  }
  if (parts.length < 2) return null;

  // Keep particles ("van der Garde") but drop middle names ("Andrea Kimi Antonelli").
  let start = parts.length - 1;
  while (start > 1 && SURNAME_PARTICLES.has(parts[start - 1]!.toLowerCase())) {
    start -= 1;
  }

  return {
    first: parts[0]!,
    last: parts.slice(start).join(" "),
  };
}

const FIRST_NAMES = [
  ...new Set(
    pool
      .map((s) => splitName(s.name)?.first)
      .filter((n): n is string => Boolean(n)),
  ),
];

const LAST_NAMES = [
  ...new Set(
    pool
      .map((s) => splitName(s.name)?.last)
      .filter((n): n is string => Boolean(n)),
  ),
];

const REAL_NAMES = new Set(pool.map((s) => s.name));

function pick<T>(items: T[], rand: () => number): T {
  return items[Math.floor(rand() * items.length)]!;
}

/** Mix a real F1 first name with a different driver's surname. */
export function generateDriverName(
  avoid?: string,
  rand: () => number = Math.random,
): string {
  if (!FIRST_NAMES.length || !LAST_NAMES.length) return "Ayrton Verstappen";

  const draw = () => `${pick(FIRST_NAMES, rand)} ${pick(LAST_NAMES, rand)}`;

  let name = draw();
  let guard = 0;
  while ((name === avoid || REAL_NAMES.has(name)) && guard++ < 40) {
    name = draw();
  }

  return name.slice(0, 32);
}