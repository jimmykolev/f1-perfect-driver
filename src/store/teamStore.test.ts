import { beforeEach, describe, expect, it } from "vitest";
import { buildConstructorSeasonPool } from "@/lib/teamCarPool";
import { buildPrincipalPool } from "@/lib/teamPrincipalPool";
import data from "@/data/driverSeasons.json";
import { isEligibleSeason } from "@/lib/era";
import type { DriverDataFile } from "@/types";
import {
  assignSeatForTest,
  lockCarAttrForTest,
  lockPrincipalForTest,
  useTeamStore,
} from "@/store/teamStore";

const eligible = (data as DriverDataFile).seasons.filter(isEligibleSeason);

describe("teamStore", () => {
  beforeEach(() => {
    useTeamStore.getState().reset();
  });

  it("starts in car draft and advances after four locks", () => {
    useTeamStore.getState().start();
    expect(useTeamStore.getState().phase).toBe("carDraft");

    const pool = buildConstructorSeasonPool();
    const keys = [
      "aerodynamics",
      "chassis",
      "powertrain",
      "durability",
    ] as const;
    keys.forEach((key, i) => {
      lockCarAttrForTest(useTeamStore, pool[i]!, key);
    });

    expect(useTeamStore.getState().carLocked).toHaveLength(4);
    expect(useTeamStore.getState().phase).toBe("seatDraft");
  });

  it("locks unique drivers into three seats then opens principal draft", () => {
    useTeamStore.setState({
      phase: "seatDraft",
      carLocked: [
        {
          key: "aerodynamics",
          value: 90,
          from: buildConstructorSeasonPool()[0]!,
        },
      ],
      seats: {},
      seatUsedDriverIds: [],
      principalPool: buildPrincipalPool(),
    });

    const a = eligible[0]!;
    const b = eligible.find((s) => s.driverId !== a.driverId)!;
    const c = eligible.find(
      (s) => s.driverId !== a.driverId && s.driverId !== b.driverId,
    )!;

    // Assign out of order — reserve first
    assignSeatForTest(useTeamStore, "reserve", a);
    expect(useTeamStore.getState().openSeats()).toEqual(["first", "second"]);
    assignSeatForTest(useTeamStore, "second", b);
    assignSeatForTest(useTeamStore, "first", c);

    expect(useTeamStore.getState().phase).toBe("principalDraft");
    expect(useTeamStore.getState().seatsComplete()).toBe(true);
  });

  it("locks a principal and reaches the team sheet", () => {
    const card = buildPrincipalPool()[0]!;
    useTeamStore.setState({
      phase: "principalDraft",
      seats: {
        first: eligible[0],
        second: eligible[1],
        reserve: eligible[2],
      },
      principalPool: buildPrincipalPool(),
    });

    lockPrincipalForTest(useTeamStore, card);
    expect(useTeamStore.getState().phase).toBe("sheet");
    expect(useTeamStore.getState().principal?.id).toBe(card.id);
  });
});
