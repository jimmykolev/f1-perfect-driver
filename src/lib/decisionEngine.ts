/**
 * State-driven career decisions: winter checkpoints, mid-season crises,
 * and story beats. Same packs for Decisions mode and Autopilot.
 */

import type { RivalHeat, SeasonResult } from "@/types";
import type { FieldDriver, World } from "@/lib/fieldSim";
import type { Rng } from "@/lib/ratings";
import {
  carPhrase,
  midCareerOffers,
  type CareerDecisionKind,
  type CareerSeatOffer,
} from "@/lib/careerOffers";
import { teamByName } from "@/lib/fieldSim";

export type DecisionDensity = "low" | "medium" | "high";

export interface DecisionHistoryEntry {
  packId: string;
  trigger: DecisionTriggerKind;
  storyKind: string;
  domain: DecisionDomain;
  year: number;
  afterRound?: number;
  /** Live weekend GP name when trigger is liveWeekend. */
  grandPrix?: string;
  choiceLabel?: string;
  rivalBeat?: "heat" | "calm";
}

/** Session fields the decisions engine reads — avoids circular imports. */
export interface DecisionSessionSlice {
  world: World;
  player: FieldDriver;
  seasons: SeasonResult[];
  lastWinterMove: WinterMove | null;
  hadSabbatical: boolean;
  supportRoleYears: number;
  recentDecisionIds: string[];
  midSeasonDecisionsThisYear: number;
  previousRank: number;
  /** Player preference; missing on old saves = high (backwards compat). */
  decisionDensity?: DecisionDensity;
  decisionHistory?: DecisionHistoryEntry[];
  /** Story beats already used this calendar year (mid-season dedupe). */
  seasonStoryKindsThisYear?: string[];
  lastPauseDomain?: DecisionDomain | null;
  lastRivalBeat?: "heat" | "calm" | null;
}

export interface DensityProfile {
  winterStoryMinUrgency: number;
  midSeasonMinUrgency: number;
  midSeasonMaxPerYear: number;
  midSeasonStartFraction: number;
  midSeasonMinSeasons: number;
  cooldownTail: number;
  domainRepeatPenalty: number;
  /** 1 = every year; 2 = at most one mid-season every other year. */
  midSeasonYearInterval: number;
  unusedTriggerBoost: number;
}

/** High = exact current pacing (do not regress). */
export const HIGH_DENSITY_PROFILE: DensityProfile = {
  winterStoryMinUrgency: 70,
  midSeasonMinUrgency: 52,
  midSeasonMaxPerYear: 2,
  midSeasonStartFraction: 0.35,
  midSeasonMinSeasons: 3,
  cooldownTail: 3,
  domainRepeatPenalty: 15,
  midSeasonYearInterval: 1,
  unusedTriggerBoost: 6,
};

export const MEDIUM_DENSITY_PROFILE: DensityProfile = {
  winterStoryMinUrgency: 78,
  midSeasonMinUrgency: 62,
  midSeasonMaxPerYear: 1,
  midSeasonStartFraction: 0.45,
  midSeasonMinSeasons: 6,
  cooldownTail: 4,
  domainRepeatPenalty: 20,
  midSeasonYearInterval: 1,
  unusedTriggerBoost: 10,
};

export const LOW_DENSITY_PROFILE: DensityProfile = {
  winterStoryMinUrgency: 85,
  midSeasonMinUrgency: 72,
  midSeasonMaxPerYear: 1,
  midSeasonStartFraction: 0.55,
  midSeasonMinSeasons: 8,
  cooldownTail: 5,
  domainRepeatPenalty: 25,
  midSeasonYearInterval: 2,
  unusedTriggerBoost: 14,
};

export function densityProfileFor(density: DecisionDensity): DensityProfile {
  switch (density) {
    case "low":
      return LOW_DENSITY_PROFILE;
    case "medium":
      return MEDIUM_DENSITY_PROFILE;
    default:
      return HIGH_DENSITY_PROFILE;
  }
}

/** Missing field on in-progress saves = high so pacing does not drop. */
export function effectiveDecisionDensity(
  session: DecisionSessionSlice,
): DecisionDensity {
  return session.decisionDensity ?? "high";
}

export function defaultDecisionDensityForNewCareer(): DecisionDensity {
  return "medium";
}

/** A seat change the winter market made before the player got a say. */
export interface WinterMove {
  from: string;
  to: string;
  promoted: boolean;
}

export type DecisionDomain =
  | "seat"
  | "orders"
  | "rival"
  | "contract"
  | "paddock";

export type DecisionTriggerKind =
  | "winterMarket"
  | "goalFailed"
  | "garageWar"
  | "titleFight"
  | "contractPressure"
  | "supportMutiny"
  | "formCrisis"
  | "breakthrough"
  | "midSeason"
  | "liveWeekend";

export type WeekendCallMode = "push" | "bringHome" | "huntRival";

export type DecisionEffectKind =
  | "seatChoice"
  | "retire"
  | "sabbatical"
  | "acceptOrders"
  | "fightOrders"
  | "ignoreRival"
  | "chaseRival"
  | "extendContract"
  | "mediaPush"
  | "mediaSilence"
  | "politicsBoost"
  | "politicsDamage"
  | "weekendCall";

export interface DecisionEffect {
  kind: DecisionEffectKind;
  seatOffer?: CareerSeatOffer;
  team?: string;
  reputationDelta?: number;
  supportRoleYears?: number;
  rivalHeat?: RivalHeat;
  scarLine?: string;
  weekendMode?: WeekendCallMode;
}

export interface DecisionOption {
  id: string;
  domain: DecisionDomain;
  label: string;
  blurb: string;
  effects: DecisionEffect[];
  /** Seat UI helpers */
  team?: string;
  tier?: number;
  rank?: number;
  kind?: CareerDecisionKind;
}

export interface DecisionPack {
  id: string;
  trigger: DecisionTriggerKind;
  headline: string;
  lede: string;
  eyebrow: string;
  options: DecisionOption[];
  /** Mid-season: round after which this fired */
  afterRound?: number;
  /** Live weekend: upcoming round (1-based) before which this paused */
  beforeRound?: number;
  /** Named GP for live weekend copy */
  grandPrix?: string;
  urgency?: number;
}

export interface DecisionEvalContext {
  session: DecisionSessionSlice;
  lastSeason: SeasonResult;
  seasonsDone: number;
  isWinterCheckpoint: boolean;
  /** Mid-season interrupt */
  afterRound?: number;
  /** Live weekend: pause before this round */
  beforeRound?: number;
  grandPrix?: string;
  playerPosition?: number;
  playerPoints?: number;
  calendarLength?: number;
}

interface TriggerCandidate {
  trigger: DecisionTriggerKind;
  urgency: number;
  build: () => DecisionPack;
}

const DOMAIN_LABELS: Record<DecisionDomain, string> = {
  seat: "Seats",
  orders: "Team orders",
  rival: "Rivalry",
  contract: "Contract",
  paddock: "Paddock",
};

export function domainLabel(domain: DecisionDomain): string {
  return DOMAIN_LABELS[domain];
}

function packId(
  trigger: DecisionTriggerKind,
  seasonsDone: number,
  round?: number,
): string {
  return round != null
    ? `${trigger}:s${seasonsDone}:r${round}`
    : `${trigger}:s${seasonsDone}`;
}

function storyKindFromPackId(id: string): string {
  const base = id.split("+")[0] ?? id;
  return base.split(":")[0] ?? base;
}

function priorScarLine(session: DecisionSessionSlice, needle: string): string | null {
  for (const entry of [...(session.decisionHistory ?? [])].reverse()) {
    if (entry.choiceLabel?.toLowerCase().includes(needle.toLowerCase())) {
      return entry.choiceLabel;
    }
  }
  for (const id of [...session.recentDecisionIds].reverse()) {
    if (id.toLowerCase().includes(needle.toLowerCase())) return id;
  }
  return null;
}

function primaryDomain(pack: DecisionPack): DecisionDomain {
  const counts = new Map<DecisionDomain, number>();
  for (const opt of pack.options) {
    counts.set(opt.domain, (counts.get(opt.domain) ?? 0) + 1);
  }
  let best: DecisionDomain = pack.options[0]?.domain ?? "paddock";
  let bestN = 0;
  for (const [domain, n] of counts) {
    if (n > bestN) {
      best = domain;
      bestN = n;
    }
  }
  return best;
}

function rivalBeatFromOption(option: DecisionOption): "heat" | "calm" | null {
  for (const effect of option.effects) {
    if (effect.kind === "chaseRival") return "heat";
    if (effect.kind === "ignoreRival") return "calm";
    if (effect.kind === "mediaSilence") return "calm";
    if (effect.kind === "mediaPush" || effect.kind === "politicsBoost") return "heat";
  }
  if (option.id.includes("heat") || option.id.includes("push") || option.id.includes("chase")) {
    return "heat";
  }
  if (option.id.includes("calm") || option.id.includes("silence") || option.id.includes("truce")) {
    return "calm";
  }
  return null;
}

function midSeasonAllowedThisYear(
  session: DecisionSessionSlice,
  profile: DensityProfile,
): boolean {
  if (profile.midSeasonYearInterval <= 1) return true;
  const lastYear = session.world.year - 1;
  const hadMidLastYear = (session.decisionHistory ?? []).some(
    (e) =>
      e.year === lastYear &&
      (e.afterRound != null || e.trigger === "liveWeekend" || e.trigger === "midSeason"),
  );
  return !hadMidLastYear;
}

function triggersUsedThisSeason(session: DecisionSessionSlice): Set<string> {
  const year = session.world.year;
  const used = new Set<string>();
  for (const entry of session.decisionHistory ?? []) {
    if (entry.year === year) {
      used.add(entry.trigger);
      used.add(entry.storyKind);
    }
  }
  for (const kind of session.seasonStoryKindsThisYear ?? []) {
    used.add(kind);
  }
  return used;
}

function seatOptionsFromOffers(offers: CareerSeatOffer[]): DecisionOption[] {
  return offers.map((offer) => ({
    id: offer.id,
    domain: "seat" as const,
    label: offer.label,
    blurb: offer.blurb,
    team: offer.team,
    tier: offer.tier,
    rank: offer.rank,
    kind: offer.kind,
    effects: [{ kind: "seatChoice" as const, seatOffer: offer }],
  }));
}

function careerPathOptions(offers: CareerSeatOffer[]): DecisionOption[] {
  return offers
    .filter((o) => o.kind === "retire" || o.kind === "sabbatical")
    .map((offer) => ({
      id: offer.id,
      domain: "seat" as const,
      label: offer.label,
      blurb: offer.blurb,
      team: offer.team,
      tier: offer.tier,
      rank: offer.rank,
      kind: offer.kind,
      effects: [
        {
          kind:
            offer.kind === "retire"
              ? ("retire" as const)
              : ("sabbatical" as const),
          seatOffer: offer,
        },
      ],
    }));
}

function offersFromPack(pack: DecisionPack): CareerSeatOffer[] {
  const seats: CareerSeatOffer[] = [];
  const seen = new Set<string>();

  for (const opt of pack.options) {
    for (const effect of opt.effects) {
      if (effect.seatOffer && !seen.has(effect.seatOffer.id)) {
        seats.push(effect.seatOffer);
        seen.add(effect.seatOffer.id);
      }
    }
    if (
      opt.kind &&
      opt.team &&
      !seen.has(opt.id) &&
      (opt.kind === "stay" ||
        opt.kind === "reach" ||
        opt.kind === "fit" ||
        opt.kind === "safe" ||
        opt.kind === "number2" ||
        opt.kind === "retire" ||
        opt.kind === "sabbatical")
    ) {
      seats.push({
        id: opt.id,
        team: opt.team,
        tier: opt.tier ?? 0,
        rank: opt.rank ?? 0,
        label: opt.label,
        blurb: opt.blurb,
        kind: opt.kind,
      });
      seen.add(opt.id);
    }
  }
  return seats;
}

/** Flat seat offers for legacy callers. */
export function seatOffersFromPack(pack: DecisionPack): CareerSeatOffer[] {
  return offersFromPack(pack);
}

function buildWinterSeatPack(
  ctx: DecisionEvalContext,
  winterMove: WinterMove | null,
): DecisionPack {
  const { session, lastSeason, seasonsDone } = ctx;
  const offers = midCareerOffers(
    session.world,
    session.player,
    winterMove,
    { seasonsDone, hadSabbatical: session.hadSabbatical },
  );
  const seatOffers = offers.filter(
    (o) =>
      o.kind === "stay" ||
      o.kind === "reach" ||
      o.kind === "fit" ||
      o.kind === "safe" ||
      o.kind === "number2",
  );
  const careerPaths = careerPathOptions(offers);

  let headline = "Pick your seat for next season";
  let lede = `You finished P${lastSeason.position} in ${lastSeason.year}. Teams are calling — where do you want to race in ${session.world.year}?`;
  if (winterMove) {
    headline = winterMove.promoted
      ? `${winterMove.to} already came for you`
      : "Your seat changed over the winter";
    lede = winterMove.promoted
      ? `${winterMove.from} is gone. ${winterMove.to} wants an answer before ${session.world.year} starts.`
      : `${winterMove.from} moved on without you. You're at ${winterMove.to} now — stay or shop elsewhere.`;
  }

  return {
    id: packId("winterMarket", seasonsDone),
    trigger: "winterMarket",
    headline,
    lede,
    eyebrow: `Winter market · ${session.world.year - 1}/${session.world.year}`,
    options: [...seatOptionsFromOffers(seatOffers), ...careerPaths],
    urgency: 90,
  };
}

function buildGarageWarPack(ctx: DecisionEvalContext): DecisionPack {
  const rival = ctx.lastSeason.rival!;
  const { session, seasonsDone } = ctx;
  const current = teamByName(session.world, session.player.team);
  const offers = midCareerOffers(session.world, session.player, null, {
    seasonsDone,
    hadSabbatical: session.hadSabbatical,
  });
  const move = offers.find((o) => o.kind === "fit" || o.kind === "reach");
  const number2 = offers.find((o) => o.kind === "number2");

  const options: DecisionOption[] = [
    {
      id: "orders:accept",
      domain: "orders",
      label: "Accept number-two status",
      blurb: `Let ${rival.name} lead at ${current.name} — peace now, less say in strategy.`,
      effects: [
        {
          kind: "acceptOrders",
          supportRoleYears: 2,
          reputationDelta: -0.06,
          scarLine: `${rival.name} garage war — played the number-two game`,
        },
      ],
    },
    {
      id: "orders:protect",
      domain: "orders",
      label: "Cover for them once",
      blurb: `Hold back for ${rival.name} this winter — bank goodwill before the next fight.`,
      effects: [
        {
          kind: "acceptOrders",
          supportRoleYears: 1,
          reputationDelta: 0.02,
          scarLine: `${rival.name} garage war — protected teammate once`,
        },
      ],
    },
    {
      id: "orders:equal",
      domain: "orders",
      label: "Demand equal treatment",
      blurb: `Tell ${current.name} you and ${rival.name} get the same kit and strategy input.`,
      effects: [
        {
          kind: "fightOrders",
          reputationDelta: 0.05,
          scarLine: `${rival.name} garage war — negotiated equal status`,
        },
      ],
    },
    {
      id: "orders:fight",
      domain: "orders",
      label: "Push back hard",
      blurb: `Refuse to play second fiddle to ${rival.name} — the garage will take sides.`,
      effects: [
        {
          kind: "fightOrders",
          reputationDelta: 0.08,
          scarLine: `${rival.name} garage war — fought the hierarchy`,
        },
      ],
    },
    {
      id: "orders:refuse",
      domain: "orders",
      label: "Refuse team orders",
      blurb: `Tell the pit wall you will not lift for ${rival.name} — results over harmony.`,
      effects: [
        {
          kind: "fightOrders",
          reputationDelta: 0.1,
          scarLine: `${rival.name} garage war — refused team orders`,
        },
      ],
    },
  ];

  if (move) {
    options.push({
      id: move.id,
      domain: "seat",
      label: move.label,
      blurb: `Leave ${current.name} before the politics harden.`,
      team: move.team,
      tier: move.tier,
      rank: move.rank,
      kind: move.kind,
      effects: [{ kind: "seatChoice", seatOffer: move }],
    });
  }
  if (number2) {
    options.push({
      id: number2.id,
      domain: "seat",
      label: number2.label,
      blurb: number2.blurb,
      team: number2.team,
      tier: number2.tier,
      rank: number2.rank,
      kind: number2.kind,
      effects: [{ kind: "seatChoice", seatOffer: number2 }],
    });
  }

  return {
    id: packId("garageWar", seasonsDone),
    trigger: "garageWar",
    headline: `${rival.name} is ahead in the pecking order`,
    lede: `At ${current.name}, ${rival.name} is outscoring you and the pit wall is picking sides. Accept the hierarchy, push back, or leave before it hardens.`,
    eyebrow: `Garage politics · winter ${session.world.year - 1}/${session.world.year}`,
    options,
    urgency: 78,
  };
}

function buildRivalPoachPack(ctx: DecisionEvalContext): DecisionPack {
  const rival = ctx.lastSeason.rival!;
  const { session, seasonsDone } = ctx;
  const world = session.world;
  const rivalTeam = world.teams.find((t) => t.name === rival.team);
  const offers = midCareerOffers(session.world, session.player, null, {
    seasonsDone,
    hadSabbatical: session.hadSabbatical,
  });
  const stay = offers.find((o) => o.kind === "stay")!;
  const move = offers.find((o) => o.kind === "fit");

  const options: DecisionOption[] = [
    {
      id: "rival:stay",
      domain: "rival",
      label: "Stay and chase from outside",
      blurb: `Keep your seat at ${stay.team} and hunt ${rival.name} without sharing a garage.`,
      team: stay.team,
      tier: stay.tier,
      rank: stay.rank,
      kind: "stay",
      effects: [
        {
          kind: "ignoreRival",
          rivalHeat: "wheel",
          scarLine: `Rival poach window — kept hunting ${rival.name} from ${stay.team}`,
        },
        { kind: "seatChoice", seatOffer: stay },
      ],
    },
    {
      id: "rival:media",
      domain: "rival",
      label: "Ignore the headlines",
      blurb: `Let ${rival.name} own the press — answer on track, not in quotes.`,
      effects: [
        {
          kind: "ignoreRival",
          rivalHeat: "wheel",
          scarLine: `Rival poach window — ignored the ${rival.name} media circus`,
        },
        {
          kind: "mediaSilence",
          reputationDelta: -0.02,
        },
        { kind: "seatChoice", seatOffer: stay },
      ],
    },
  ];

  if (rivalTeam) {
    options.push({
      id: `rival:chase:${rivalTeam.name}`,
      domain: "rival",
      label: `Join ${rivalTeam.name}`,
      blurb: `Share a garage with ${rival.name} at ${rivalTeam.name} — rivalry at arm's length.`,
      team: rivalTeam.name,
      tier: rivalTeam.tier,
      rank: rivalTeam.rank,
      kind: "fit",
      effects: [
        {
          kind: "chaseRival",
          rivalHeat: "garage",
          team: rivalTeam.name,
          scarLine: `Moved into ${rival.name}'s garage at ${rivalTeam.name}`,
        },
        {
          kind: "seatChoice",
          seatOffer: {
            id: `fit:${rivalTeam.name}`,
            team: rivalTeam.name,
            tier: rivalTeam.tier,
            rank: rivalTeam.rank,
            kind: "fit",
            label: `Join ${rivalTeam.name}`,
            blurb: `Move beside ${rival.name} at ${rivalTeam.name}.`,
          },
        },
      ],
    });
  }

  if (move && move.team !== rival.team) {
    options.push({
      id: move.id,
      domain: "seat",
      label: "Leave the rivalry behind",
      blurb: `Go to ${move.team} and stop living in ${rival.name}'s shadow.`,
      team: move.team,
      tier: move.tier,
      rank: move.rank,
      kind: move.kind,
      effects: [{ kind: "seatChoice", seatOffer: move }],
    });
  }

  return {
    id: packId("titleFight", seasonsDone),
    trigger: "titleFight",
    headline: `${rival.name} has a seat open — join them?`,
    lede: `${rival.team} is talking. Move in beside ${rival.name}, keep hunting from ${session.player.team}, or walk away from the story entirely.`,
    eyebrow: `Rivalry · winter ${session.world.year - 1}/${session.world.year}`,
    options,
    urgency: 72,
  };
}

function buildContractPressurePack(ctx: DecisionEvalContext): DecisionPack {
  const { session, lastSeason, seasonsDone } = ctx;
  const current = teamByName(session.world, session.player.team);
  const offers = midCareerOffers(session.world, session.player, null, {
    seasonsDone,
    hadSabbatical: session.hadSabbatical,
  });
  const stay = offers.find((o) => o.kind === "stay")!;
  const safe = offers.find((o) => o.kind === "safe" || o.kind === "fit");
  const retire = offers.find((o) => o.kind === "retire");

  const options: DecisionOption[] = [
    {
      id: "contract:extend",
      domain: "contract",
      label: "Sign on",
      blurb: `One more year at ${current.name} on the board's terms — security over leverage.`,
      team: stay.team,
      tier: stay.tier,
      rank: stay.rank,
      kind: "stay",
      effects: [
        {
          kind: "extendContract",
          scarLine: `Contract pressure — signed on at ${current.name}`,
        },
        { kind: "seatChoice", seatOffer: stay },
      ],
    },
    {
      id: "contract:multiyear",
      domain: "contract",
      label: "Lock in multi-year",
      blurb: `Trade flexibility for a longer deal at ${current.name}.`,
      team: stay.team,
      tier: stay.tier,
      rank: stay.rank,
      kind: "stay",
      effects: [
        {
          kind: "extendContract",
          reputationDelta: 0.03,
          scarLine: `Contract pressure — locked a multi-year deal at ${current.name}`,
        },
        { kind: "seatChoice", seatOffer: stay },
      ],
    },
    {
      id: "contract:release",
      domain: "contract",
      label: "Ask for release clause",
      blurb: "Stay, but insist on an exit if the car slips further back.",
      team: stay.team,
      tier: stay.tier,
      rank: stay.rank,
      kind: "stay",
      effects: [
        {
          kind: "fightOrders",
          reputationDelta: 0.04,
          scarLine: `Contract pressure — demanded a release clause at ${current.name}`,
        },
        { kind: "seatChoice", seatOffer: stay },
      ],
    },
    {
      id: "contract:paycut",
      domain: "contract",
      label: "Pay cut for the seat",
      blurb: "Undercut the market to keep racing — the paddock will notice.",
      team: stay.team,
      tier: stay.tier,
      rank: stay.rank,
      kind: "stay",
      effects: [
        {
          kind: "acceptOrders",
          reputationDelta: -0.05,
          scarLine: `Contract pressure — took a pay cut to stay at ${current.name}`,
        },
        { kind: "seatChoice", seatOffer: stay },
      ],
    },
  ];

  if (safe) {
    options.push({
      id: safe.id,
      domain: "seat",
      label: safe.label,
      blurb:
        safe.kind === "safe"
          ? `${safe.team} is the safer landing if ${current.name} turns sour.`
          : `Walk if ${current.name} cannot stay competitive — ${safe.team} is open.`,
      team: safe.team,
      tier: safe.tier,
      rank: safe.rank,
      kind: safe.kind,
      effects: [{ kind: "seatChoice", seatOffer: safe }],
    });
  }

  if (retire) {
    options.push({
      id: retire.id,
      domain: "seat",
      label: retire.label,
      blurb: retire.blurb,
      kind: retire.kind,
      effects: [{ kind: "retire", seatOffer: retire }],
    });
  }

  return {
    id: packId("contractPressure", seasonsDone),
    trigger: "contractPressure",
    headline: "The board wants a commitment",
    lede: `You turned ${session.player.age} after P${lastSeason.position} in ${lastSeason.year}. ${current.name} wants a deal — re-sign on their terms, find a safer seat, or walk away.`,
    eyebrow: `Contract talks · winter ${session.world.year - 1}/${session.world.year}`,
    options,
    urgency: 65,
  };
}

function buildFormCrisisPack(ctx: DecisionEvalContext): DecisionPack {
  const { session, lastSeason, seasonsDone } = ctx;
  const offers = midCareerOffers(session.world, session.player, null, {
    seasonsDone,
    hadSabbatical: session.hadSabbatical,
  });
  const safe = offers.find((o) => o.kind === "safe" || o.kind === "fit");
  const sabbatical = offers.find((o) => o.kind === "sabbatical");
  const stay = offers.find((o) => o.kind === "stay")!;

  const options: DecisionOption[] = [
    {
      id: "paddock:push",
      domain: "paddock",
      label: "Hold a press conference",
      blurb: "Go on the record and buy time — risky if the results stay flat.",
      effects: [
        {
          kind: "mediaPush",
          reputationDelta: 0.05,
          scarLine: `Form crisis — went public after P${lastSeason.position}`,
        },
      ],
    },
    {
      id: stay.id,
      domain: "seat",
      label: stay.label,
      blurb: `Prove it at ${stay.team} — one more year to answer the doubters.`,
      team: stay.team,
      tier: stay.tier,
      rank: stay.rank,
      kind: stay.kind,
      effects: [{ kind: "seatChoice", seatOffer: stay }],
    },
  ];

  if (safe) {
    options.push({
      id: safe.id,
      domain: "seat",
      label: safe.label,
      blurb: safe.blurb,
      team: safe.team,
      tier: safe.tier,
      rank: safe.rank,
      kind: safe.kind,
      effects: [{ kind: "seatChoice", seatOffer: safe }],
    });
  }
  if (sabbatical) {
    options.push({
      id: sabbatical.id,
      domain: "seat",
      label: sabbatical.label,
      blurb: sabbatical.blurb,
      kind: sabbatical.kind,
      effects: [{ kind: "sabbatical", seatOffer: sabbatical }],
    });
  }

  return {
    id: packId("formCrisis", seasonsDone),
    trigger: "formCrisis",
    headline: "The paddock is writing you off",
    lede: `P${lastSeason.position} in ${lastSeason.year} left you exposed. Force the story in public, change garages, or sit one out.`,
    eyebrow: `Form crisis · winter ${session.world.year - 1}/${session.world.year}`,
    options,
    urgency: 70,
  };
}

function buildGoalFailedPack(ctx: DecisionEvalContext): DecisionPack {
  const { session, lastSeason, seasonsDone } = ctx;
  const goal = lastSeason.goal!;
  const offers = midCareerOffers(session.world, session.player, null, {
    seasonsDone,
    hadSabbatical: session.hadSabbatical,
  });
  const stay = offers.find((o) => o.kind === "stay")!;
  const reach = offers.find((o) => o.kind === "reach");

  const options: DecisionOption[] = [
    {
      id: "contract:reset",
      domain: "contract",
      label: "Re-sign and rebuild",
      blurb: `Missed "${goal.label}" — stay at ${stay.team} and earn back trust.`,
      team: stay.team,
      tier: stay.tier,
      rank: stay.rank,
      kind: stay.kind,
      effects: [
        {
          kind: "extendContract",
          reputationDelta: -0.04,
          scarLine: `Missed season goal — took the hit at ${stay.team}`,
        },
        { kind: "seatChoice", seatOffer: stay },
      ],
    },
    {
      id: "paddock:silence",
      domain: "paddock",
      label: "Drop out of the headlines",
      blurb: "No interviews, no excuses — let the next season do the talking.",
      effects: [
        {
          kind: "mediaSilence",
          reputationDelta: -0.03,
          scarLine: `Missed "${goal.label}" — went quiet in the paddock`,
        },
      ],
    },
  ];

  if (reach) {
    options.push({
      id: reach.id,
      domain: "seat",
      label: reach.label,
      blurb: "A fresh garage might reset the goal sheet.",
      team: reach.team,
      tier: reach.tier,
      rank: reach.rank,
      kind: reach.kind,
      effects: [{ kind: "seatChoice", seatOffer: reach }],
    });
  }

  return {
    id: packId("goalFailed", seasonsDone),
    trigger: "goalFailed",
    headline: `You missed "${goal.label}"`,
    lede: `You missed "${goal.label}" — P${lastSeason.position} was not enough. Contract leverage is gone; how do you answer the team?`,
    eyebrow: `Goal review · winter ${session.world.year - 1}/${session.world.year}`,
    options,
    urgency: 68,
  };
}

function buildBreakthroughPack(ctx: DecisionEvalContext): DecisionPack {
  const { session, lastSeason, seasonsDone } = ctx;
  const offers = midCareerOffers(session.world, session.player, null, {
    seasonsDone,
    hadSabbatical: session.hadSabbatical,
  });
  const stay = offers.find((o) => o.kind === "stay")!;
  const reach = offers.find((o) => o.kind === "reach");
  const gridSize = [...session.world.teams].sort((a, b) => a.rank - b.rank).length;

  const options: DecisionOption[] = [
    {
      id: stay.id,
      domain: "contract",
      label: "Extend while you're hot",
      blurb: `P${lastSeason.position} buys leverage — sign on at ${stay.team} before the market cools.`,
      team: stay.team,
      tier: stay.tier,
      rank: stay.rank,
      kind: stay.kind,
      effects: [
        {
          kind: "extendContract",
          reputationDelta: 0.06,
          scarLine: `Breakthrough year — locked in at ${stay.team}`,
        },
        { kind: "seatChoice", seatOffer: stay },
      ],
    },
    {
      id: `${stay.id}:seat`,
      domain: "seat",
      label: "Re-sign here",
      blurb: `Stay at ${stay.team} — ${carPhrase(stay.rank, gridSize)}.`,
      team: stay.team,
      tier: stay.tier,
      rank: stay.rank,
      kind: stay.kind,
      effects: [{ kind: "seatChoice", seatOffer: stay }],
    },
    {
      id: "paddock:boost",
      domain: "paddock",
      label: "Push the paddock story",
      blurb: "Own the headlines while sponsors and rivals are watching.",
      effects: [
        {
          kind: "politicsBoost",
          reputationDelta: 0.1,
          scarLine: `Breakthrough year — owned the paddock narrative`,
        },
      ],
    },
  ];

  if (reach) {
    options.push({
      id: reach.id,
      domain: "seat",
      label: reach.label,
      blurb: `${reach.team} is the upgrade while your stock is high.`,
      team: reach.team,
      tier: reach.tier,
      rank: reach.rank,
      kind: reach.kind,
      effects: [{ kind: "seatChoice", seatOffer: reach }],
    });
  }

  return {
    id: packId("breakthrough", seasonsDone),
    trigger: "breakthrough",
    headline: "Your stock has never been higher",
    lede: `P${lastSeason.position} with ${lastSeason.wins} win${lastSeason.wins === 1 ? "" : "s"} in ${lastSeason.year} — your stock is high. Lock in a new deal, chase a bigger seat, or push the paddock narrative.`,
    eyebrow: `Momentum · winter ${session.world.year - 1}/${session.world.year}`,
    options,
    urgency: 62,
  };
}

function buildSupportMutinyPack(ctx: DecisionEvalContext): DecisionPack {
  const { session, lastSeason, seasonsDone } = ctx;
  const offers = midCareerOffers(session.world, session.player, null, {
    seasonsDone,
    hadSabbatical: session.hadSabbatical,
  });
  const stay = offers.find((o) => o.kind === "stay")!;
  const move = offers.find((o) => o.kind === "reach" || o.kind === "fit");

  const options: DecisionOption[] = [
    {
      id: "orders:serve",
      domain: "orders",
      label: "Keep playing support",
      blurb: `Accept the number-two lane at ${stay.team} and stop fighting the garage.`,
      effects: [
        {
          kind: "acceptOrders",
          supportRoleYears: 2,
          scarLine: `Support-role mutiny — served the number-two lane`,
        },
        { kind: "seatChoice", seatOffer: stay },
      ],
    },
    {
      id: "orders:revolt",
      domain: "orders",
      label: "Demand equal status",
      blurb: `Tell ${stay.team} you're done playing second — they may clamp down hard.`,
      effects: [
        {
          kind: "fightOrders",
          reputationDelta: 0.05,
          scarLine: `Support-role mutiny — revolted against team orders`,
        },
      ],
    },
  ];

  if (move) {
    options.push({
      id: move.id,
      domain: "seat",
      label: move.label,
      blurb: "Leave before the politics swallow another season.",
      team: move.team,
      tier: move.tier,
      rank: move.rank,
      kind: move.kind,
      effects: [{ kind: "seatChoice", seatOffer: move }],
    });
  }

  return {
    id: packId("supportMutiny", seasonsDone),
    trigger: "supportMutiny",
    headline: "Your number-two deal is turning sour",
    lede: `You signed to support at ${lastSeason.team}, but P${lastSeason.position} in ${lastSeason.year} is not what they wanted. Serve the role, push back, or leave.`,
    eyebrow: `Team orders · winter ${session.world.year - 1}/${session.world.year}`,
    options,
    urgency: 74,
  };
}

/** Legacy mid-season story packs — kept for reference / future hybrid triggers. */
export function buildMidSeasonPack(ctx: DecisionEvalContext): DecisionPack {
  const { session, lastSeason, seasonsDone, afterRound = 0 } = ctx;
  const pos = ctx.playerPosition ?? 10;
  const rival = lastSeason.rival;
  const priorFight = priorScarLine(session, "garage war");

  if (session.supportRoleYears > 0 && pos >= 8) {
    return {
      id: packId("supportMutiny", seasonsDone, afterRound),
      trigger: "midSeason",
      headline: "The garage is squeezing you",
      lede: `You're P${pos} after round ${afterRound} and your number-two contract is showing. Take team orders, push back, or go public.`,
      eyebrow: `Mid-season · ${session.world.year}`,
      afterRound,
      options: [
        {
          id: "mid:orders:accept",
          domain: "orders",
          label: "Fall in line",
          blurb: `Take team orders at ${session.player.team} for the rest of the year.`,
          effects: [
            {
              kind: "acceptOrders",
              supportRoleYears: 1,
              scarLine: `Mid-season orders — fell in line at ${session.player.team}`,
            },
          ],
        },
        {
          id: "mid:orders:protect",
          domain: "orders",
          label: "Cover for your teammate",
          blurb: "Hold back this weekend — bank goodwill with the pit wall.",
          effects: [
            {
              kind: "acceptOrders",
              supportRoleYears: 1,
              reputationDelta: 0.02,
              scarLine: `Mid-season orders — protected teammate at ${session.player.team}`,
            },
          ],
        },
        {
          id: "mid:orders:claim1",
          domain: "orders",
          label: "Demand lead-driver status",
          blurb: "Your results say you should lead — tell the wall that.",
          effects: [
            {
              kind: "fightOrders",
              reputationDelta: 0.06,
              scarLine: `Mid-season orders — claimed #1 at ${session.player.team}`,
            },
          ],
        },
        {
          id: "mid:orders:fight",
          domain: "orders",
          label: "Push back on orders",
          blurb: `Refuse to play second at ${session.player.team} — risk a split in the garage.`,
          effects: [
            {
              kind: "fightOrders",
              reputationDelta: 0.04,
              scarLine: `Mid-season orders — pushed back at ${session.player.team}`,
            },
          ],
        },
      ],
      urgency: 66,
    };
  }

  if (rival && (rival.heat === "garage" || rival.heat === "title")) {
    const ledeExtra = priorFight
      ? ` You already drew a line this career — ${priorFight}.`
      : "";
    const options: DecisionOption[] = [
      {
        id: "mid:rival:chase",
        domain: "rival",
        label: `Race ${rival.name} for the title`,
        blurb: `Treat ${rival.name} as championship business — no truce, no quotes.`,
        effects: [
          {
            kind: "chaseRival",
            rivalHeat: rival.heat === "title" ? "title" : "garage",
            scarLine: `Mid-season — chased the title against ${rival.name}`,
          },
        ],
      },
      {
        id: "mid:rival:ignore",
        domain: "rival",
        label: "Stay out of the press",
        blurb: `No quotes about ${rival.name} — just lap time.`,
        effects: [
          {
            kind: "mediaSilence",
            reputationDelta: -0.01,
            scarLine: `Mid-season — ignored the ${rival.name} noise`,
          },
        ],
      },
    ];

    if (rival.sameTeam) {
      options.push({
        id: "mid:rival:equal",
        domain: "orders",
        label: `Demand the same spec as ${rival.name}`,
        blurb: `Tell ${session.player.team} you and ${rival.name} get equal kit and strategy — or explain why not.`,
        effects: [
          {
            kind: "fightOrders",
            reputationDelta: 0.05,
            scarLine: `Mid-season — demanded equal kit vs ${rival.name}`,
          },
        ],
      });
    }

    if (rival.heat === "garage" || rival.heat === "title") {
      options.push({
        id: "mid:rival:truce",
        domain: "rival",
        label: "Propose a truce",
        blurb: `Offer ${rival.name} a quiet pact until the summer break.`,
        effects: [
          {
            kind: "ignoreRival",
            rivalHeat: "wheel",
            scarLine: `Mid-season — proposed a truce with ${rival.name}`,
          },
        ],
      });
    }

    if (rival.heat === "garage" && rival.sameTeam && pos <= 4) {
      options.push({
        id: "mid:rival:ultimatum",
        domain: "rival",
        label: "Issue a garage ultimatum",
        blurb: `Tell ${session.player.team} it's you or ${rival.name} before the next upgrade lands.`,
        effects: [
          {
            kind: "fightOrders",
            reputationDelta: 0.09,
            scarLine: `Mid-season — issued garage ultimatum vs ${rival.name}`,
          },
        ],
      });
    }

    if (pos <= 5) {
      options.push(
        {
          id: "mid:rival:protect",
          domain: "rival",
          label: `Pick your fights with ${rival.name}`,
          blurb: "Both of you need constructor points — don't burn each other out.",
          effects: [
            {
              kind: "mediaSilence",
              reputationDelta: 0.02,
              scarLine: `Mid-season — protected points in the ${rival.name} fight`,
            },
          ],
        },
        {
          id: "mid:rival:risks",
          domain: "rival",
          label: `Send a message to ${rival.name}`,
          blurb: "Take the risky move this weekend — even if it costs a finish.",
          effects: [
            {
              kind: "chaseRival",
              rivalHeat: rival.heat,
              scarLine: `Mid-season — took risks against ${rival.name}`,
            },
          ],
        },
      );
    } else {
      options.push({
        id: "mid:rival:push",
        domain: "rival",
        label: `Provoke ${rival.name} this weekend`,
        blurb: `Turn up the rivalry with ${rival.name} on track and in the paddock.`,
        effects: [
          {
            kind: "chaseRival",
            rivalHeat: rival.heat,
            scarLine: `Mid-season — raised the heat with ${rival.name}`,
          },
        ],
      });
    }

    options.push({
      id: "mid:paddock:calm",
      domain: "paddock",
      label: "Keep it off the front pages",
      blurb: "Dial back the story — less press, fewer flashpoints.",
      effects: [
        {
          kind: "mediaSilence",
          reputationDelta: -0.02,
          scarLine: `Mid-season rivalry — cooled the paddock noise`,
        },
      ],
    });

    return {
      id: packId("garageWar", seasonsDone, afterRound),
      trigger: "midSeason",
      headline: `${rival.name} is closing in on you`,
      lede: `You're P${pos} after round ${afterRound} and the ${rival.name} fight is live. Chase the title, ignore the noise, or cool the paddock down.${ledeExtra}`,
      eyebrow: `Mid-season · ${session.world.year}`,
      afterRound,
      options,
      urgency: 64,
    };
  }

  if (pos >= 12) {
    return {
      id: packId("formCrisis", seasonsDone, afterRound),
      trigger: "midSeason",
      headline: "Results are not coming",
      lede: `You're P${pos} after round ${afterRound} and ${session.player.team} is losing patience. Call out the car in public or keep your head down.`,
      eyebrow: `Mid-season · ${session.world.year}`,
      afterRound,
      options: [
        {
          id: "mid:paddock:defiant",
          domain: "paddock",
          label: "Call out the car in the press",
          blurb: `Go on the record about ${session.player.team}'s form — force a response from the team.`,
          effects: [
            {
              kind: "mediaPush",
              reputationDelta: 0.04,
              scarLine: `Mid-season crisis — went defiant at P${pos}`,
            },
          ],
        },
        {
          id: "mid:paddock:push",
          domain: "paddock",
          label: "Hold a press conference",
          blurb: "Force the narrative publicly — risky if the slump continues.",
          effects: [
            {
              kind: "mediaPush",
              reputationDelta: 0.03,
              scarLine: `Mid-season crisis — forced the narrative at P${pos}`,
            },
          ],
        },
        {
          id: "mid:paddock:humble",
          domain: "paddock",
          label: "Own the slump publicly",
          blurb: "No excuses — promise work, not headlines.",
          effects: [
            {
              kind: "mediaSilence",
              reputationDelta: 0.01,
              scarLine: `Mid-season crisis — stayed humble at P${pos}`,
            },
          ],
        },
        {
          id: "mid:paddock:silence",
          domain: "paddock",
          label: "Stay out of the press",
          blurb: "No interviews until the results turn.",
          effects: [
            {
              kind: "mediaSilence",
              reputationDelta: -0.02,
              scarLine: `Mid-season crisis — went quiet at P${pos}`,
            },
          ],
        },
      ],
      urgency: 58,
    };
  }

  return {
    id: packId("breakthrough", seasonsDone, afterRound),
    trigger: "midSeason",
    headline: "Momentum is building",
    lede: `You're P${pos} after round ${afterRound} and the paddock is paying attention. Push the story, stay quiet, or reopen contract talks early.`,
    eyebrow: `Mid-season · ${session.world.year}`,
    afterRound,
    options: [
      {
        id: "mid:paddock:boost",
        domain: "paddock",
        label: "Push the paddock story",
        blurb: "Own the headlines while your form is hot.",
        effects: [
          {
            kind: "politicsBoost",
            reputationDelta: 0.06,
            scarLine: `Mid-season momentum — owned the story at P${pos}`,
          },
        ],
      },
      {
        id: "mid:paddock:ally",
        domain: "paddock",
        label: "Back your engine partner",
        blurb: "Go public in support of your power-unit supplier — paddock politics as performance.",
        effects: [
          {
            kind: "politicsBoost",
            reputationDelta: 0.04,
            scarLine: `Mid-season momentum — backed the engine partner at P${pos}`,
          },
        ],
      },
      {
        id: "mid:contract:focus",
        domain: "contract",
        label: "Stay focused on driving",
        blurb: "No distractions — finish the job on track.",
        effects: [
          {
            kind: "extendContract",
            scarLine: `Mid-season momentum — stayed focused at P${pos}`,
          },
        ],
      },
      {
        id: "mid:contract:lock",
        domain: "contract",
        label: "Reopen contract talks early",
        blurb: "Use the form to push for a better deal before winter.",
        effects: [
          {
            kind: "extendContract",
            reputationDelta: 0.05,
            scarLine: `Mid-season momentum — locked in leverage at P${pos}`,
          },
        ],
      },
    ],
    urgency: 55,
  };
}

function onCooldown(
  session: DecisionSessionSlice,
  trigger: DecisionTriggerKind,
  profile: DensityProfile,
): boolean {
  const recent = session.recentDecisionIds;
  const tail = recent.slice(-profile.cooldownTail);
  return tail.some((id) => id.startsWith(`${trigger}:`));
}

function adjustCandidateScore(
  session: DecisionSessionSlice,
  candidate: TriggerCandidate,
  profile: DensityProfile,
  usedThisSeason: Set<string>,
): number {
  let score = candidate.urgency;
  if (usedThisSeason.has(candidate.trigger)) {
    score -= 999;
  }
  if (session.lastPauseDomain) {
    const domainHint =
      candidate.trigger === "garageWar" || candidate.trigger === "supportMutiny"
        ? "orders"
        : candidate.trigger === "titleFight"
          ? "rival"
          : candidate.trigger === "formCrisis" || candidate.trigger === "breakthrough"
            ? "paddock"
            : candidate.trigger === "contractPressure" || candidate.trigger === "goalFailed"
              ? "contract"
              : null;
    if (domainHint && domainHint === session.lastPauseDomain) {
      score -= profile.domainRepeatPenalty;
    }
  }
  const recentTriggers = new Set(
    (session.decisionHistory ?? []).slice(-8).map((e) => e.trigger),
  );
  if (!recentTriggers.has(candidate.trigger)) {
    score += profile.unusedTriggerBoost;
  }
  return score;
}

function scoreCandidates(
  ctx: DecisionEvalContext,
  candidates: TriggerCandidate[],
  rand: Rng,
  profile: DensityProfile,
): DecisionPack | null {
  if (candidates.length === 0) return null;
  const usedThisSeason = triggersUsedThisSeason(ctx.session);
  const scored = candidates
    .filter((c) => !onCooldown(ctx.session, c.trigger, profile))
    .map((c) => ({
      ...c,
      score: adjustCandidateScore(ctx.session, c, profile, usedThisSeason) + rand() * 12,
    }))
    .filter((c) => c.score > 0);
  if (scored.length === 0) return null;
  scored.sort((a, b) => b.score - a.score);
  return scored[0]!.build();
}

function shortGrandPrixName(name: string): string {
  return name
    .replace(/\s+Grand Prix$/i, " GP")
    .replace(/\s+GP$/i, " GP");
}

type WeekendFlavor = "attack" | "pressure" | "garage" | "recovery";

function weekendOption(
  id: string,
  domain: DecisionDomain,
  label: string,
  blurb: string,
  mode: WeekendCallMode,
  scarLine: string,
  rivalHeat?: RivalHeat,
): DecisionOption {
  return {
    id,
    domain,
    label,
    blurb,
    effects: [
      {
        kind: "weekendCall",
        weekendMode: mode,
        rivalHeat,
        scarLine,
      },
    ],
  };
}

function pickWeekendFlavor(
  ctx: DecisionEvalContext,
  rand: Rng,
): WeekendFlavor {
  const rival = ctx.lastSeason.rival;
  const pos = ctx.playerPosition ?? 10;
  const weighted: WeekendFlavor[] = ["attack", "pressure", "recovery"];
  if (rival?.sameTeam || ctx.session.supportRoleYears > 0) {
    weighted.push("garage", "garage");
  }
  if (rival && (rival.heat === "garage" || rival.heat === "title")) {
    weighted.push("pressure", "pressure");
  }
  if (pos >= 10) weighted.push("recovery");
  if (pos <= 3) weighted.push("attack");
  return weighted[Math.floor(rand() * weighted.length)] ?? "attack";
}

function liveWeekendFireChance(density: DecisionDensity): number {
  switch (density) {
    case "low":
      return 0.18;
    case "medium":
      return 0.28;
    default:
      return 0.4;
  }
}

/** Years since last live weekend in this career (null if never). */
function yearsSinceLiveWeekend(session: DecisionSessionSlice): number | null {
  const year = session.world.year;
  let latest: number | null = null;
  for (const entry of session.decisionHistory ?? []) {
    if (entry.trigger !== "liveWeekend") continue;
    if (latest == null || entry.year > latest) latest = entry.year;
  }
  return latest == null ? null : year - latest;
}

export function buildLiveWeekendPack(
  ctx: DecisionEvalContext,
  rand: Rng = Math.random,
): DecisionPack {
  const { session, seasonsDone, beforeRound = 0, grandPrix } = ctx;
  const gpFull = grandPrix ?? `Round ${beforeRound}`;
  const gp = shortGrandPrixName(gpFull);
  const pos = ctx.playerPosition ?? 10;
  const rival = ctx.lastSeason.rival;
  const flavor = pickWeekendFlavor(ctx, rand);
  const rivalHeat =
    rival?.heat === "title" ? ("title" as const) : ("wheel" as const);

  let headline = `${gp}`;
  let lede = `P${pos} into ${gp}. Pick the call.`;
  let options: DecisionOption[] = [];

  if (flavor === "garage" && (rival?.sameTeam || session.supportRoleYears > 0)) {
    const mate = rival?.sameTeam ? rival.name : "your teammate";
    headline = `Garage call · ${gp}`;
    lede = `Pit wall wants a quiet ${gp}. ${mate} is in the other car.`;
    options = [
      weekendOption(
        "weekend:lead",
        "orders",
        "Take the fight",
        "Ignore the pecking order — race them clean and hard.",
        "push",
        `${gpFull} — took the fight in the garage`,
      ),
      weekendOption(
        "weekend:team",
        "orders",
        "Play the team game",
        "Hold station, bank goodwill, finish the job.",
        "bringHome",
        `${gpFull} — played the team game`,
      ),
      weekendOption(
        "weekend:shadow",
        "rival",
        rival ? `Shadow ${rival.name}` : "Shadow the other car",
        "Stick to their gearbox and force a mistake.",
        "huntRival",
        `${gpFull} — shadowed ${mate}`,
        rivalHeat,
      ),
    ];
  } else if (flavor === "pressure" && rival) {
    headline = `Title heat · ${gp}`;
    lede = `P${pos} vs ${rival.name}. This weekend can tilt the story.`;
    options = [
      weekendOption(
        "weekend:strike",
        "rival",
        "Strike first",
        "Aggressive quali and race pace — make them react.",
        "push",
        `${gpFull} — struck first vs ${rival.name}`,
        rivalHeat,
      ),
      weekendOption(
        "weekend:cover",
        "paddock",
        "Cover the points",
        "No drama. Leave with the haul you need.",
        "bringHome",
        `${gpFull} — covered the points`,
      ),
      weekendOption(
        "weekend:hunt",
        "rival",
        `Hunt ${rival.name}`,
        "Make this GP about them — wheel-to-wheel if needed.",
        "huntRival",
        `${gpFull} — hunted ${rival.name}`,
        rivalHeat,
      ),
    ];
  } else if (flavor === "recovery" || pos >= 10) {
    headline = `Reset · ${gp}`;
    lede = `P${pos} and the weekend needs a different answer.`;
    options = [
      weekendOption(
        "weekend:swing",
        "paddock",
        "Swing for a result",
        "High risk setup — steal something loud.",
        "push",
        `${gpFull} — swung for a result`,
      ),
      weekendOption(
        "weekend:nurse",
        "paddock",
        "Nurse the car home",
        "Damage limitation. Keep it on the island.",
        "bringHome",
        `${gpFull} — nursed it home`,
      ),
      weekendOption(
        "weekend:qualify",
        "paddock",
        "All-in on Saturday",
        "Throw the quali lap — race pace can wait.",
        "push",
        `${gpFull} — went all-in on Saturday`,
      ),
    ];
  } else {
    headline = `Race call · ${gp}`;
    lede = `P${pos} at ${gp}. How hard do you push?`;
    options = [
      weekendOption(
        "weekend:push",
        "paddock",
        "Push for the win",
        "Max attack — risk a mistake for the top step.",
        "push",
        `${gpFull} — pushed for the win`,
      ),
      weekendOption(
        "weekend:safe",
        "paddock",
        "Bring it home",
        "Bank the points. Clean laps, no heroics.",
        "bringHome",
        `${gpFull} — brought it home`,
      ),
    ];
    if (rival) {
      options.push(
        weekendOption(
          "weekend:hunt",
          "rival",
          `Hunt ${rival.name}`,
          `Make ${rival.name} the story of the race.`,
          "huntRival",
          `${gpFull} — hunted ${rival.name}`,
          rivalHeat,
        ),
      );
    } else {
      options.push(
        weekendOption(
          "weekend:show",
          "paddock",
          "Make a statement",
          "Send a message to the grid — and the pit wall.",
          "push",
          `${gpFull} — made a statement`,
        ),
      );
    }
  }

  // Urgency stays moderate — rarity is enforced by fire chance + spacing.
  let urgency = 48;
  if (pos <= 3) urgency += 8;
  if (pos >= 12) urgency += 6;
  if (rival?.heat === "garage" || rival?.heat === "title") urgency += 10;
  if (flavor === "garage" || flavor === "pressure") urgency += 4;

  return {
    id: packId("liveWeekend", seasonsDone, beforeRound),
    trigger: "liveWeekend",
    headline,
    lede,
    eyebrow: `${session.world.year} · ${gp}`,
    beforeRound,
    grandPrix: gpFull,
    options,
    urgency,
  };
}

function midSeasonCandidates(
  ctx: DecisionEvalContext,
  profile: DensityProfile,
  rand: Rng,
): TriggerCandidate[] {
  const { session, beforeRound } = ctx;
  // Live weekends: at most one per year, regardless of density max.
  if (session.midSeasonDecisionsThisYear >= 1) return [];
  if (session.seasons.length < profile.midSeasonMinSeasons) return [];
  // Round is already chosen from the mid-season window in careerSession —
  // do not re-gate on startFraction (that pinned everything to British GP).
  if (beforeRound == null || beforeRound < 4) return [];
  if (!midSeasonAllowedThisYear(session, profile)) return [];

  const usedThisSeason = triggersUsedThisSeason(session);
  if (usedThisSeason.has("liveWeekend") || usedThisSeason.has("midSeason")) {
    return [];
  }

  // Space them out across a career so they stay special.
  const gap = yearsSinceLiveWeekend(session);
  const minGap =
    effectiveDecisionDensity(session) === "high"
      ? 2
      : effectiveDecisionDensity(session) === "medium"
        ? 3
        : 4;
  if (gap != null && gap < minGap) return [];

  // Even when eligible, often skip — avoids the same beat every career.
  if (rand() > liveWeekendFireChance(effectiveDecisionDensity(session))) {
    return [];
  }

  const pos = ctx.playerPosition ?? 10;
  let urgency = 50;
  if (session.supportRoleYears > 0 && pos >= 8) urgency += 6;
  if (ctx.lastSeason.rival?.heat === "garage") urgency += 10;
  if (ctx.lastSeason.rival?.heat === "title") urgency += 8;
  if (pos >= 12) urgency += 6;
  if (pos <= 3) urgency += 8;

  return [
    {
      trigger: "liveWeekend",
      urgency,
      build: () => buildLiveWeekendPack(ctx, rand),
    },
  ];
}

/** Min urgency for a mid-season pack to pause the calendar (density-aware). */
export function midSeasonPauseThreshold(session: DecisionSessionSlice): number {
  return densityProfileFor(effectiveDecisionDensity(session)).midSeasonMinUrgency;
}

function winterStoryCandidates(ctx: DecisionEvalContext): TriggerCandidate[] {
  const { lastSeason, session, seasonsDone } = ctx;
  const candidates: TriggerCandidate[] = [];

  if (
    lastSeason.rival?.heat === "garage" &&
    lastSeason.rival.sameTeam &&
    seasonsDone >= 3
  ) {
    candidates.push({
      trigger: "garageWar",
      urgency: 75 + (lastSeason.rival.beatThem ? 8 : 0),
      build: () => buildGarageWarPack(ctx),
    });
  }

  if (
    lastSeason.rival &&
    !lastSeason.rival.sameTeam &&
    (lastSeason.rival.heat === "title" || lastSeason.rival.heat === "wheel") &&
    seasonsDone >= 4
  ) {
    candidates.push({
      trigger: "titleFight",
      urgency: 68 + (lastSeason.rival.titleFight ? 10 : 0),
      build: () => buildRivalPoachPack(ctx),
    });
  }

  if (lastSeason.goal && !lastSeason.goal.met) {
    candidates.push({
      trigger: "goalFailed",
      urgency: 62 + (lastSeason.position >= 10 ? 8 : 0),
      build: () => buildGoalFailedPack(ctx),
    });
  }

  if (lastSeason.position >= 14 && seasonsDone >= 6) {
    candidates.push({
      trigger: "formCrisis",
      urgency: 70,
      build: () => buildFormCrisisPack(ctx),
    });
  }

  if (
    (session.player.age >= 32 || lastSeason.position >= 12) &&
    seasonsDone >= 6
  ) {
    candidates.push({
      trigger: "contractPressure",
      urgency: 58 + (session.player.age >= 35 ? 10 : 0),
      build: () => buildContractPressurePack(ctx),
    });
  }

  if (session.supportRoleYears > 0 && lastSeason.supportRole) {
    candidates.push({
      trigger: "supportMutiny",
      urgency: 72,
      build: () => buildSupportMutinyPack(ctx),
    });
  }

  if (lastSeason.position <= 5 && lastSeason.wins >= 1 && seasonsDone >= 2) {
    candidates.push({
      trigger: "breakthrough",
      urgency: 55 + (lastSeason.position <= 3 ? 12 : 0),
      build: () => buildBreakthroughPack(ctx),
    });
  }

  return candidates;
}

/** Extra winter seats merged onto story packs — skip misleading downgrades on momentum beats. */
function mergeWinterSeatsIntoStory(
  story: DecisionPack,
  seatOptions: DecisionOption[],
  currentRank: number,
): DecisionOption[] {
  const ids = new Set(story.options.map((o) => o.id));
  const seatKinds = new Set(
    story.options.filter((o) => o.domain === "seat").map((o) => o.kind),
  );

  return seatOptions.filter((o) => {
    if (ids.has(o.id)) return false;
    if (story.trigger !== "breakthrough") return true;
    if (o.kind === "safe" || o.kind === "retire" || o.kind === "sabbatical") {
      return false;
    }
    if (o.kind === "fit" && (o.rank ?? 99) >= currentRank) return false;
    if (o.kind === "number2") return false;
    if (o.kind === "stay" && seatKinds.has("stay")) return false;
    return true;
  });
}

/**
 * Pick one decision pack from career state. Returns null when the year
 * should stay quiet (non-checkpoint winters with no story heat).
 */
export function evaluateDecisionTriggers(
  ctx: DecisionEvalContext,
  rand: Rng,
): DecisionPack | null {
  const { session, isWinterCheckpoint, afterRound, beforeRound } = ctx;
  const winterMove = session.lastWinterMove;
  const profile = densityProfileFor(effectiveDecisionDensity(session));

  if (afterRound != null || beforeRound != null) {
    return scoreCandidates(
      ctx,
      midSeasonCandidates(ctx, profile, rand),
      rand,
      profile,
    );
  }

  if (isWinterCheckpoint) {
    const seat = buildWinterSeatPack(ctx, winterMove);
    const story = scoreCandidates(ctx, winterStoryCandidates(ctx), rand, profile);

    if (!story || story.trigger === "winterMarket") return seat;

    const currentRank = teamByName(session.world, session.player.team).rank;
    const extraSeats = mergeWinterSeatsIntoStory(story, seat.options, currentRank);
    return {
      ...story,
      options: [...story.options, ...extraSeats],
      id: `${story.id}+seat`,
    };
  }

  // Non-checkpoint post-season: story only if urgency clears the density bar.
  const story = scoreCandidates(ctx, winterStoryCandidates(ctx), rand, profile);
  if (story && (story.urgency ?? 0) >= profile.winterStoryMinUrgency) return story;
  return null;
}

export function recordDecision(session: DecisionSessionSlice, pack: DecisionPack): void {
  session.recentDecisionIds.push(pack.id);
  if (session.recentDecisionIds.length > 12) {
    session.recentDecisionIds = session.recentDecisionIds.slice(-12);
  }
  if (pack.afterRound != null || pack.beforeRound != null) {
    session.midSeasonDecisionsThisYear += 1;
  }

  const storyKind = storyKindFromPackId(pack.id);
  if (!session.seasonStoryKindsThisYear) session.seasonStoryKindsThisYear = [];
  if (!session.seasonStoryKindsThisYear.includes(storyKind)) {
    session.seasonStoryKindsThisYear.push(storyKind);
  }

  const domain = primaryDomain(pack);
  session.lastPauseDomain = domain;

  if (!session.decisionHistory) session.decisionHistory = [];
  session.decisionHistory.push({
    packId: pack.id,
    trigger: pack.trigger,
    storyKind,
    domain,
    year: session.world.year,
    afterRound: pack.afterRound ?? pack.beforeRound,
    grandPrix: pack.grandPrix,
  });
  if (session.decisionHistory.length > 24) {
    session.decisionHistory = session.decisionHistory.slice(-24);
  }
}

/** Call when the player (or autopilot) commits to an option. */
export function recordDecisionChoice(
  session: DecisionSessionSlice,
  pack: DecisionPack,
  option: DecisionOption,
): void {
  const beat = rivalBeatFromOption(option);
  if (beat) session.lastRivalBeat = beat;

  const history = session.decisionHistory ?? [];
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i]!.packId === pack.id) {
      history[i] = {
        ...history[i]!,
        choiceLabel: option.label,
        rivalBeat: beat ?? history[i]!.rivalBeat,
      };
      break;
    }
  }
}

function scarLinesFromOption(option: DecisionOption): string[] {
  return option.effects
    .map((e) => e.scarLine)
    .filter((s): s is string => Boolean(s));
}

/** Domain-aware autopilot pick — same packs as the UI. */
export function resolveAutopilotDecision(
  session: DecisionSessionSlice & { rand: Rng; player: FieldDriver; seasons: SeasonResult[] },
  pack: DecisionPack,
): DecisionOption {
  const rand = session.rand;
  const last = session.seasons[session.seasons.length - 1];
  const pos = last?.position ?? 10;

  const byDomain = (d: DecisionDomain) =>
    pack.options.filter((o) => o.domain === d);

  // Prefer seat stay when form is good.
  const seatOpts = byDomain("seat");
  const stay = seatOpts.find((o) => o.kind === "stay");
  const reach = seatOpts.find((o) => o.kind === "reach");
  const number2 = seatOpts.find((o) => o.kind === "number2");
  const retire = seatOpts.find((o) => o.kind === "retire");
  const sabbatical = seatOpts.find((o) => o.kind === "sabbatical");

  if (pack.trigger === "winterMarket" || pack.trigger === "midSeason") {
    if (number2 && number2.rank != null && last && number2.rank + 2 <= (session.previousRank ?? 10) && rand() < 0.32) {
      return number2;
    }
    if (sabbatical && pos >= 14 && rand() < 0.22) return sabbatical;
    if (retire && (session.player.age >= 38 || (session.seasons.length >= 15 && rand() < 0.1))) {
      return retire;
    }
    if (reach && reach.rank != null && reach.rank + 2 <= (session.previousRank ?? 10) && pos <= 8 && rand() < 0.42) {
      return reach;
    }
    const move = seatOpts.find((o) => o.kind === "fit");
    if (move && move.rank != null && move.rank < (session.previousRank ?? 10) && pos >= 10 && rand() < 0.28) {
      return move;
    }
    if (stay) return stay;
  }

  if (pack.trigger === "garageWar" || pack.trigger === "supportMutiny") {
    const orders = byDomain("orders");
    if (pos <= 6 && orders.find((o) => o.id.includes("fight"))) {
      return orders.find((o) => o.id.includes("fight")) ?? orders[0]!;
    }
    if (session.supportRoleYears > 0 && orders.find((o) => o.id.includes("accept"))) {
      return orders.find((o) => o.id.includes("accept")) ?? orders[0]!;
    }
    if (reach && rand() < 0.35) return reach;
    return orders[0] ?? pack.options[0]!;
  }

  if (pack.trigger === "titleFight") {
    const rival = byDomain("rival");
    if (pos <= 5 && rival.find((o) => o.id.includes("chase")) && rand() < 0.38) {
      return rival.find((o) => o.id.includes("chase"))!;
    }
    return rival.find((o) => o.id.includes("stay")) ?? pack.options[0]!;
  }

  if (pack.trigger === "formCrisis") {
    if (sabbatical && rand() < 0.3) return sabbatical;
    const safe = seatOpts.find((o) => o.kind === "safe" || o.kind === "fit");
    if (safe && rand() < 0.45) return safe;
    return byDomain("paddock")[0] ?? stay ?? pack.options[0]!;
  }

  if (pack.trigger === "breakthrough") {
    if (reach && rand() < 0.4) return reach;
    return byDomain("contract")[0] ?? stay ?? pack.options[0]!;
  }

  if (pack.trigger === "contractPressure" || pack.trigger === "goalFailed") {
    return byDomain("contract")[0] ?? stay ?? pack.options[0]!;
  }

  // Weighted fallback by urgency labels.
  const weights = pack.options.map((o) => {
    let w = 1;
    if (o.domain === "seat" && o.kind === "stay") w += 2;
    if (o.domain === "paddock") w += 0.5;
    return w;
  });
  const total = weights.reduce((a, b) => a + b, 0);
  let pick = rand() * total;
  for (let i = 0; i < pack.options.length; i++) {
    pick -= weights[i]!;
    if (pick <= 0) return pack.options[i]!;
  }
  return pack.options[0]!;
}

export {
  buildWinterSeatPack,
  offersFromPack,
  scarLinesFromOption,
};
