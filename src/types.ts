export const ATTRIBUTE_KEYS = [
  "qualifying",
  "racePace",
  "raceCraft",
  "frontRunning",
  "scoring",
  "mentality",
  "reliability",
  "momentum",
] as const;

export type AttributeKey = (typeof ATTRIBUTE_KEYS)[number];

export type Attributes = Record<AttributeKey, number>;

export interface DriverSeason {
  year: number;
  id: string;
  driverId: number;
  name: string;
  slug: string;
  team: string;
  position: number;
  points: number;
  races: number;
  wins: number;
  poles: number;
  podiums: number;
  fastestLaps: number;
  dnfs: number;
  sharpRating: number;
  sharpChange: number;
  image: string | null;
  attributes: Attributes;
  overall: number;
}

export interface DriverDataFile {
  generatedAt: string;
  source: string;
  years: number[];
  count: number;
  attributeKeys: AttributeKey[];
  seasons: DriverSeason[];
}

export const ATTRIBUTE_META: Record<
  AttributeKey,
  { label: string; short: string; blurb: string }
> = {
  qualifying: {
    label: "Qualifying",
    short: "QUAL",
    blurb: "One-lap speed and pole threat from poles per race.",
  },
  racePace: {
    label: "Race Pace",
    short: "PACE",
    blurb: "Sunday speed from fastest-lap share.",
  },
  raceCraft: {
    label: "Race Craft",
    short: "CRAFT",
    blurb: "Turning opportunities into wins.",
  },
  frontRunning: {
    label: "Front Running",
    short: "FRONT",
    blurb: "Ability to live in the podium places.",
  },
  scoring: {
    label: "Scoring",
    short: "PTS",
    blurb: "Championship points haul versus the field.",
  },
  mentality: {
    label: "Mentality",
    short: "MIND",
    blurb: "DriverDB Sharp rating — peak competitive edge.",
  },
  reliability: {
    label: "Reliability",
    short: "RELI",
    blurb: "Season availability and Sharp-rating stability.",
  },
  momentum: {
    label: "Momentum",
    short: "FORM",
    blurb: "Season Sharp rating swing — rising or fading.",
  },
};

export type CareerTier =
  | "legend"
  | "champion"
  | "raceWinner"
  | "podiumThreat"
  | "pointsRegular"
  | "nobody";

export type DnfReason = "mechanical" | "collision";

export interface RaceResult {
  round: number;
  name: string;
  grid: number;
  finish: number | null;
  /** Race points plus any sprint points from the same weekend. */
  points: number;
  sprintPoints: number;
  pole: boolean;
  dnf: boolean;
  dnfReason: DnfReason | null;
  win: boolean;
  podium: boolean;
}

export interface StandingEntry {
  position: number;
  name: string;
  team: string;
  age: number;
  points: number;
  wins: number;
  podiums: number;
  poles: number;
  isPlayer: boolean;
}

export interface ConstructorEntry {
  position: number;
  team: string;
  points: number;
  wins: number;
  isPlayerTeam: boolean;
}

/** What happened to the grid over the winter that followed a season. */
export interface OffseasonNote {
  retirements: string[];
  promotions: string[];
  moves: string[];
  /** Drivers who lost a seat and start the year without one. */
  departures: string[];
}

export interface SeasonResult {
  year: number;
  age: number;
  team: string;
  teamTier: number;
  position: number;
  points: number;
  wins: number;
  podiums: number;
  poles: number;
  dnfs: number;
  champion: boolean;
  races: RaceResult[];
  /** Full WDC table from simulating every car on the grid. */
  standings: StandingEntry[];
  constructors: ConstructorEntry[];
  championName: string;
  championPoints: number;
  /** How the player got this seat, e.g. a debut or a winter move. */
  seatNote: string;
  /** Only set when the player actually pushed someone out of a seat. */
  replacedDriver: string | null;
  offseason: OffseasonNote | null;
  /** Season objective generated before the year ran. */
  goal: SeasonGoal | null;
  /** Head-to-head with the career rival this year, if any. */
  rival: RivalSeasonNote | null;
  /** Narrative chapter this season belongs to. */
  chapter: CareerChapterId;
}

export type CareerEndReason = "retired" | "lostSeat";

export type CareerChapterId = "debut" | "breakthrough" | "peak" | "twilight";

export interface CareerChapter {
  id: CareerChapterId;
  label: string;
  blurb: string;
  yearFrom: number;
  yearTo: number;
}

export interface SignatureTrait {
  id: string;
  name: string;
  blurb: string;
  fromKey: AttributeKey;
}

export type SeasonGoalKind =
  | "beatTeammate"
  | "scorePoints"
  | "podium"
  | "win"
  | "topTen"
  | "survive";

export interface SeasonGoal {
  kind: SeasonGoalKind;
  label: string;
  detail: string;
  met: boolean;
}

export interface RivalSeasonNote {
  name: string;
  team: string;
  theirPosition: number;
  yourPosition: number;
  beatThem: boolean;
}

export interface RivalCareer {
  name: string;
  meetings: number;
  wins: number;
  losses: number;
  titlesWhileActive: number;
}

export interface SeatOffer {
  team: string;
  tier: number;
  rank: number;
  label: string;
  blurb: string;
  kind: "reach" | "fit" | "safe";
}

export interface ExpertPickGrade {
  key: AttributeKey;
  value: number;
  seasonBest: number;
  seasonRank: number;
  seasonCount: number;
  grade: "steal" | "solid" | "miss";
  label: string;
}

export interface ExpertScorecard {
  picks: ExpertPickGrade[];
  steals: number;
  misses: number;
  averageRank: number;
  headline: string;
}

export interface CareerResult {
  seasons: SeasonResult[];
  titles: number;
  wins: number;
  podiums: number;
  poles: number;
  points: number;
  bestFinish: number;
  overall: number;
  peakOverall: number;
  debutAge: number;
  finalAge: number;
  endReason: CareerEndReason;
  archetype: string;
  tier: CareerTier;
  tierLabel: string;
  summary: string;
  seed: number;
  traits: SignatureTrait[];
  rival: RivalCareer | null;
  chapters: CareerChapter[];
}

export interface LockedAttribute {
  key: AttributeKey;
  value: number;
  from: DriverSeason;
}
