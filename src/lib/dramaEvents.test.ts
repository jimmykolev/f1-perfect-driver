import { describe, expect, it } from "vitest";
import {
  applyDramaToOffers,
  incomingRivalPressure,
  maybeWinterDrama,
} from "./dramaEvents";
import type { SeasonResult } from "@/types";
import { createWorld } from "./fieldSim";
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

describe("drama events", () => {
  it("fires a garage ultimatum after a teammate war", () => {
    const crisis = maybeWinterDrama(
      lastSeason({
        rival: {
          name: "Mate",
          team: "Ferrari",
          theirPosition: 1,
          yourPosition: 2,
          beatThem: false,
          sameTeam: true,
          pointsDelta: -40,
          winsDelta: -3,
          titleFight: true,
          heat: "garage",
        },
      }),
      6,
      () => 0.1,
    );
    expect(crisis?.kind).toBe("garageUltimatum");
  });

  it("adds a chase offer for rival poach dramas", () => {
    const world = createWorld(mulberry32(3), 2024);
    const offers = applyDramaToOffers(
      [
        {
          id: "stay",
          team: "Williams",
          tier: 4,
          rank: 8,
          label: "Stay",
          blurb: "Stay put",
          kind: "stay",
        },
      ],
      {
        kind: "rivalPoach",
        headline: "Chase them",
        detail: "Move in",
      },
      world,
      null,
      lastSeason({
        team: "Williams",
        rival: {
          name: "Foe",
          team: "Ferrari",
          theirPosition: 1,
          yourPosition: 8,
          beatThem: false,
          sameTeam: false,
          pointsDelta: -200,
          winsDelta: -10,
          titleFight: false,
          heat: "title",
        },
      }),
    );
    expect(offers.some((o) => o.label === "Chase")).toBe(true);
  });

  it("reads incoming garage pressure from a sticky teammate rival", () => {
    const world = createWorld(mulberry32(9), 2024);
    const playerTeam = world.teams[0]!.name;
    const mate = world.drivers.find((d) => d.team === playerTeam)!;
    const pressure = incomingRivalPressure(
      undefined,
      mate.name,
      playerTeam,
      world,
    );
    expect(pressure.heat).toBe("garage");
    expect(pressure.rivalDriver?.name).toBe(mate.name);
  });
});
