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
  /** True while the player is contracted as the clear number two. */
  supportRole?: boolean;
  offseason: OffseasonNote | null;
  /** Season objective generated before the year ran. */
  goal: SeasonGoal | null;
  /** Head-to-head with the career rival this year, if any. */
  rival: RivalSeasonNote | null;
  /** Narrative chapter this season belongs to. */
  chapter: CareerChapterId;
}

export type CareerEndReason = "retired" | "lostSeat";

/** Thin counterfactual seasons after a voluntary retirement. */
export interface CareerGhostSeason {
  year: number;
  team: string;
  position: number;
  wins: number;
  points: number;
  champion: boolean;
}

/** "What if you'd stayed" projection stored when the player walks away. */
export interface CareerGhostArc {
  seasons: CareerGhostSeason[];
  projectedTitles: number;
  projectedWins: number;
  projectedFinalAge: number;
  headline: string;
}

/** Mid-career path scars that should survive into the museum and share card. */
export interface CareerPathMarks {
  hadSabbatical: boolean;
  /** Teams where the player signed as the clear number two. */
  number2Teams: string[];
  /** Player chose Retire at a contract checkpoint. */
  walkedAway: boolean;
  /** Calendar year the player sat out, if any. */
  sabbaticalYear?: number;
  /** Who won the title during the sit-out year. */
  sabbaticalChampion?: string;
  /** Who filled the garage the player left empty. */
  sabbaticalSeatTaker?: string;
  /** Counterfactual arc when walkedAway. */
  ghost?: CareerGhostArc | null;
  /** Winter crisis scars that shaped the career. */
  dramaBeats?: string[];
}

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
  | "beatRival"
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

/** Shape of a rivalry season — garage war, title scrap, or midfield scrap. */
export type RivalHeat = "garage" | "title" | "wheel" | "distant";

export interface RivalSeasonNote {
  name: string;
  team: string;
  theirPosition: number;
  yourPosition: number;
  beatThem: boolean;
  sameTeam: boolean;
  /** Your points minus theirs. */
  pointsDelta: number;
  /** Your wins minus theirs. */
  winsDelta: number;
  /** Both finished inside the top three. */
  titleFight: boolean;
  heat: RivalHeat;
}

export interface RivalCareer {
  name: string;
  meetings: number;
  wins: number;
  losses: number;
  /** Player WDCs while this rival was the marked foe. */
  titlesWhileActive: number;
  /** Rival WDCs across the same meeting seasons. */
  theirTitles: number;
  teams: string[];
  yearFrom: number;
  yearTo: number;
  teammateSeasons: number;
  titleFights: number;
  heat: RivalHeat;
  blurb: string;
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
  /** Headline rivalry (most meetings). */
  rival: RivalCareer | null;
  /** All meaningful rivalries, strongest first. */
  rivals: RivalCareer[];
  chapters: CareerChapter[];
  /** Retire / sabbatical / #2 choices that shape the career story. */
  pathMarks: CareerPathMarks;
}

export interface LockedAttribute {
  key: AttributeKey;
  value: number;
  from: DriverSeason;
}
