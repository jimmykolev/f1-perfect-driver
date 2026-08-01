/**
 * Monte Carlo balance probe for the career simulation.
 * Run: npm run balance
 */
import {
  attrsFromOverall,
  computeOverall,
  lockedFromAttrs,
  mulberry32,
  simulateCareer,
  simulateProbeSeason,
  type Attributes,
} from "../src/lib/game";

const RUNS = Number(process.env.BALANCE_RUNS ?? 300);
const SEASON_RUNS = Number(process.env.SEASON_RUNS ?? 150);

type Build = { id: string; attrs: Attributes };

const BUILDS: Build[] = [
  { id: "elite-95", attrs: attrsFromOverall(95) },
  { id: "contender-85", attrs: attrsFromOverall(85) },
  { id: "midfield-75", attrs: attrsFromOverall(75) },
  { id: "lower-mid-65", attrs: attrsFromOverall(65) },
  {
    id: "quali-monster",
    attrs: attrsFromOverall(78, { qualifying: 18, racePace: -4, raceCraft: -6 }),
  },
  {
    id: "sunday-specialist",
    attrs: attrsFromOverall(78, {
      qualifying: -8,
      racePace: 10,
      raceCraft: 12,
      frontRunning: 6,
    }),
  },
];

function pct(n: number, total: number) {
  return `${((n / total) * 100).toFixed(1)}%`;
}

function avg(nums: number[]) {
  if (!nums.length) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function summarizeCareer(build: Build) {
  const tiers: Record<string, number> = {};
  const ends: Record<string, number> = {};
  const points: number[] = [];
  const wins: number[] = [];
  const poles: number[] = [];
  const titles: number[] = [];
  const seasons: number[] = [];
  const finalAges: number[] = [];
  const debutTiers: number[] = [];
  const bestFinishes: number[] = [];

  let incoherentSeasons = 0;
  let seasonsChecked = 0;

  for (let i = 0; i < RUNS; i++) {
    const career = simulateCareer(lockedFromAttrs(build.attrs), 1000 + i * 97);
    tiers[career.tier] = (tiers[career.tier] ?? 0) + 1;
    ends[career.endReason] = (ends[career.endReason] ?? 0) + 1;
    points.push(career.points);
    wins.push(career.wins);
    poles.push(career.poles);
    titles.push(career.titles);
    seasons.push(career.seasons.length);
    finalAges.push(career.finalAge);
    bestFinishes.push(career.bestFinish);
    if (career.seasons[0]) debutTiers.push(career.seasons[0].teamTier);

    for (const season of career.seasons) {
      seasonsChecked++;
      const logged = season.races.reduce((sum, race) => sum + race.points, 0);
      if (logged !== season.points) incoherentSeasons++;
      if (season.wins > 0 && season.podiums < season.wins) incoherentSeasons++;
    }
  }

  return {
    overall: computeOverall(build.attrs),
    tiers,
    ends,
    avgPoints: avg(points),
    avgWins: avg(wins),
    avgPoles: avg(poles),
    avgTitles: avg(titles),
    avgSeasons: avg(seasons),
    avgFinalAge: avg(finalAges),
    avgDebutTier: avg(debutTiers),
    avgBestFinish: avg(bestFinishes),
    incoherentSeasons,
    seasonsChecked,
  };
}

function summarizeSeasons(build: Build, teamRank: number) {
  const rand = mulberry32(7 + teamRank);
  const pts: number[] = [];
  const poles: number[] = [];
  const wins: number[] = [];
  const podiums: number[] = [];
  const positions: number[] = [];
  const dnfs: number[] = [];

  for (let i = 0; i < SEASON_RUNS; i++) {
    const season = simulateProbeSeason(build.attrs, { rand, teamRank, age: 27 });
    pts.push(season.points);
    poles.push(season.poles);
    wins.push(season.wins);
    podiums.push(season.podiums);
    positions.push(season.position);
    dnfs.push(season.dnfs);
  }

  return `car#${teamRank + 1} → ${avg(pts).toFixed(0)} pts · P${avg(positions).toFixed(1)} · ${avg(wins).toFixed(1)}W · ${avg(podiums).toFixed(1)} pod · ${avg(poles).toFixed(1)} pole · ${avg(dnfs).toFixed(1)} dnf`;
}

console.log(`\nPerfect Driver balance probe`);
console.log(`Career runs / build: ${RUNS} · season samples: ${SEASON_RUNS}\n`);

for (const build of BUILDS) {
  const career = summarizeCareer(build);

  console.log(`══ ${build.id} (OVR ${career.overall}) ══`);
  console.log(
    "  tiers:",
    Object.entries(career.tiers)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${k} ${pct(v, RUNS)}`)
      .join(" · "),
  );
  console.log(
    `  career avg → ${career.avgSeasons.toFixed(1)} seasons · pts ${career.avgPoints.toFixed(0)} · wins ${career.avgWins.toFixed(1)} · poles ${career.avgPoles.toFixed(1)} · titles ${career.avgTitles.toFixed(2)} · best P${career.avgBestFinish.toFixed(1)}`,
  );
  console.log(
    `  path → debut tier ${career.avgDebutTier.toFixed(1)} · retires at ${career.avgFinalAge.toFixed(1)} · ends ${Object.entries(
      career.ends,
    )
      .map(([k, v]) => `${k} ${pct(v, RUNS)}`)
      .join(" · ")}`,
  );
  console.log(
    `  anomalies → ${career.incoherentSeasons}/${career.seasonsChecked} seasons inconsistent`,
  );
  for (const rank of [0, 3, 6, 10]) {
    console.log(`  ${summarizeSeasons(build, rank)}`);
  }
  console.log("");
}

console.log("Done.");
