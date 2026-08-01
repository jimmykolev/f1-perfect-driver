import { ATTRIBUTE_KEYS, ATTRIBUTE_META, type Attributes, type AttributeKey, type LockedAttribute, type SignatureTrait } from "@/types";
import { computeOverall } from "@/lib/ratings";

const TRAIT_DEFS: {
  id: string;
  name: string;
  blurb: string;
  key: AttributeKey;
  min: number;
}[] = [
  {
    id: "one-lap-assassin",
    name: "One-Lap Assassin",
    blurb: "Saturday pace becomes a weapon — poles come easier.",
    key: "qualifying",
    min: 90,
  },
  {
    id: "race-day-killer",
    name: "Race-Day Killer",
    blurb: "Sunday conversion is elite — chances get finished.",
    key: "raceCraft",
    min: 90,
  },
  {
    id: "front-runner",
    name: "Front-Runner",
    blurb: "Lives in the podium fight when the car allows.",
    key: "frontRunning",
    min: 88,
  },
  {
    id: "ice-man",
    name: "Ice Man",
    blurb: "Pressure barely moves the needle.",
    key: "mentality",
    min: 90,
  },
  {
    id: "iron-seat",
    name: "Iron Seat",
    blurb: "Rarely out of the car — reliability becomes identity.",
    key: "reliability",
    min: 88,
  },
  {
    id: "momentum-wave",
    name: "Momentum Wave",
    blurb: "Hot streaks stretch longer than they should.",
    key: "momentum",
    min: 88,
  },
  {
    id: "points-machine",
    name: "Points Machine",
    blurb: "Always finds the score when others fade.",
    key: "scoring",
    min: 88,
  },
  {
    id: "sunday-speed",
    name: "Sunday Speed",
    blurb: "Race pace that keeps the field honest.",
    key: "racePace",
    min: 90,
  },
];

/** Derive up to 3 signature traits from a completed DNA build. */
export function deriveTraits(locked: LockedAttribute[]): SignatureTrait[] {
  const attrs = Object.fromEntries(locked.map((l) => [l.key, l.value])) as Attributes;
  const overall = computeOverall(attrs);
  const found: SignatureTrait[] = [];

  for (const def of TRAIT_DEFS) {
    if (attrs[def.key] >= def.min) {
      found.push({
        id: def.id,
        name: def.name,
        blurb: def.blurb,
        fromKey: def.key,
      });
    }
  }

  if (overall >= 92 && attrs.raceCraft >= 88 && attrs.qualifying >= 88) {
    found.unshift({
      id: "all-timer",
      name: "All-Timer Aura",
      blurb: "The grid treats you like a problem before lights out.",
      fromKey: "raceCraft",
    });
  }

  // Prefer highest-source traits, unique by id.
  const byId = new Map(found.map((t) => [t.id, t]));
  return [...byId.values()]
    .sort((a, b) => (attrs[b.fromKey] ?? 0) - (attrs[a.fromKey] ?? 0))
    .slice(0, 3);
}

/** Small peak bumps from traits — flavor, not a second attribute system. */
export function applyTraitBoosts(
  peak: Attributes,
  traits: SignatureTrait[],
): Attributes {
  const next = { ...peak };
  for (const trait of traits) {
    if (trait.id === "all-timer") {
      for (const key of ATTRIBUTE_KEYS) {
        next[key] = Math.min(99, next[key] + 1);
      }
      continue;
    }
    next[trait.fromKey] = Math.min(99, next[trait.fromKey] + 2);
  }
  return next;
}

export function traitLabel(trait: SignatureTrait): string {
  return `${trait.name} · ${ATTRIBUTE_META[trait.fromKey].short}`;
}
