import { ATTRIBUTE_KEYS, type AttributeKey, type DriverSeason, type LockedAttribute } from "@/types";

/** For each attribute, pick the highest value in the pool (ties → higher OVR, then newer year). */
export function maxBuildFromPool(pool: DriverSeason[]): LockedAttribute[] {
  return ATTRIBUTE_KEYS.map((key) => {
    let best = pool[0]!;
    for (const season of pool) {
      const a = season.attributes[key];
      const b = best.attributes[key];
      if (a > b) {
        best = season;
        continue;
      }
      if (a === b) {
        if (season.overall > best.overall) best = season;
        else if (season.overall === best.overall && season.year > best.year) {
          best = season;
        }
      }
    }
    return { key, value: best.attributes[key], from: best };
  });
}

export function filterPool(
  pool: DriverSeason[],
  {
    query,
    year,
  }: {
    query: string;
    year: number | null;
  },
): DriverSeason[] {
  const q = query.trim().toLowerCase();
  return pool
    .filter((s) => {
      if (year != null && s.year !== year) return false;
      if (!q) return true;
      return (
        s.name.toLowerCase().includes(q) ||
        s.team.toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      if (b.overall !== a.overall) return b.overall - a.overall;
      return b.year - a.year;
    });
}

export function peakForAttribute(
  pool: DriverSeason[],
  key: AttributeKey,
): { value: number; from: DriverSeason } | null {
  if (!pool.length) return null;
  let best = pool[0]!;
  for (const season of pool) {
    if (season.attributes[key] > best.attributes[key]) best = season;
  }
  return { value: best.attributes[key], from: best };
}
