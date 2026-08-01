/** First year of the turbo-hybrid regulations. */
export const HYBRID_ERA_START = 2014;

/** Pre-hybrid seasons only enter the draft pool from the championship top N. */
export const PRE_HYBRID_POOL_CUTOFF = 10;

/**
 * Consensus icons — World Champions (and peers of that stature) whose
 * pre-hybrid seasons earn the Legend badge. Matching uses exact DriverDB names.
 */
export const LEGEND_ICONS = [
  "Ayrton Senna",
  "Alain Prost",
  "Nigel Mansell",
  "Nelson Piquet",
  "Michael Schumacher",
  "Damon Hill",
  "Jacques Villeneuve",
  "Mika Häkkinen",
  "Fernando Alonso",
  "Kimi Räikkönen",
  "Lewis Hamilton",
  "Sebastian Vettel",
  "Jenson Button",
] as const;

const LEGEND_ICON_SET = new Set<string>(LEGEND_ICONS);

/** Pre-hybrid season that belongs in the draft/playground pool. */
export function isEligibleSeason(season: {
  year: number;
  position: number;
  races: number;
}): boolean {
  if (season.races < 5) return false;
  if (season.year >= HYBRID_ERA_START) return true;
  return season.position >= 1 && season.position <= PRE_HYBRID_POOL_CUTOFF;
}

/** Legend badge: pre-hybrid season from a true icon. */
export function isLegendSeason(
  year: number,
  name?: string | null,
): boolean {
  if (year >= HYBRID_ERA_START) return false;
  if (!name) return false;
  return LEGEND_ICON_SET.has(name);
}
