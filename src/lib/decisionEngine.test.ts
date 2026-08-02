import { describe, expect, it } from "vitest";
import {
  evaluateDecisionTriggers,
  recordDecision,
  resolveAutopilotDecision,
  HIGH_DENSITY_PROFILE,
  MEDIUM_DENSITY_PROFILE,
  LOW_DENSITY_PROFILE,
  type DecisionEvalContext,
} from "./decisionEngine";
import { beginCareer } from "./careerSession";
import { attrsFromOverall, lockedFromAttrs } from "./game";
import type { SeasonResult } from "@/types";
import { mulberry32 } from "./ratings";

function lastSeason(partial: Partial<SeasonResult>): SeasonResult {
  return {
    year: 2028,
    age: 29,
    team: "Ferrari",
    teamTier: 1,
    position: 4,
    points: 200,
    wins: 1,
    podiums: 4,
    poles: 0,
    dnfs: 1,
    champion: false,
    races: [],
    standings: [],
    constructors: [],
    championName: "Someone",
    championPoints: 400,
    seatNote: "Stay",
    replacedDriver: null,
    offseason: null,
    goal: null,
    rival: null,
    chapter: "peak",
    ...partial,
  };
}

function ctxFromSession(
  session: ReturnType<typeof beginCareer>,
  last: SeasonResult,
  extra: Partial<DecisionEvalContext> = {},
): DecisionEvalContext {
  return {
    session,
    lastSeason: last,
    seasonsDone: session.seasons.length,
    isWinterCheckpoint: true,
    ...extra,
  };
}

const garageRival = {
  name: "Mate",
  team: "Ferrari",
  theirPosition: 1,
  yourPosition: 2,
  beatThem: false,
  sameTeam: true,
  pointsDelta: -40,
  winsDelta: -3,
  titleFight: true,
  heat: "garage" as const,
};

describe("decisionEngine", () => {
  it("guarantees a winter seat pack at hard checkpoints", () => {
    const session = beginCareer({
      locked: lockedFromAttrs(attrsFromOverall(88)),
      seed: 77,
      playerName: "Picker",
      debutTeam: "Alpine",
      startYear: 2024,
      control: "decisions",
    });
    session.seasons.push(
      lastSeason({ position: 6 }),
      lastSeason({ year: 2029, position: 5 }),
      lastSeason({ year: 2030, position: 4 }),
    );

    const pack = evaluateDecisionTriggers(
      ctxFromSession(session, session.seasons[2]!),
      mulberry32(1),
    );
    expect(pack).not.toBeNull();
    expect(pack!.options.some((o) => o.domain === "seat")).toBe(true);
    expect(pack!.headline.length).toBeGreaterThan(5);
  });

  it("fires garage-war story packs from teammate rivalry state", () => {
    const session = beginCareer({
      locked: lockedFromAttrs(attrsFromOverall(90)),
      seed: 3,
      playerName: "Garage",
      startYear: 2024,
    });
    const last = lastSeason({ rival: garageRival });
    session.seasons.push(last, last, last);

    const pack = evaluateDecisionTriggers(
      ctxFromSession(session, last),
      () => 0.05,
    );
    expect(pack?.trigger === "garageWar" || pack?.trigger === "winterMarket").toBe(
      true,
    );
    if (pack?.trigger === "garageWar") {
      expect(pack.options.some((o) => o.domain === "orders")).toBe(true);
    }
  });

  it("respects mid-season caps via session state", () => {
    const session = beginCareer({
      locked: lockedFromAttrs(attrsFromOverall(86)),
      seed: 12,
      playerName: "Mid",
      startYear: 2024,
    });
    session.midSeasonDecisionsThisYear = 2;
    const last = lastSeason({ position: 12 });

    const pack = evaluateDecisionTriggers(
      {
        session,
        lastSeason: last,
        seasonsDone: 1,
        isWinterCheckpoint: false,
        afterRound: 12,
        playerPosition: 12,
        playerPoints: 20,
        calendarLength: 24,
      },
      mulberry32(4),
    );
    expect(pack).toBeNull();
  });

  it("autopilot picks a valid option from every trigger family", () => {
    const session = beginCareer({
      locked: lockedFromAttrs(attrsFromOverall(88)),
      seed: 99,
      playerName: "Auto",
      startYear: 2024,
    });
    session.seasons.push(lastSeason({ position: 8 }));

    for (const seed of [1, 2, 3, 4, 5]) {
      const pack = evaluateDecisionTriggers(
        ctxFromSession(session, session.seasons[0]!),
        mulberry32(seed),
      );
      if (!pack) continue;
      const pick = resolveAutopilotDecision(session, pack);
      expect(pack.options.some((o) => o.id === pick.id)).toBe(true);
    }
  });

  it("high density fires soft winter story on non-checkpoint winters", () => {
    const session = beginCareer({
      locked: lockedFromAttrs(attrsFromOverall(90)),
      seed: 5,
      playerName: "High",
      startYear: 2024,
      decisionDensity: "high",
    });
    const last = lastSeason({
      position: 14,
      rival: garageRival,
    });
    session.seasons.push(last, last, last, last, last, last);

    const pack = evaluateDecisionTriggers(
      {
        ...ctxFromSession(session, last),
        isWinterCheckpoint: false,
      },
      () => 0,
    );
    expect(pack).not.toBeNull();
    expect((pack!.urgency ?? 0) >= HIGH_DENSITY_PROFILE.winterStoryMinUrgency).toBe(
      true,
    );
  });

  it("medium and low suppress lower-urgency non-checkpoint winters", () => {
    const last = lastSeason({
      position: 12,
      rival: {
        ...garageRival,
        heat: "wheel",
        sameTeam: false,
        titleFight: false,
      },
    });

    for (const density of ["medium", "low"] as const) {
      const session = beginCareer({
        locked: lockedFromAttrs(attrsFromOverall(88)),
        seed: 44,
        playerName: density,
        startYear: 2024,
        decisionDensity: density,
      });
      session.seasons.push(last, last, last, last);

      const pack = evaluateDecisionTriggers(
        {
          ...ctxFromSession(session, last),
          isWinterCheckpoint: false,
        },
        () => 0.99,
      );
      const profile =
        density === "medium" ? MEDIUM_DENSITY_PROFILE : LOW_DENSITY_PROFILE;
      if (pack) {
        expect((pack.urgency ?? 0) >= profile.winterStoryMinUrgency).toBe(true);
      }
    }
  });

  it("anti-repeat blocks the same story kind twice in one season", () => {
    const session = beginCareer({
      locked: lockedFromAttrs(attrsFromOverall(90)),
      seed: 8,
      playerName: "Repeat",
      startYear: 2024,
      decisionDensity: "high",
    });
    session.seasons.push(
      lastSeason({ position: 4, rival: garageRival }),
      lastSeason({ position: 4, rival: garageRival }),
      lastSeason({ position: 4, rival: garageRival }),
    );
    session.seasonStoryKindsThisYear = ["garageWar"];
    session.decisionHistory = [
      {
        packId: "garageWar:s3:r12",
        trigger: "midSeason",
        storyKind: "garageWar",
        domain: "rival",
        year: session.world.year,
        afterRound: 12,
      },
    ];

    const pack = evaluateDecisionTriggers(
      {
        session,
        lastSeason: session.seasons[2]!,
        seasonsDone: 3,
        isWinterCheckpoint: false,
        afterRound: 14,
        playerPosition: 4,
        calendarLength: 24,
      },
      mulberry32(2),
    );
    expect(pack).toBeNull();
  });

  it("garage/high heat mid-season packs include truce and non-binary options", () => {
    const session = beginCareer({
      locked: lockedFromAttrs(attrsFromOverall(92)),
      seed: 21,
      playerName: "Variety",
      startYear: 2024,
      decisionDensity: "high",
    });
    session.seasons.push(
      lastSeason({ position: 3, rival: garageRival }),
      lastSeason({ position: 3, rival: garageRival }),
      lastSeason({ position: 3, rival: garageRival }),
    );

    const pack = evaluateDecisionTriggers(
      {
        session,
        lastSeason: session.seasons[2]!,
        seasonsDone: 3,
        isWinterCheckpoint: false,
        afterRound: 12,
        playerPosition: 3,
        calendarLength: 24,
      },
      mulberry32(1),
    );
    expect(pack).not.toBeNull();
    const labels = pack!.options.map((o) => o.id);
    expect(labels.some((id) => id.includes("truce"))).toBe(true);
    expect(labels.length).toBeGreaterThan(2);
    expect(
      labels.some((id) => id.includes("chase") || id.includes("protect")),
    ).toBe(true);
  });

  it("records decision history on pack fire", () => {
    const session = beginCareer({
      locked: lockedFromAttrs(attrsFromOverall(88)),
      seed: 1,
      playerName: "Hist",
      startYear: 2024,
    });
    session.seasons.push(lastSeason({ position: 6 }), lastSeason({ position: 7 }), lastSeason({ position: 8 }));

    const pack = evaluateDecisionTriggers(
      ctxFromSession(session, session.seasons[2]!),
      mulberry32(3),
    );
    expect(pack).not.toBeNull();
    recordDecision(session, pack!);
    expect(session.decisionHistory.length).toBe(1);
    expect(session.recentDecisionIds.at(-1)).toBe(pack!.id);
  });

  it("breakthrough momentum packs re-sign on Seats, not safer downgrades", () => {
    const session = beginCareer({
      locked: lockedFromAttrs(attrsFromOverall(92)),
      seed: 42,
      playerName: "Hot",
      debutTeam: "Ferrari",
      startYear: 2001,
    });
    session.player.team = "Ferrari";
    session.world.year = 2003;
    const last = lastSeason({
      year: 2002,
      position: 3,
      wins: 1,
      points: 70,
      team: "Ferrari",
    });
    session.seasons.push(
      lastSeason({ year: 2001, position: 6, team: "Ferrari" }),
      last,
    );

    let pack = null;
    for (let seed = 0; seed < 40; seed++) {
      const candidate = evaluateDecisionTriggers(
        ctxFromSession(session, last),
        mulberry32(seed),
      );
      if (candidate?.trigger === "breakthrough") {
        pack = candidate;
        break;
      }
    }
    expect(pack).not.toBeNull();
    const seats = pack!.options.filter((o) => o.domain === "seat");
    expect(seats.some((o) => o.kind === "stay")).toBe(true);
    expect(seats.some((o) => o.kind === "safe")).toBe(false);
  });
});
