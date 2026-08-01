import type { RivalHeat, SeasonResult } from "@/types";
import type { FieldDriver, World } from "@/lib/fieldSim";
import type { Rng } from "@/lib/ratings";

export type DramaKind = "garageUltimatum" | "signOrSit" | "rivalPoach";

export interface DramaCrisis {
  kind: DramaKind;
  headline: string;
  detail: string;
}

type OfferLike = {
  id: string;
  team: string;
  tier: number;
  rank: number;
  label: string;
  blurb: string;
  kind: string;
};

/**
 * Rare winter crises layered onto contract checkpoints.
 * Uses last season's story (rival heat / disaster year) — not mid-race pauses.
 */
export function maybeWinterDrama(
  last: SeasonResult,
  seasonsDone: number,
  rand: Rng,
): DramaCrisis | null {
  if (seasonsDone < 3) return null;

  if (last.rival?.heat === "garage" && last.rival.sameTeam && rand() < 0.44) {
    return {
      kind: "garageUltimatum",
      headline: `${last.rival.name} wants the garage cleared`,
      detail: `The ${last.team} hierarchy cracked after your ${
        last.rival.beatThem ? "win" : "loss"
      } in the seat. Sign on their terms, force a move, or walk.`,
    };
  }

  if (last.position >= 14 && seasonsDone >= 6 && rand() < 0.36) {
    return {
      kind: "signOrSit",
      headline: "The board wants answers",
      detail: `P${last.position} was too soft. Re-sign and prove it, take a safer seat, or sit a year out before the grid forgets you.`,
    };
  }

  if (
    last.rival &&
    !last.rival.sameTeam &&
    (last.rival.heat === "title" || last.rival.heat === "wheel") &&
    rand() < 0.33
  ) {
    return {
      kind: "rivalPoach",
      headline: `Chase ${last.rival.name} into their garage?`,
      detail: `${last.rival.team} has a seat conversation open. Move in beside your rival, keep hunting them from ${last.team}, or rewrite the story elsewhere.`,
    };
  }

  return null;
}

/** Incoming rivalry pressure for the year about to be raced. */
export function incomingRivalPressure(
  lastRival: SeasonResult["rival"] | undefined,
  stickyRivalName: string | null,
  playerTeam: string,
  world: World,
): { heat: RivalHeat | null; rivalDriver: FieldDriver | null } {
  const name = lastRival?.name ?? stickyRivalName;
  if (!name) return { heat: null, rivalDriver: null };
  const rivalDriver = world.drivers.find((d) => d.name === name) ?? null;
  if (!rivalDriver) return { heat: null, rivalDriver: null };

  if (lastRival && lastRival.name === name) {
    return { heat: lastRival.heat, rivalDriver };
  }
  if (rivalDriver.team === playerTeam) {
    return { heat: "garage", rivalDriver };
  }
  return { heat: "wheel", rivalDriver };
}

/** Soften / extend offers when a crisis is active. */
export function applyDramaToOffers<T extends OfferLike>(
  offers: T[],
  drama: DramaCrisis | null,
  world: World,
  winterMove: { from: string; to: string } | null,
  last: SeasonResult,
): T[] {
  if (!drama) return offers;
  let next = [...offers];

  if (drama.kind === "rivalPoach" && last.rival) {
    const rivalTeam = last.rival.team;
    const used = new Set(next.map((o) => o.team));
    if (!used.has(rivalTeam)) {
      const team = world.teams.find((t) => t.name === rivalTeam);
      if (team) {
        const chase = {
          id: `fit:${team.name}`,
          team: team.name,
          tier: team.tier,
          rank: team.rank,
          kind: "fit",
          label: "Chase",
          blurb: `Move into ${team.name} and share a garage with your rival.`,
        } as T;
        const stayIdx = next.findIndex((o) => o.kind === "stay");
        next.splice(stayIdx >= 0 ? stayIdx + 1 : 0, 0, chase);
      }
    }
  }

  if (drama.kind === "garageUltimatum") {
    next = next.map((offer) => {
      if (offer.kind === "stay") {
        return {
          ...offer,
          blurb: winterMove
            ? offer.blurb
            : `Re-sign at ${offer.team} and live with the hierarchy — or the board will live without you.`,
        };
      }
      if (offer.kind === "number2") {
        return {
          ...offer,
          blurb: `${offer.team} will take you as the clear number two — peace in exchange for the lead seat.`,
        };
      }
      return offer;
    });
  }

  if (drama.kind === "signOrSit") {
    next = next.map((offer) => {
      if (offer.kind === "stay") {
        return {
          ...offer,
          blurb: `One more year at ${offer.team} to answer the board — or leave before they answer for you.`,
        };
      }
      return offer;
    });
  }

  return next;
}

export function dramaScarLine(
  drama: DramaCrisis,
  choiceLabel: string,
): string {
  return `${drama.headline} — chose ${choiceLabel}`;
}
