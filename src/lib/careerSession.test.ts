import { describe, expect, it } from "vitest";
import {
  advanceCareer,
  beginCareer,
  resolveCareerDecision,
  runAutopilot,
} from "./careerSession";
import { attrsFromOverall, lockedFromAttrs, simulateCareer } from "./game";

describe("career control modes", () => {
  it("autopilot simulateCareer finishes without pausing", () => {
    const locked = lockedFromAttrs(attrsFromOverall(86));
    const career = simulateCareer(locked, {
      seed: 42,
      playerName: "Auto Pilot",
      debutTeam: "Williams",
      startYear: 2024,
    });
    expect(career.seasons.length).toBeGreaterThan(0);
    expect(career.summary.length).toBeGreaterThan(10);
  });

  it("decisions mode pauses at a mid-career checkpoint", () => {
    const locked = lockedFromAttrs(attrsFromOverall(88));
    const session = beginCareer({
      locked,
      seed: 77,
      playerName: "Seat Picker",
      debutTeam: "Alpine",
      startYear: 2024,
      control: "decisions",
    });

    const first = advanceCareer(session);
    expect(first).toBeNull();
    expect(session.pending).not.toBeNull();
    expect(session.pending!.seasonsDone).toBeGreaterThanOrEqual(3);
    expect(session.pending!.seasonsDone % 3).toBe(0);
    expect(session.pending!.offers.some((o) => o.kind === "stay")).toBe(true);
    expect(session.pending!.offers.length).toBeGreaterThanOrEqual(2);
  });

  it("reports the raced team and any winter move consistently", () => {
    for (const seed of [3, 21, 77, 101, 404, 909]) {
      const session = beginCareer({
        locked: lockedFromAttrs(attrsFromOverall(85)),
        seed,
        playerName: "Seat Checker",
        startYear: 2024,
        control: "decisions",
      });

      let result = advanceCareer(session);
      let guards = 0;
      while (result === null && session.pending && guards < 12) {
        const pending = session.pending;
        // The seat shown in talks must be explained by the season log: either
        // it is the team they raced for, or a stated winter move away from it.
        expect(pending.raceTeam).toBe(pending.lastSeason.team);
        if (pending.currentTeam !== pending.raceTeam) {
          expect(pending.marketMove).not.toBeNull();
          expect(pending.marketMove!.from).toBe(pending.raceTeam);
          expect(pending.marketMove!.to).toBe(pending.currentTeam);
        } else {
          expect(pending.marketMove).toBeNull();
        }
        expect(
          pending.offers.find((o) => o.kind === "stay")?.team,
        ).toBe(pending.currentTeam);

        result = resolveCareerDecision(session, pending.currentTeam);
        guards++;
      }
    }
  });

  it("resolving a decision continues and can finish the career", () => {
    const locked = lockedFromAttrs(attrsFromOverall(90));
    const session = beginCareer({
      locked,
      seed: 101,
      playerName: "Decider",
      debutTeam: "Haas",
      startYear: 2024,
      control: "decisions",
    });

    let result = advanceCareer(session);
    let guards = 0;
    while (result === null && session.pending && guards < 12) {
      const stay =
        session.pending.offers.find((o) => o.kind === "stay")?.team ??
        session.pending.offers[0]!.team;
      result = resolveCareerDecision(session, stay);
      guards++;
    }

    expect(result).not.toBeNull();
    expect(result!.seasons.length).toBeGreaterThanOrEqual(3);
    expect(result!.tierLabel.length).toBeGreaterThan(0);
  });

  it("runAutopilot ignores decisions control and finishes", () => {
    const locked = lockedFromAttrs(attrsFromOverall(84));
    const session = beginCareer({
      locked,
      seed: 9,
      playerName: "Forced Auto",
      startYear: 2024,
      control: "decisions",
    });
    const career = runAutopilot(session);
    expect(career.seasons.length).toBeGreaterThan(0);
    expect(session.pending).toBeNull();
  });
});
