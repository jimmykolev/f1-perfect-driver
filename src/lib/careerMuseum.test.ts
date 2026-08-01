import { describe, expect, it } from "vitest";
import { buildCareerMuseum, type MuseumBeat } from "./careerMuseum";
import { attrsFromOverall, lockedFromAttrs, simulateCareer } from "./game";

const flatten = (acts: { beats: MuseumBeat[] }[]) =>
  acts.flatMap((act) => act.beats);

describe("career museum", () => {
  it("builds a debut-to-exit story grouped into acts", () => {
    const career = simulateCareer(lockedFromAttrs(attrsFromOverall(88)), {
      seed: 55,
      playerName: "Museum Driver",
      debutTeam: "Williams",
      startYear: 2024,
    });

    const { arc, acts, headline } = buildCareerMuseum(career, "Museum Driver");
    const beats = flatten(acts);

    expect(arc).toHaveLength(career.seasons.length);
    expect(headline).not.toHaveLength(0);
    expect(acts[acts.length - 1]?.id).toBe("legacy");
    expect(beats[0]?.kind).toBe("debut");
    expect(beats[beats.length - 1]?.kind).toBe("exit");
    expect(beats.every((beat) => beat.act.length > 0)).toBe(true);
  });

  it("keeps every act's beats in chronological order", () => {
    const career = simulateCareer(lockedFromAttrs(attrsFromOverall(92)), {
      seed: 7,
      playerName: "Order Driver",
      debutTeam: "McLaren",
      startYear: 2022,
    });

    for (const act of buildCareerMuseum(career, "Order Driver").acts) {
      const years = act.beats
        .map((beat) => beat.year)
        .filter((year): year is number => year != null);
      expect([...years].sort((a, b) => a - b)).toEqual(years);
    }
  });

  it("includes a fork beat for historical debut seasons", () => {
    const career = simulateCareer(lockedFromAttrs(attrsFromOverall(90)), {
      seed: 12,
      playerName: "Fork Driver",
      debutTeam: "Ferrari",
      startYear: 2018,
    });

    const beats = flatten(buildCareerMuseum(career, "Fork Driver").acts);
    expect(beats.some((b) => b.kind === "fork")).toBe(true);
  });
});
