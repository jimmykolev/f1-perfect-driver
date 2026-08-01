import { ATTRIBUTE_KEYS, type AttributeKey, type Attributes } from "../types";

export type Rng = () => number;

/** Relative weight of each attribute in overall rating. Sums to 1. */
export const OVERALL_WEIGHTS: Record<AttributeKey, number> = {
  qualifying: 0.14,
  racePace: 0.14,
  raceCraft: 0.16,
  frontRunning: 0.14,
  scoring: 0.12,
  mentality: 0.14,
  reliability: 0.08,
  momentum: 0.08,
};

export function emptyAttributes(): Attributes {
  return Object.fromEntries(ATTRIBUTE_KEYS.map((k) => [k, 0])) as Attributes;
}

export function computeOverall(attrs: Attributes): number {
  return Math.round(
    ATTRIBUTE_KEYS.reduce(
      (sum, key) => sum + attrs[key] * OVERALL_WEIGHTS[key],
      0,
    ),
  );
}

/** Mid-draft OVR: same weights, renormalized over locked slots only. */
export function computePartialOverall(
  locked: { key: AttributeKey; value: number }[],
): number {
  if (!locked.length) return 0;
  let sum = 0;
  let weight = 0;
  for (const item of locked) {
    const w = OVERALL_WEIGHTS[item.key];
    sum += item.value * w;
    weight += w;
  }
  return Math.round(sum / weight);
}

export function mulberry32(seed: number): Rng {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
