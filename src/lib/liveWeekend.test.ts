import { describe, expect, it } from "vitest";
import {
  buildLiveWeekendPack,
  evaluateDecisionTriggers,
  type DecisionEvalContext,
} from "./decisionEngine";
import { beginCareer, advanceCareer, resolveCareerDecision } from "./careerSession";
import { attrsFromOverall, lockedFromAttrs } from "./game";
import { GRAND_PRIX_CALENDAR } from "./f1Meta";
import type { SeasonResult } from "@/types";
import { mulberry32 } from "./ratings";

function season(partial: Partial<SeasonResult> = {}): SeasonResult {
  return {
    year: 2026,
    age: 26,
    team: "McLaren",
    teamTier: 2,
    position: 4,
    points: 180,
    wins: 1,
    podiums: 4,
    poles: 1,
    dnfs: 0,
    champion: false,
    races: [],
    standings: [],
    constructors: [],
    championName: "Other",
    championPoints: 400,
    seatNote: "Stay",
    replacedDriver: null,
    offseason: null,
    goal: null,
    rival: {
      name: "Rival Driver",
      team: "Ferrari",
      theirPosition: 2,
      yourPosition: 4,
      beatThem: false,
      sameTeam: false,
      pointsDelta: -40,
      winsDelta: -2,
      titleFight: true,
      heat: "title",
    },
    chapter: "peak",
    ...partial,
  };
}

describe("live weekend pack", () => {
  it("builds a named GP pack with three weekend modes", () => {
    const session = beginCareer({
      locked: lockedFromAttrs(attrsFromOverall(90)),
      seed: 5,
      playerName: "Weekend",
      startYear: 2024,
      decisionDensity: "high",
    });
    session.seasons.push(season(), season(), season());

    const ctx: DecisionEvalContext = {
      session,
      lastSeason: season(),
      seasonsDone: 3,
      isWinterCheckpoint: false,
      beforeRound: 12,
      grandPrix: "Monaco Grand Prix",
      playerPosition: 4,
      calendarLength: 24,
    };

    const pack = buildLiveWeekendPack(ctx, mulberry32(3));
    expect(pack.trigger).toBe("liveWeekend");
    expect(pack.grandPrix).toBe("Monaco Grand Prix");
    expect(pack.options).toHaveLength(3);
    expect(
      pack.options.every((o) =>
        o.effects.some((e) => e.kind === "weekendCall" && e.weekendMode),
      ),
    ).toBe(true);
  });

  it("picks different GPs across careers instead of always British", () => {
    const gps = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) {
      const session = beginCareer({
        locked: lockedFromAttrs(attrsFromOverall(92)),
        seed: 2000 + seed,
        playerName: "Tour",
        debutTeam: "McLaren",
        startYear: 2024,
        control: "decisions",
        decisionDensity: "high",
      });
      let result = advanceCareer(session);
      let guards = 0;
      while (result === null && session.pending && guards < 30) {
        if (session.pending.pack.trigger === "liveWeekend") {
          gps.add(session.pending.pack.grandPrix ?? "");
          break;
        }
        const pick =
          session.pending.pack.options.find((o) => o.kind === "stay")?.id ??
          session.pending.pack.options[0]!.id;
        result = resolveCareerDecision(session, pick);
        guards++;
      }
    }
    expect(gps.size).toBeGreaterThan(3);
    expect(gps.has("British GP") || gps.has("British Grand Prix")).toBe(true);
    // Must not be British-only.
    const onlyBritish =
      gps.size === 1 &&
      [...gps][0]!.toLowerCase().includes("british");
    expect(onlyBritish).toBe(false);
    // Chosen names should come from the modern calendar.
    for (const name of gps) {
      expect(
        (GRAND_PRIX_CALENDAR as readonly string[]).includes(name) ||
          name.toLowerCase().includes("gp"),
      ).toBe(true);
    }
  });

  it("often skips even when the calendar slot is eligible", () => {
    const session = beginCareer({
      locked: lockedFromAttrs(attrsFromOverall(90)),
      seed: 9,
      playerName: "Rare",
      startYear: 2024,
      decisionDensity: "medium",
    });
    session.seasons.push(
      season(),
      season(),
      season(),
      season(),
      season(),
      season(),
    );

    let hits = 0;
    for (let i = 0; i < 40; i++) {
      const pack = evaluateDecisionTriggers(
        {
          session,
          lastSeason: season({ position: 2 }),
          seasonsDone: 6,
          isWinterCheckpoint: false,
          beforeRound: 12,
          grandPrix: "British Grand Prix",
          playerPosition: 2,
          calendarLength: 24,
        },
        mulberry32(1000 + i),
      );
      if (pack?.trigger === "liveWeekend") hits += 1;
    }
    // Medium fire chance ~28% — should not fire nearly every time.
    expect(hits).toBeLessThan(25);
    expect(hits).toBeGreaterThan(0);
  });
});
