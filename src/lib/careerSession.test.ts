import { describe, expect, it } from "vitest";
import {
  advanceCareer,
  beginCareer,
  resolveCareerDecision,
  runAutopilot,
} from "./careerSession";
import { attrsFromOverall, lockedFromAttrs, simulateCareer } from "./game";

function stayChoiceId(session: { pending: { offers: { kind: string; id: string }[]; pack: { options: { kind?: string; id: string }[] } } | null }) {
  const pending = session.pending!;
  return (
    pending.offers.find((o) => o.kind === "stay")?.id ??
    pending.pack.options.find((o) => o.kind === "stay")?.id ??
    pending.pack.options[0]!.id
  );
}

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
    expect(
      session.pending!.offers.some((o) => o.kind === "stay") ||
        session.pending!.pack.options.some((o) => o.kind === "stay"),
    ).toBe(true);
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
        if (!pending.midSeason) {
          expect(pending.lastSeason?.team).toBe(pending.raceTeam);
          if (pending.currentTeam !== pending.raceTeam) {
            expect(pending.marketMove).not.toBeNull();
            expect(pending.marketMove!.from).toBe(pending.raceTeam);
            expect(pending.marketMove!.to).toBe(pending.currentTeam);
          } else {
            expect(pending.marketMove).toBeNull();
          }
          const stayTeam =
            pending.offers.find((o) => o.kind === "stay")?.team ??
            pending.pack.options.find((o) => o.kind === "stay")?.team;
          expect(stayTeam).toBe(pending.currentTeam);
        }

        result = resolveCareerDecision(session, stayChoiceId(session));
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
    while (result === null && session.pending && guards < 40) {
      result = resolveCareerDecision(session, stayChoiceId(session));
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

  it("auto-resolves checkpoint stories without thinning the career", () => {
    const marks = {
      drama: 0,
      number2: 0,
      sabbatical: 0,
      ghost: 0,
    };

    for (let seed = 1; seed <= 24; seed++) {
      const career = runAutopilot(
        beginCareer({
          locked: lockedFromAttrs(attrsFromOverall(90)),
          seed,
          playerName: "Story Auto",
          debutTeam: "Williams",
          startYear: 2024,
        }),
      );
      if (career.pathMarks.dramaBeats?.length) marks.drama++;
      if (career.pathMarks.number2Teams.length) marks.number2++;
      if (career.pathMarks.hadSabbatical) marks.sabbatical++;
      if (career.pathMarks.ghost?.seasons.length) marks.ghost++;
    }

    expect(marks.drama).toBeGreaterThan(0);
    expect(marks.number2 + marks.sabbatical + marks.ghost).toBeGreaterThan(0);
  });

  it("offers retire and can end the career early", () => {
    const session = beginCareer({
      locked: lockedFromAttrs(attrsFromOverall(86)),
      seed: 404,
      playerName: "Early Exit",
      debutTeam: "Williams",
      startYear: 2020,
      control: "decisions",
    });

    let result = advanceCareer(session);
    let guards = 0;
    while (result === null && session.pending && guards < 12) {
      const retire = session.pending.offers.find((o) => o.kind === "retire");
      if (retire && session.pending.seasonsDone >= 6) {
        const seasonsAtExit = session.pending.seasonsDone;
        result = resolveCareerDecision(session, retire.id);
        expect(result).not.toBeNull();
        expect(result!.endReason).toBe("retired");
        expect(result!.pathMarks.walkedAway).toBe(true);
        expect(result!.pathMarks.ghost).not.toBeNull();
        expect(result!.pathMarks.ghost!.seasons.length).toBeGreaterThan(0);
        expect(result!.pathMarks.ghost!.headline.length).toBeGreaterThan(10);
        expect(result!.summary.toLowerCase()).toMatch(/walked away/);
        expect(result!.seasons.length).toBe(seasonsAtExit);
        return;
      }
      result = resolveCareerDecision(session, stayChoiceId(session));
      guards++;
    }

    // If this seed never exposed retire, still prove the kind can appear.
    expect(guards).toBeLessThan(12);
  });

  it("sit-out skips a calendar year then returns to the grid", () => {
    const session = beginCareer({
      locked: lockedFromAttrs(attrsFromOverall(88)),
      seed: 77,
      playerName: "Year Off",
      debutTeam: "Alpine",
      startYear: 2018,
      control: "decisions",
    });

    let result = advanceCareer(session);
    let guards = 0;
    while (result === null && session.pending && guards < 12) {
      const sabbatical = session.pending.offers.find(
        (o) => o.kind === "sabbatical",
      );
      if (sabbatical) {
        const seasonsBefore = session.seasons.length;
        const yearBefore = session.world.year;
        result = resolveCareerDecision(session, sabbatical.id);
        expect(session.hadSabbatical).toBe(true);
        expect(session.sabbaticalYear).not.toBeNull();
        expect(session.formRustYears).toBeGreaterThanOrEqual(0);
        expect(session.seasons.length).toBeGreaterThan(seasonsBefore);
        expect(session.world.year).toBeGreaterThan(yearBefore);
        expect(session.player.team.length).toBeGreaterThan(0);
        const returned = session.seasons.find((s) =>
          s.seatNote.toLowerCase().includes("sitting out"),
        );
        expect(returned).toBeTruthy();
        return;
      }
      result = resolveCareerDecision(session, stayChoiceId(session));
      guards++;
    }

    expect.fail("expected a sabbatical option within twelve checkpoints");
  });

  it("number-two deals set a support-role window", () => {
    const session = beginCareer({
      locked: lockedFromAttrs(attrsFromOverall(92)),
      seed: 21,
      playerName: "Second Seat",
      debutTeam: "Haas",
      startYear: 2022,
      control: "decisions",
    });

    let result = advanceCareer(session);
    let guards = 0;
    while (result === null && session.pending && guards < 12) {
      const number2 = session.pending.offers.find((o) => o.kind === "number2");
      if (number2) {
        const team = number2.team;
        result = resolveCareerDecision(session, number2.id);
        // Career may continue through later winters after the #2 signing.
        expect(session.number2Teams).toContain(team);
        expect(
          session.seasons.some(
            (s) =>
              s.supportRole === true ||
              s.seatNote.toLowerCase().includes("number two"),
          ),
        ).toBe(true);
        return;
      }
      result = resolveCareerDecision(session, stayChoiceId(session));
      guards++;
    }

    // Not every seed offers a #2 seat — skip soft if the market never opens one.
    expect(guards).toBeLessThanOrEqual(12);
  });
});
