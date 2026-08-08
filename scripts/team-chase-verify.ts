import { mulberry32 } from "../src/lib/ratings";
import { simulateTeamSeasonChase } from "../src/lib/teamSeason";
import type { DriverSeason } from "../src/types";

function fakeSeason(name: string, overall: number): DriverSeason {
  const attr = Math.min(99, Math.max(55, overall));
  return {
    year: 2024,
    id: name,
    driverId: 1,
    name,
    slug: name,
    team: "X",
    position: 1,
    points: 400,
    races: 24,
    wins: 12,
    poles: 10,
    podiums: 20,
    fastestLaps: 8,
    dnfs: 0,
    sharpRating: overall,
    sharpChange: 0,
    image: null,
    attributes: {
      qualifying: attr,
      racePace: attr,
      raceCraft: attr,
      frontRunning: attr,
      scoring: attr,
      mentality: attr,
      reliability: attr,
      momentum: attr,
    },
    overall,
  };
}

const year = Number(process.env.YEAR ?? 1993);
const seed = Number(process.env.SEED ?? 1993892920);

const result = simulateTeamSeasonChase({
  teamName: "God Mode",
  car: {
    aerodynamics: 99,
    chassis: 99,
    powertrain: 99,
    durability: 99,
  },
  first: fakeSeason("Ace One", 99),
  second: fakeSeason("Ace Two", 99),
  year,
  rand: mulberry32(seed >>> 0),
});

console.log({
  year: result.year,
  seed,
  perfect: result.perfect,
  wins: result.teamWins,
  cal: result.calendarLength,
  brokenAt: result.brokenAtRound,
});
for (const race of result.races) {
  console.log(
    `R${race.round} ${race.teamWon ? "W" : "L"} ${race.name} — ${race.winnerName} (${race.winnerTeam}) | ${race.first.name} ${race.first.dnf ? "DNF" : `P${race.first.finish}`} / ${race.second.name} ${race.second.dnf ? "DNF" : `P${race.second.finish}`}`,
  );
}
