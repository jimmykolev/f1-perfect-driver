import { describe, expect, it } from "vitest";
import { createWorld, simulateWorldSeason, teamByName } from "./fieldSim";
import { mulberry32 } from "./ratings";

describe("season politics", () => {
  it("tilts a support-role season toward the teammate", () => {
    const seeds = [11, 22, 33, 44, 55, 66, 77, 88];
    let favorTeammate = 0;
    let favorPlayer = 0;

    for (const seed of seeds) {
      const world = createWorld(mulberry32(seed), 2024);
      const top = [...world.teams].sort((a, b) => a.rank - b.rank)[0]!;
      const garage = world.drivers.filter((d) => d.team === top.name);
      const player = garage[0]!;
      const teammate = garage[1]!;
      player.isPlayer = true;
      player.id = "player";

      // Equalize ability so orders decide the hierarchy.
      teammate.attributes = { ...player.attributes };
      teammate.overall = player.overall;
      teammate.reputation = player.reputation;
      expect(teamByName(world, player.team).rank).toBe(0);

      const withOrders = simulateWorldSeason(world, mulberry32(seed + 1), {
        supportRolePlayerId: player.id,
      });
      const playerPts = withOrders.totals.get(player.id)!.points;
      const matePts = withOrders.totals.get(teammate.id)!.points;
      if (matePts >= playerPts) favorTeammate++;
      else favorPlayer++;
    }

    expect(favorTeammate).toBeGreaterThan(favorPlayer);
  });
});
