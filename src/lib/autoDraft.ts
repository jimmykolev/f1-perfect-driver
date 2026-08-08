import {
  CAR_ATTRIBUTE_KEYS,
  type CarAttributeKey,
  type ConstructorSeason,
} from "@/lib/teamCarPool";
import { ATTRIBUTE_KEYS, type AttributeKey, type DriverSeason } from "@/types";

/**
 * Choose the strongest attribute still available on a spun season.
 * Attribute order breaks ties so equal ratings remain deterministic.
 */
export function pickAutoDraftAttribute(
  season: DriverSeason,
  lockedKeys: readonly AttributeKey[],
): AttributeKey | null {
  const locked = new Set(lockedKeys);
  let best: AttributeKey | null = null;

  for (const key of ATTRIBUTE_KEYS) {
    if (locked.has(key)) continue;
    if (best === null || season.attributes[key] > season.attributes[best]) {
      best = key;
    }
  }

  return best;
}

/** Strongest open car attribute on a spun constructor card. */
export function pickAutoCarAttribute(
  card: ConstructorSeason,
  lockedKeys: readonly CarAttributeKey[],
): CarAttributeKey | null {
  const locked = new Set(lockedKeys);
  let best: CarAttributeKey | null = null;
  for (const key of CAR_ATTRIBUTE_KEYS) {
    if (locked.has(key)) continue;
    if (
      best === null ||
      card.attributes[key] > card.attributes[best]
    ) {
      best = key;
    }
  }
  return best;
}
