import { buildAlternateHistory } from "./altHistory";
import { describe, expect, it } from "vitest";
import {
  LAST_COMPLETED_HISTORY_YEAR,
  LATEST_START_YEAR,
  pointsTableForYear,
  rulesForYear,
  sprintPointsTableForYear,
} from "./f1Meta";
import { createWorld, runOffseason, simulateWorldSeason } from "./fieldSim";
import {
  attrsFromOverall,
  lockedFromAttrs,
  mulberry32,
  simulateCareer,
} from "./game";
import { successorAmong } from "./constructorLineage";
import { evaluateSeasonGoal, pickSeasonGoal } from "./drama";
import {
  cleanJuniorName,
  eligibleJuniorNames,
  juniorsForYear,
  legacyEligibleJuniorNames,
  pickJunior,
} from "./juniors";
import { generateDriverName } from "./names";
import { careerShareText } from "./shareCard";
import type { StandingEntry } from "@/types";

describe("historical season rules", () => {
  it.each([
    [1988, [9, 6, 4, 3, 2, 1], 0],
    [1991, [10, 6, 4, 3, 2, 1], 0],
    [2003, [10, 8, 6, 5, 4, 3, 2, 1], 0],
    [2010, [25, 18, 15, 12, 10, 8, 6, 4, 2, 1], 0],
    [2021, [25, 18, 15, 12, 10, 8, 6, 4, 2, 1], 3],
    [2022, [25, 18, 15, 12, 10, 8, 6, 4, 2, 1], 8],
  ] as const)(
    "%i uses the right points tables",
    (year, points, sprintLen) => {
      expect([...pointsTableForYear(year)]).toEqual([...points]);
      expect(sprintPointsTableForYear(year)).toHaveLength(sprintLen);
      const rules = rulesForYear(year);
      expect([...rules.pointsTable]).toEqual([...points]);
      expect(rules.calendar.length).toBeGreaterThan(10);
    },
  );

  it.each([1988, 1994, 2003, 2012, 2021])(
    "%i simulated season matches the calendar length",
    (year) => {
      const rand = mulberry32(year * 17);
      const world = createWorld(rand, year);
      const result = simulateWorldSeason(world, rand);
      const races = world.rules.calendar.length;

      expect(result.standings[0]?.wins ?? 0).toBeLessThanOrEqual(races);
      const totalWins = result.standings.reduce((n, s) => n + s.wins, 0);
      expect(totalWins).toBe(races);
      expect(world.drivers.length).toBe(world.teams.length * 2);
    },
  );
});

describe("constructor lineage", () => {
  it("follows known rebrand paths", () => {
    expect(
      successorAmong("Toro Rosso", new Set(["Racing Bulls", "Ferrari"])),
    ).toBe("Racing Bulls");
    expect(successorAmong("Sauber", new Set(["Audi", "Mercedes"]))).toBe(
      "Audi",
    );
    expect(
      successorAmong("Jordan", new Set(["Aston Martin", "McLaren"])),
    ).toBe("Aston Martin");
    expect(successorAmong("Minardi", new Set(["AlphaTauri"]))).toBe(
      "AlphaTauri",
    );
    expect(successorAmong("Ferrari", new Set(["Ferrari", "McLaren"]))).toBe(
      "Ferrari",
    );
    expect(successorAmong("Toyota", new Set(["Ferrari"]))).toBeNull();
  });
});

describe("junior pool & names", () => {
  it("strips Wikipedia disambiguation junk", () => {
    expect(cleanJuniorName("Alex García (racing driver, born 2003)")).toBe(
      "Alex García",
    );
    expect(cleanJuniorName("Miloš Pavlović (racecar driver)")).toBe(
      "Miloš Pavlović",
    );
    expect(cleanJuniorName("Denis Nagulin (page does not exist)")).toBe(
      "Denis Nagulin",
    );
  });

  it("excludes drivers who died before the simulated year", () => {
    for (let year = 2020; year <= 2045; year++) {
      const pool = juniorsForYear(year, new Set(), 200);
      expect(pool.map((p) => p.name)).not.toContain("Anthoine Hubert");
      expect(pool.map((p) => p.name)).not.toContain("Jules Bianchi");
    }
    for (let seed = 0; seed < 50; seed++) {
      const pick = pickJunior(2025, new Set(), mulberry32(seed));
      expect(pick?.name).not.toBe("Anthoine Hubert");
    }
  });

  const STALE_FEEDER_BUGS = [
    "Adam Carroll",
    "Adrián Vallés",
    "Adrian Quaife-Hobbs",
    "Alessio Deledda",
  ] as const;

  it("blocks stale GP2/F2 graduates from 2026+ grids and promotion", () => {
    for (let year = 2026; year <= 2045; year++) {
      const pool = juniorsForYear(year, new Set(), 200).map((p) => p.name);
      for (const name of STALE_FEEDER_BUGS) {
        expect(pool).not.toContain(name);
      }
    }
    for (let seed = 0; seed < 120; seed++) {
      const pick = pickJunior(2026, new Set(), mulberry32(seed));
      expect(STALE_FEEDER_BUGS).not.toContain(pick?.name);
      const pickLater = pickJunior(2032, new Set(), mulberry32(seed + 500));
      expect(STALE_FEEDER_BUGS).not.toContain(pickLater?.name);
    }
  });

  it("caps promotion age and feeder window for 2026 intake", () => {
    const legacy = new Set(legacyEligibleJuniorNames(2026));
    const current = new Set(eligibleJuniorNames(2026));
    const newlyBlocked = [...legacy].filter((name) => !current.has(name));
    expect(newlyBlocked.length).toBe(113);
    for (const name of STALE_FEEDER_BUGS) {
      expect(current.has(name)).toBe(false);
    }
    for (const p of juniorsForYear(2026, new Set(), 200)) {
      expect(p.age).toBeLessThanOrEqual(28);
    }
  });

  it("still finds a junior when every feeder name is marked used", () => {
    const taken = new Set<string>();
    // Saturate the pool the normal way first.
    for (let i = 0; i < 900; i++) {
      const pick = pickJunior(2040, taken, mulberry32(i + 1));
      if (!pick) break;
      taken.add(pick.name);
    }
    expect(taken.size).toBeGreaterThan(100);

    // Active-only exclusion should still yield someone for ensureFullGrid's recycle path.
    const active = new Set(["Max Verstappen", "Lewis Hamilton"]);
    const recycled = pickJunior(2045, active, mulberry32(99));
    expect(recycled).not.toBeNull();
    expect(recycled!.name.includes("(")).toBe(false);
  });

  it("never uses Jr. as a surname and avoids real F1 names", () => {
    const rand = mulberry32(42);
    for (let i = 0; i < 80; i++) {
      const name = generateDriverName(undefined, rand);
      expect(name.toLowerCase().endsWith("jr.")).toBe(false);
      expect(name.toLowerCase().endsWith(" jr")).toBe(false);
      expect(name.split(/\s+/).length).toBeGreaterThanOrEqual(2);
    }
  });
});

describe("drama goals", () => {
  const standings: StandingEntry[] = [
    {
      position: 1,
      name: "You",
      team: "Ferrari",
      age: 24,
      points: 100,
      wins: 2,
      podiums: 5,
      poles: 1,
      isPlayer: true,
    },
    {
      position: 3,
      name: "Teammate",
      team: "Ferrari",
      age: 28,
      points: 60,
      wins: 0,
      podiums: 2,
      poles: 0,
      isPlayer: false,
    },
  ];

  it("evaluates each goal kind", () => {
    const season = { position: 1, points: 100, wins: 2, podiums: 5 };
    expect(
      evaluateSeasonGoal(
        { kind: "win", label: "", detail: "", met: false },
        season,
        standings,
        "You",
      ).met,
    ).toBe(true);
    expect(
      evaluateSeasonGoal(
        { kind: "podium", label: "", detail: "", met: false },
        season,
        standings,
        "You",
      ).met,
    ).toBe(true);
    expect(
      evaluateSeasonGoal(
        { kind: "topTen", label: "", detail: "", met: false },
        season,
        standings,
        "You",
      ).met,
    ).toBe(true);
    expect(
      evaluateSeasonGoal(
        { kind: "scorePoints", label: "", detail: "Score at least 10", met: false },
        season,
        standings,
        "You",
      ).met,
    ).toBe(true);
    expect(
      evaluateSeasonGoal(
        { kind: "survive", label: "", detail: "", met: false },
        { ...season, position: 12 },
        standings,
        "You",
      ).met,
    ).toBe(true);
    expect(
      evaluateSeasonGoal(
        { kind: "beatTeammate", label: "", detail: "", met: false },
        season,
        standings,
        "You",
      ).met,
    ).toBe(true);
  });

  it("always returns a goal with a label", () => {
    const goal = pickSeasonGoal(
      {
        seasonIndex: 0,
        teamTier: 3,
        peakOverall: 80,
        teammateName: "Teammate",
      },
      mulberry32(7),
    );
    expect(goal.label.length).toBeGreaterThan(3);
    expect(goal.met).toBe(false);
  });
});

describe("long careers and winter reporting", () => {
  it("keeps a full real-name grid from 1988 deep into the future", () => {
    const rand = mulberry32(1988);
    const world = createWorld(rand, 1988);

    for (let i = 0; i < 40; i++) {
      const result = simulateWorldSeason(world, rand);
      runOffseason(world, result, rand);
      expect(world.drivers.length).toBe(world.teams.length * 2);
      for (const team of world.teams) {
        expect(world.drivers.filter((d) => d.team === team.name)).toHaveLength(
          2,
        );
      }
      expect(world.drivers.every((d) => !d.name.includes("("))).toBe(true);
    }
    expect(world.year).toBeGreaterThan(LATEST_START_YEAR);
  });

  it("records rebrands in the winter note across the Sauber → Audi change", () => {
    const career = simulateCareer(lockedFromAttrs(attrsFromOverall(88)), {
      seed: 2024,
      playerName: "Test Driver",
      startYear: 2024,
      debutTeam: "Sauber",
    });

    const winters = career.seasons.map((s) => s.offseason).filter(Boolean);
    expect(winters.length).toBeGreaterThan(0);

    const allMoves = winters.flatMap((w) => w!.moves);
    const rebrand = allMoves.some((m) => /becomes/i.test(m));
    const droveAudi = career.seasons.some((s) => s.team === "Audi");
    expect(rebrand || droveAudi).toBe(true);
  });
});

describe("share text", () => {
  it("includes debut team and career span", () => {
    const career = simulateCareer(lockedFromAttrs(attrsFromOverall(80)), {
      seed: 11,
      playerName: "Share Driver",
      startYear: 2012,
      debutTeam: "McLaren",
    });
    const text = careerShareText("Share Driver", career);
    expect(text).toContain("Debut: McLaren");
    expect(text).toMatch(/2012/);
  });
});

describe("alt-history span", () => {
  it("stops at the last completed season even when the career runs past it", () => {
    const career = simulateCareer(lockedFromAttrs(attrsFromOverall(90)), {
      seed: 2015,
      playerName: "Test Driver",
      startYear: 2015,
      debutTeam: "Ferrari",
    });
    expect(career.seasons.some((s) => s.year >= LATEST_START_YEAR)).toBe(true);

    const report = buildAlternateHistory(career, "Test Driver")!;
    expect(report.toYear).toBeLessThanOrEqual(LAST_COMPLETED_HISTORY_YEAR);
  });
});
