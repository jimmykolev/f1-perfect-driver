import { describe, expect, it } from "vitest";
import {
  attributesAtAge,
  createWorld,
  marketValue,
  runOffseason,
  seatPlayerForDebut,
  simulateWorldSeason,
  type World,
} from "./fieldSim";
import {
  attrsFromOverall,
  computeOverall,
  lockedFromAttrs,
  mulberry32,
  simulateCareer,
  simulateProbeSeason,
} from "./game";
import { SPRINT_ROUNDS, TEAM_NAMES_2026 } from "./f1Meta";

function freshWorld(seed = 1) {
  const rand = mulberry32(seed);
  return { world: createWorld(rand), rand };
}

function everyTeamHasTwoDrivers(world: World) {
  return TEAM_NAMES_2026.every(
    (team) => world.drivers.filter((d) => d.team === team).length === 2,
  );
}

describe("2026 grid", () => {
  it("fields 22 drivers across 11 teams", () => {
    const { world } = freshWorld();
    expect(world.drivers).toHaveLength(22);
    expect(everyTeamHasTwoDrivers(world)).toBe(true);
  });

  it("gives every driver a plausible age", () => {
    const { world } = freshWorld();
    for (const d of world.drivers) {
      expect(d.age).toBeGreaterThanOrEqual(18);
      expect(d.age).toBeLessThanOrEqual(45);
    }
  });

  it("seats the player by displacing one driver, who stays in the sport", () => {
    const { world, rand } = freshWorld(7);
    const before = world.drivers.map((d) => d.name);

    const debut = seatPlayerForDebut(
      world,
      { name: "Test Driver", peak: attrsFromOverall(82), age: 20 },
      rand,
    );

    expect(world.drivers).toHaveLength(22);
    expect(everyTeamHasTwoDrivers(world)).toBe(true);
    expect(debut.replaced).not.toBeNull();
    expect(before).toContain(debut.replaced);
    // Displaced, not deleted.
    expect(world.freeAgents.map((d) => d.name)).toContain(debut.replaced);
    expect(world.drivers.filter((d) => d.isPlayer)).toHaveLength(1);
  });
});

describe("age curve", () => {
  it("peaks between 27 and 30 and fades afterwards", () => {
    const peak = attrsFromOverall(90);
    const prime = computeOverall(attributesAtAge(peak, 28));
    const rookie = computeOverall(attributesAtAge(peak, 19));
    const veteran = computeOverall(attributesAtAge(peak, 40));

    expect(prime).toBeGreaterThan(rookie);
    expect(prime).toBeGreaterThan(veteran);
    expect(rookie).toBeGreaterThan(veteran);
  });

  it("costs older drivers more one-lap pace than race craft", () => {
    const peak = attrsFromOverall(90);
    const old = attributesAtAge(peak, 40);
    const qualiLoss = peak.qualifying - old.qualifying;
    const craftLoss = peak.raceCraft - old.raceCraft;
    expect(qualiLoss).toBeGreaterThan(craftLoss);
  });
});

describe("season simulation", () => {
  it("awards exactly one pole per race, always to a P1 start", () => {
    const { world, rand } = freshWorld(3);
    const result = simulateWorldSeason(world, rand);

    const poles = result.standings.reduce((sum, row) => sum + row.poles, 0);
    expect(poles).toBe(24);

    let poleRaces = 0;
    for (const race of result.playerRaces) {
      if (race.pole) {
        poleRaces++;
        expect(race.grid).toBe(1);
      }
    }
    expect(poleRaces).toBeGreaterThanOrEqual(0);
  });

  it("ranks 22 drivers with the leader on top", () => {
    const { world, rand } = freshWorld(11);
    const result = simulateWorldSeason(world, rand);

    expect(result.standings).toHaveLength(22);
    for (let i = 1; i < result.standings.length; i++) {
      expect(result.standings[i - 1]!.points).toBeGreaterThanOrEqual(
        result.standings[i]!.points,
      );
    }
    expect(result.championName).toBe(result.standings[0]!.name);
  });

  it("produces a realistic champion score and win spread", () => {
    const { world, rand } = freshWorld(21);
    const result = simulateWorldSeason(world, rand);
    const winners = result.standings.filter((row) => row.wins > 0);
    const totalWins = result.standings.reduce((sum, row) => sum + row.wins, 0);

    expect(totalWins).toBe(24);
    expect(winners.length).toBeGreaterThanOrEqual(2);
    expect(result.championPoints).toBeGreaterThan(180);
    expect(result.championPoints).toBeLessThan(650);
  });

  it("never scores points outside the top ten", () => {
    const { world, rand } = freshWorld(5);
    seatPlayerForDebut(
      world,
      { name: "Test Driver", peak: attrsFromOverall(70), age: 21 },
      rand,
    );
    const result = simulateWorldSeason(world, rand);

    for (const race of result.playerRaces) {
      const racePart = race.points - race.sprintPoints;
      if (race.finish == null || race.finish > 10) expect(racePart).toBe(0);
      if (racePart > 0) expect(race.finish).toBeLessThanOrEqual(10);
    }
  });
});

describe("sprint weekends", () => {
  it("awards sprint points on sprint rounds only", () => {
    const { world, rand } = freshWorld(41);
    seatPlayerForDebut(
      world,
      { name: "Test Driver", peak: attrsFromOverall(90), age: 24 },
      rand,
    );
    const result = simulateWorldSeason(world, rand);

    for (const race of result.playerRaces) {
      expect(race.points).toBeGreaterThanOrEqual(race.sprintPoints);
      if (race.sprintPoints > 0) {
        expect(SPRINT_ROUNDS.has(race.round)).toBe(true);
        expect(race.sprintPoints).toBeLessThanOrEqual(8);
      }
    }
  });
});

describe("driver market", () => {
  it("values a proven winner above an identical driver without results", () => {
    const { world } = freshWorld(43);
    const plain = world.drivers[0]!;
    const winner = { ...plain, id: "winner", titles: 1, careerWins: 8 };
    expect(marketValue(winner)).toBeGreaterThan(marketValue(plain));
  });

  it("keeps winter churn within a believable range", () => {
    const { world, rand } = freshWorld(47);
    let changes = 0;
    const winters = 10;

    for (let i = 0; i < winters; i++) {
      const result = simulateWorldSeason(world, rand);
      const report = runOffseason(world, result, rand);
      changes += report.moves.length + report.promotions.length;
    }

    const perWinter = changes / winters;
    expect(perWinter).toBeGreaterThan(0);
    expect(perWinter).toBeLessThan(9);
  });
});

describe("off-season", () => {
  it("keeps every team on two drivers and every name unique", () => {
    const { world, rand } = freshWorld(13);
    for (let i = 0; i < 12; i++) {
      const result = simulateWorldSeason(world, rand);
      runOffseason(world, result, rand);
      expect(world.drivers).toHaveLength(22);
      expect(everyTeamHasTwoDrivers(world)).toBe(true);
      const names = world.drivers.map((d) => d.name);
      expect(new Set(names).size).toBe(names.length);
    }
  });

  it("retires drivers as they get old", () => {
    const { world, rand } = freshWorld(17);
    const veterans = ["Fernando Alonso", "Lewis Hamilton", "Nico Hülkenberg"];
    expect(world.drivers.some((d) => veterans.includes(d.name))).toBe(true);

    const retired: string[] = [];
    for (let i = 0; i < 8; i++) {
      const result = simulateWorldSeason(world, rand);
      const report = runOffseason(world, result, rand);
      retired.push(...report.retirements.map((r) => r.name));
    }

    expect(retired.length).toBeGreaterThan(0);
    for (const name of veterans) {
      expect(world.drivers.some((d) => d.name === name)).toBe(false);
    }
    expect(Math.max(...world.drivers.map((d) => d.age))).toBeLessThanOrEqual(45);
  });

  it("promotes juniors into the seats that open up", () => {
    const { world, rand } = freshWorld(23);
    let promotions = 0;
    for (let i = 0; i < 10; i++) {
      const result = simulateWorldSeason(world, rand);
      promotions += runOffseason(world, result, rand).promotions.length;
    }
    expect(promotions).toBeGreaterThan(0);
  });

  it("ages every driver by exactly one year", () => {
    const { world, rand } = freshWorld(29);
    const before = new Map(world.drivers.map((d) => [d.id, d.age]));
    const result = simulateWorldSeason(world, rand);
    runOffseason(world, result, rand);

    for (const d of world.drivers) {
      const previous = before.get(d.id);
      if (previous != null) expect(d.age).toBe(previous + 1);
    }
  });
});

describe("careers", () => {
  const career = simulateCareer(lockedFromAttrs(attrsFromOverall(88)), 4242, "Test Driver");

  it("runs consecutive seasons from 2026 with the driver ageing", () => {
    expect(career.seasons.length).toBeGreaterThan(2);
    expect(career.seasons[0]!.year).toBe(2026);
    career.seasons.forEach((season, i) => {
      if (i > 0) {
        expect(season.year).toBeGreaterThan(career.seasons[i - 1]!.year);
      }
      expect(season.age).toBe(career.debutAge + (season.year - 2026));
    });
    expect(career.finalAge).toBeGreaterThanOrEqual(career.debutAge);
  });

  it("records every driver displaced by a player seat change", () => {
    expect(career.seasons[0]!.replacedDriver).not.toBeNull();
    for (const season of career.seasons.slice(1)) {
      if (!season.replacedDriver) continue;
      expect(season.seatNote).toMatch(/chose|number two|sitting out/i);
    }
  });

  it("lists the player exactly once in every championship table", () => {
    for (const season of career.seasons) {
      expect(season.standings.filter((row) => row.isPlayer)).toHaveLength(1);
      expect(season.standings.find((row) => row.isPlayer)!.position).toBe(season.position);
      expect(season.constructors.filter((row) => row.isPlayerTeam)).toHaveLength(1);
    }
  });

  it("keeps season totals consistent with the race log", () => {
    for (const season of career.seasons) {
      const points = season.races.reduce((sum, race) => sum + race.points, 0);
      const wins = season.races.filter((race) => race.win).length;
      expect(points).toBe(season.points);
      expect(wins).toBe(season.wins);
    }
  });

  it("ends the career for a reason", () => {
    expect(["retired", "lostSeat"]).toContain(career.endReason);
  });
});

describe("machinery matters", () => {
  it("scores far more in a front-running car than a backmarker", () => {
    const rand = mulberry32(99);
    const attrs = attrsFromOverall(88);
    let front = 0;
    let back = 0;
    const runs = 12;

    for (let i = 0; i < runs; i++) {
      front += simulateProbeSeason(attrs, { rand, teamRank: 0 }).points;
      back += simulateProbeSeason(attrs, { rand, teamRank: 10 }).points;
    }

    expect(front / runs).toBeGreaterThan(back / runs * 3);
  });

  it("rewards a better driver in the same car", () => {
    const rand = mulberry32(1234);
    let strong = 0;
    let weak = 0;
    const runs = 12;

    for (let i = 0; i < runs; i++) {
      strong += simulateProbeSeason(attrsFromOverall(93), { rand, teamRank: 4 }).points;
      weak += simulateProbeSeason(attrsFromOverall(66), { rand, teamRank: 4 }).points;
    }

    expect(strong / runs).toBeGreaterThan(weak / runs);
  });
});
