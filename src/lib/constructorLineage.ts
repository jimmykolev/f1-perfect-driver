/**
 * Map historical constructor name changes so eras rebrand cleanly
 * (Toro Rosso → AlphaTauri → Racing Bulls, Sauber → Audi, etc.).
 */
export const CONSTRUCTOR_SUCCESSORS: Record<string, string[]> = {
  "Toro Rosso": ["AlphaTauri", "Racing Bulls"],
  AlphaTauri: ["Racing Bulls"],
  "Force India": ["Racing Point", "Aston Martin"],
  "Racing Point": ["Aston Martin"],
  Sauber: ["BMW Sauber", "Alfa Romeo", "Kick Sauber", "Audi"],
  "BMW Sauber": ["Sauber", "Alfa Romeo"],
  "Alfa Romeo": ["Sauber", "Kick Sauber", "Audi"],
  "Kick Sauber": ["Audi", "Sauber"],
  Renault: ["Lotus F1", "Alpine"],
  "Lotus F1": ["Renault", "Alpine"],
  "Team Lotus": ["Lotus F1"],
  Alpine: ["Renault"],
  Benetton: ["Renault"],
  Jordan: ["Midland", "Spyker", "Force India"],
  Midland: ["Spyker", "Force India"],
  Spyker: ["Force India"],
  Minardi: ["Toro Rosso"],
  Jaguar: ["Red Bull"],
  BAR: ["Honda", "Brawn", "Mercedes"],
  Honda: ["Brawn", "Mercedes"],
  Brawn: ["Mercedes"],
  Toyota: [],
  Caterham: [],
  Marussia: ["Manor"],
  Manor: [],
  Virgin: ["Marussia", "Manor"],
  HRT: [],
  "Super Aguri": [],
  Prost: [],
  Arrows: [],
  Tyrrell: ["BAR"],
  Stewart: ["Jaguar", "Red Bull"],
  "Racing Bulls": [],
  Audi: [],
  Cadillac: [],
};

/** Best successor name for `from` among the constructors contesting `toYear`. */
export function successorAmong(
  from: string,
  available: Set<string>,
): string | null {
  if (available.has(from)) return from;
  const queue = [...(CONSTRUCTOR_SUCCESSORS[from] ?? [])];
  const seen = new Set<string>([from]);
  while (queue.length) {
    const next = queue.shift()!;
    if (seen.has(next)) continue;
    seen.add(next);
    if (available.has(next)) return next;
    queue.push(...(CONSTRUCTOR_SUCCESSORS[next] ?? []));
  }
  return null;
}
