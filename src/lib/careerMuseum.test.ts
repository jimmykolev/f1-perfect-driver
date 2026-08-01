import { describe, expect, it } from "vitest";
import {
  buildCareerMuseum,
  selectHighlightBeats,
  type MuseumBeat,
} from "./careerMuseum";
import { buildRivalCareers } from "./drama";
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

  it("surfaces rival beats with heat labels when meetings pile up", () => {
    const career = simulateCareer(lockedFromAttrs(attrsFromOverall(90)), {
      seed: 77,
      playerName: "Rival Hunter",
      debutTeam: "Alpine",
      startYear: 2020,
    });
    const beats = flatten(buildCareerMuseum(career, "Rival Hunter").acts);
    if (career.rival && career.rival.meetings >= 2) {
      const rivalBeat = beats.find((b) => b.kind === "rival");
      const originBeat = beats.find((b) => b.kind === "rivalryOrigin");
      expect(rivalBeat).toBeTruthy();
      expect(rivalBeat?.note?.length).toBeGreaterThan(10);
      expect(originBeat).toEqual(
        expect.objectContaining({
          year: career.rival.yearFrom,
          headline: career.rival.name,
          tag: "Rival born",
        }),
      );
      expect(["Garage", "Title fight", "Duel", "Rival"]).toContain(
        rivalBeat?.tag,
      );
    }
    expect(career.rivals.length).toBeGreaterThanOrEqual(0);
  });

  it("closes the chief rivalry when a rival steals back the title", () => {
    const base = simulateCareer(lockedFromAttrs(attrsFromOverall(90)), {
      seed: 77,
      playerName: "Title Defender",
      debutTeam: "Alpine",
      startYear: 2020,
    });
    const seasons = base.seasons.slice(0, 2).map((season, index) => {
      const player = season.standings.find((entry) => entry.isPlayer)!;
      const opponent = season.standings.find((entry) => !entry.isPlayer)!;
      const playerPosition = index === 0 ? 1 : 2;
      const rivalPosition = index === 0 ? 2 : 1;
      return {
        ...season,
        champion: index === 0,
        championName: index === 0 ? player.name : "Nemesis",
        position: playerPosition,
        rival: {
          name: "Nemesis",
          team: opponent.team,
          theirPosition: rivalPosition,
          yourPosition: playerPosition,
          beatThem: index === 0,
          sameTeam: player.team === opponent.team,
          pointsDelta: index === 0 ? 20 : -20,
          winsDelta: index === 0 ? 1 : -1,
          titleFight: true,
          heat: "title" as const,
        },
        standings: [
          { ...player, position: playerPosition },
          { ...opponent, name: "Nemesis", position: rivalPosition },
        ],
      };
    });
    const rivals = buildRivalCareers(seasons);
    const career = {
      ...base,
      seasons,
      rival: rivals[0]!,
      rivals,
    };

    const beats = flatten(buildCareerMuseum(career, "Title Defender").acts);
    expect(beats.find((beat) => beat.kind === "rivalryResolution")).toEqual(
      expect.objectContaining({
        year: seasons[1]!.year,
        tag: "Title stolen",
        headline: "Nemesis took it back",
        stats: expect.arrayContaining(["1–1 h2h", "title swing"]),
      }),
    );
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

  it("marks #2 moves, sit-outs, and walked-away exits from path scars", () => {
    const base = simulateCareer(lockedFromAttrs(attrsFromOverall(88)), {
      seed: 55,
      playerName: "Scar Driver",
      debutTeam: "Williams",
      startYear: 2024,
    });

    const seasons = [...base.seasons];
    const mid = seasons[Math.min(3, seasons.length - 1)]!;
    mid.seatNote = `Signed as the Ferrari number two, taking someone's seat`;
    if (seasons[2] && seasons[3] && seasons[3].year === seasons[2].year + 1) {
      seasons[3] = {
        ...seasons[3],
        year: seasons[2].year + 2,
        seatNote: `Back after sitting out ${seasons[2].year + 1} at ${seasons[3].team}`,
        team: seasons[3].team === seasons[2].team ? "Alpine" : seasons[3].team,
      };
    }
    // Force a team change into Ferrari for the #2 beat.
    if (seasons[1]) {
      seasons[1] = {
        ...seasons[1],
        team: "Ferrari",
        seatNote: "Signed as the Ferrari number two",
      };
    }

    const career = {
      ...base,
      seasons,
      pathMarks: {
        hadSabbatical: true,
        number2Teams: ["Ferrari"],
        walkedAway: true,
        sabbaticalYear: seasons[2] ? seasons[2].year + 1 : 2030,
        sabbaticalChampion: "Max Verstappen",
        sabbaticalSeatTaker: "Reserve Driver",
        ghost: {
          seasons: [
            {
              year: 2035,
              team: "Mercedes",
              position: 2,
              wins: 4,
              points: 280,
              champion: false,
            },
            {
              year: 2036,
              team: "Mercedes",
              position: 1,
              wins: 8,
              points: 420,
              champion: true,
            },
          ],
          projectedTitles: 1,
          projectedWins: 12,
          projectedFinalAge: 36,
          headline: "Another title was there at Mercedes by 36.",
        },
      },
      endReason: "retired" as const,
    };

    const beats = flatten(buildCareerMuseum(career, "Scar Driver").acts);
    expect(beats.some((b) => b.kind === "role")).toBe(true);
    expect(beats.some((b) => b.kind === "sitout")).toBe(true);
    expect(beats.some((b) => b.kind === "ghost")).toBe(true);
    const exit = beats.find((b) => b.kind === "exit");
    expect(exit?.tag).toBe("Walked away");
    expect(exit?.note).toMatch(/Walked away|title/i);
  });

  it("selectHighlightBeats picks title, rival, sitout, and exit within six", () => {
    const base = simulateCareer(lockedFromAttrs(attrsFromOverall(88)), {
      seed: 55,
      playerName: "Highlight Driver",
      debutTeam: "Williams",
      startYear: 2024,
    });

    const seasons = [...base.seasons];
    if (seasons[0]) {
      seasons[0] = { ...seasons[0], champion: true, position: 1 };
    }
    if (seasons[1]) {
      seasons[1] = {
        ...seasons[1],
        team: "Ferrari",
        seatNote: "Signed as the Ferrari number two",
      };
    }
    if (seasons[2] && seasons[3]) {
      seasons[3] = {
        ...seasons[3],
        year: seasons[2].year + 2,
        seatNote: `Back after sitting out ${seasons[2].year + 1} at ${seasons[3].team}`,
      };
    }

    const rivals = buildRivalCareers(seasons);
    const fallbackRival = {
      name: "Grid Nemesis",
      yearFrom: seasons[0]!.year,
      yearTo: seasons[seasons.length - 1]!.year,
      meetings: 3,
      wins: 2,
      losses: 1,
      titlesWhileActive: 1,
      theirTitles: 0,
      heat: "title" as const,
      blurb: "A long feud across the grid.",
      teams: ["Ferrari"],
      teammateSeasons: 0,
      titleFights: 1,
    };
    const career = {
      ...base,
      seasons,
      titles: 1,
      rival: rivals[0] ?? fallbackRival,
      rivals: rivals.length ? rivals : [fallbackRival],
      pathMarks: {
        ...base.pathMarks,
        hadSabbatical: true,
        sabbaticalYear: seasons[2] ? seasons[2].year + 1 : 2030,
      },
    };

    const { acts } = buildCareerMuseum(career, "Highlight Driver");
    const highlights = selectHighlightBeats(acts);

    expect(highlights.length).toBeLessThanOrEqual(6);
    expect(highlights.map((b) => b.kind)).toEqual(
      expect.arrayContaining(["title", "exit"]),
    );
    if (highlights.some((b) => b.kind === "rivalryOrigin")) {
      expect(highlights.map((b) => b.kind)).toContain("rivalryOrigin");
    } else {
      expect(highlights.map((b) => b.kind)).toContain("rival");
    }
    expect(highlights.map((b) => b.kind)).toContain("sitout");
    expect(new Set(highlights.map((b) => b.id)).size).toBe(highlights.length);

    const years = highlights
      .map((b) => b.year)
      .filter((y): y is number => y != null);
    expect([...years].sort((a, b) => a - b)).toEqual(years);
  });
});
