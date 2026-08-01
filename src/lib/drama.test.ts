import { describe, expect, it } from "vitest";
import {
  buildRivalCareers,
  chooseRival,
  evaluateSeasonGoal,
  rivalNoteFromStandings,
  rivalSeasonLine,
  resolveSeasonRival,
} from "./drama";
import type { SeasonResult, StandingEntry } from "@/types";

function standing(
  partial: Pick<StandingEntry, "name" | "team" | "position" | "isPlayer"> &
    Partial<StandingEntry>,
): StandingEntry {
  return {
    age: 28,
    points: Math.max(0, 400 - partial.position * 25),
    wins: partial.position === 1 ? 8 : partial.position <= 3 ? 2 : 0,
    podiums: partial.position <= 3 ? 10 : 1,
    poles: 0,
    ...partial,
  };
}

describe("rivalries", () => {
  it("builds a rich season note from standings", () => {
    const standings = [
      standing({ name: "You", team: "Ferrari", position: 2, isPlayer: true, points: 300, wins: 4 }),
      standing({
        name: "Nemesis",
        team: "Ferrari",
        position: 1,
        isPlayer: false,
        points: 350,
        wins: 7,
      }),
    ];
    const note = rivalNoteFromStandings(standings, "Nemesis");
    expect(note).toMatchObject({
      sameTeam: true,
      heat: "garage",
      beatThem: false,
      pointsDelta: -50,
      winsDelta: -3,
      titleFight: true,
    });
    expect(rivalSeasonLine(note!)).toMatch(/Garage war/);
  });

  it("prefers a teammate rival often", () => {
    const standings = [
      standing({ name: "You", team: "McLaren", position: 5, isPlayer: true }),
      standing({ name: "Mate", team: "McLaren", position: 4, isPlayer: false }),
      standing({ name: "Other", team: "Williams", position: 6, isPlayer: false }),
    ];
    let mate = 0;
    for (let i = 0; i < 40; i++) {
      const pick = chooseRival(standings, "McLaren", () => i / 40);
      if (pick === "Mate") mate++;
    }
    expect(mate).toBeGreaterThan(10);
  });

  it("can switch rivals after a distant streak", () => {
    const standings = [
      standing({ name: "You", team: "Alpine", position: 8, isPlayer: true }),
      standing({
        name: "Old Foe",
        team: "Ferrari",
        position: 1,
        isPlayer: false,
      }),
      standing({
        name: "Close",
        team: "Alpine",
        position: 7,
        isPlayer: false,
      }),
    ];
    const kept = resolveSeasonRival(
      "Old Foe",
      standings,
      "Alpine",
      0,
      () => 0.99,
    );
    expect(kept.name).toBe("Old Foe");
    expect(kept.distantStreak).toBe(1);

    const swapped = resolveSeasonRival(
      "Old Foe",
      standings,
      "Alpine",
      2,
      () => 0.1,
    );
    expect(swapped.name).toBe("Close");
  });

  it("aggregates multi-rival careers with blurbs", () => {
    const seasons = [
      {
        year: 2024,
        champion: false,
        rival: {
          name: "A",
          team: "Ferrari",
          theirPosition: 1,
          yourPosition: 2,
          beatThem: false,
          sameTeam: true,
          pointsDelta: -40,
          winsDelta: -3,
          titleFight: true,
          heat: "garage" as const,
        },
        standings: [
          standing({ name: "A", team: "Ferrari", position: 1, isPlayer: false }),
          standing({ name: "You", team: "Ferrari", position: 2, isPlayer: true }),
        ],
      },
      {
        year: 2025,
        champion: true,
        rival: {
          name: "A",
          team: "Ferrari",
          theirPosition: 2,
          yourPosition: 1,
          beatThem: true,
          sameTeam: true,
          pointsDelta: 20,
          winsDelta: 1,
          titleFight: true,
          heat: "garage" as const,
        },
        standings: [
          standing({ name: "You", team: "Ferrari", position: 1, isPlayer: true }),
          standing({ name: "A", team: "Ferrari", position: 2, isPlayer: false }),
        ],
      },
      {
        year: 2026,
        champion: false,
        rival: {
          name: "B",
          team: "Red Bull",
          theirPosition: 1,
          yourPosition: 3,
          beatThem: false,
          sameTeam: false,
          pointsDelta: -80,
          winsDelta: -6,
          titleFight: true,
          heat: "title" as const,
        },
        standings: [
          standing({ name: "B", team: "Red Bull", position: 1, isPlayer: false }),
          standing({ name: "You", team: "Ferrari", position: 3, isPlayer: true }),
        ],
      },
    ] as SeasonResult[];

    const rivals = buildRivalCareers(seasons);
    expect(rivals[0]?.name).toBe("A");
    expect(rivals[0]?.teammateSeasons).toBe(2);
    expect(rivals[0]?.blurb).toMatch(/garage/i);
    expect(rivals.some((r) => r.name === "B")).toBe(true);
  });

  it("evaluates beatRival goals", () => {
    const standings = [
      standing({ name: "You", team: "Haas", position: 9, isPlayer: true }),
      standing({ name: "Foe", team: "Williams", position: 11, isPlayer: false }),
    ];
    const met = evaluateSeasonGoal(
      {
        kind: "beatRival",
        label: "Beat Foe",
        detail: "Finish ahead of Foe",
        met: false,
      },
      { position: 9, points: 20, wins: 0, podiums: 0 },
      standings,
      "You",
      "Foe",
    );
    expect(met.met).toBe(true);
  });
});
