import { describe, expect, it } from "vitest";
import {
  buildCareerLeaderboard,
  selectLeaderboardRows,
  type CareerLeaderboardRow,
} from "./careerLeaderboard";
import { buildRivalCareers } from "./drama";
import { attrsFromOverall, lockedFromAttrs, simulateCareer } from "./game";
import type { CareerResult, SeasonResult, StandingEntry } from "@/types";

function standing(
  name: string,
  position: number,
  overrides: Partial<StandingEntry> = {},
): StandingEntry {
  return {
    position,
    name,
    team: overrides.team ?? "Team",
    age: overrides.age ?? 25,
    points: overrides.points ?? position === 1 ? 400 : 100 - position * 5,
    wins: overrides.wins ?? (position === 1 ? 10 : 0),
    podiums: overrides.podiums ?? (position <= 3 ? 15 - position * 3 : 0),
    poles: overrides.poles ?? 0,
    isPlayer: overrides.isPlayer ?? false,
  };
}

function seasonWithStandings(
  year: number,
  rows: StandingEntry[],
  playerName: string,
): SeasonResult {
  const player = rows.find((r) => r.isPlayer)!;
  return {
    year,
    age: 20 + year - 2020,
    team: player.team,
    teamTier: 1,
    position: player.position,
    points: player.points,
    wins: player.wins,
    podiums: player.podiums,
    poles: player.poles,
    dnfs: 0,
    champion: player.position === 1,
    races: [],
    standings: rows,
    constructors: [],
    championName: rows.find((r) => r.position === 1)!.name,
    championPoints: rows.find((r) => r.position === 1)!.points,
    seatNote: "",
    replacedDriver: null,
    offseason: null,
    goal: null,
    rival: null,
    chapter: "debut",
  };
}

describe("career leaderboard", () => {
  it("ranks drivers by titles, then wins, then points", () => {
    const playerName = "You";
    const seasons = [
      seasonWithStandings(2020, [
        standing("Alpha", 1, { wins: 11, points: 420 }),
        standing(playerName, 2, { isPlayer: true, wins: 8, points: 380 }),
      ], playerName),
      seasonWithStandings(2021, [
        standing(playerName, 1, { isPlayer: true, wins: 9, points: 390 }),
        standing("Alpha", 2, { wins: 7, points: 350 }),
      ], playerName),
      seasonWithStandings(2022, [
        standing("Beta", 1, { wins: 10, points: 410 }),
        standing(playerName, 3, { isPlayer: true, wins: 2, points: 220 }),
      ], playerName),
    ];

    const career = {
      ...simulateCareer(lockedFromAttrs(attrsFromOverall(85)), {
        seed: 1,
        playerName,
        debutTeam: "Williams",
        startYear: 2020,
      }),
      seasons,
      titles: 1,
      wins: 19,
      podiums: 30,
      points: 990,
    };

    const board = buildCareerLeaderboard(career, playerName);

    expect(board.fromStandings).toBe(true);
    expect(board.totalDrivers).toBe(3);
    expect(board.playerRank).toBe(1);
    expect(board.rows[0]).toEqual(
      expect.objectContaining({ name: playerName, titles: 1, isPlayer: true }),
    );
    expect(board.rows.map((r) => r.name)).toEqual([playerName, "Alpha", "Beta"]);
    expect(board.rows[1]).toEqual(
      expect.objectContaining({ name: "Alpha", titles: 1, wins: 18 }),
    );
    expect(board.rows[2]).toEqual(
      expect.objectContaining({ name: "Beta", titles: 1 }),
    );
  });

  it("breaks ties on wins then points", () => {
    const playerName = "You";
    const seasons = [
      seasonWithStandings(2020, [
        standing("Champ A", 1, { wins: 12, points: 430 }),
        standing(playerName, 5, { isPlayer: true, wins: 0, points: 80 }),
      ], playerName),
      seasonWithStandings(2021, [
        standing("Champ B", 1, { wins: 8, points: 390 }),
        standing(playerName, 8, { isPlayer: true, wins: 0, points: 40 }),
      ], playerName),
    ];

    const career = {
      seasons,
      titles: 0,
      wins: 0,
      podiums: 0,
      points: 120,
      rivals: [],
    } as CareerResult;

    const board = buildCareerLeaderboard(career, playerName);
    const ranked = board.rows.filter((r) => r.titles === 1);

    expect(ranked.map((r) => r.name)).toEqual(["Champ A", "Champ B"]);
    expect(ranked[0]!.wins).toBeGreaterThan(ranked[1]!.wins);
  });

  it("includes the player outside the top cut", () => {
    const rows: CareerLeaderboardRow[] = Array.from({ length: 24 }, (_, i) => ({
      rank: i + 1,
      name: `Driver ${i + 1}`,
      isPlayer: false,
      titles: 24 - i,
      wins: 0,
      podiums: 0,
      points: 0,
      seasons: 1,
      lastTeam: "Team",
    }));
    rows.push({
      rank: 25,
      name: "You",
      isPlayer: true,
      titles: 0,
      wins: 1,
      podiums: 2,
      points: 50,
      seasons: 5,
      lastTeam: "Backmarker",
    });

    const { rows: visible, playerPinned } = selectLeaderboardRows(rows);
    expect(visible).toHaveLength(16);
    expect(playerPinned).toBe(true);
    expect(visible[visible.length - 1]).toEqual(
      expect.objectContaining({ name: "You", isPlayer: true }),
    );
  });

  it("shows the full grid when the driver pool is small", () => {
    const career = simulateCareer(lockedFromAttrs(attrsFromOverall(88)), {
      seed: 42,
      playerName: "Grid Driver",
      debutTeam: "McLaren",
      startYear: 2022,
    });

    const board = buildCareerLeaderboard(career, "Grid Driver");
    expect(board.fromStandings).toBe(true);
    expect(board.totalDrivers).toBeGreaterThan(0);
    expect(board.playerRank).not.toBeNull();
    expect(board.rows.some((r) => r.isPlayer)).toBe(true);
    if (board.totalDrivers <= 22) {
      expect(board.rows.length).toBe(board.totalDrivers);
    } else {
      expect(board.rows.length).toBeLessThanOrEqual(16);
      expect(board.rows.some((r) => r.isPlayer)).toBe(true);
    }
  });

  it("falls back for saves without standings", () => {
    const playerName = "Legacy Driver";
    const base = simulateCareer(lockedFromAttrs(attrsFromOverall(90)), {
      seed: 9,
      playerName,
      debutTeam: "Ferrari",
      startYear: 2018,
    });
    const seasons = base.seasons.map((s) => ({ ...s, standings: [] }));
    const rivals = buildRivalCareers(base.seasons);
    const career = {
      ...base,
      seasons,
      rivals,
      rival: rivals[0] ?? null,
    };

    const board = buildCareerLeaderboard(career, playerName);
    expect(board.fromStandings).toBe(false);
    expect(board.rows.some((r) => r.isPlayer)).toBe(true);
    expect(board.totalDrivers).toBeGreaterThanOrEqual(1);
  });
});
