import { ATTRIBUTE_KEYS, ATTRIBUTE_META, type AttributeKey } from "@/types";
import { OVERALL_WEIGHTS } from "@/lib/ratings";

const ATTRIBUTE_HOW: Record<AttributeKey, string> = {
  qualifying:
    "Mostly poles per race, with a nudge from championship position and Sharp rating.",
  racePace:
    "Fastest-lap share plus points haul and Sharp rating versus that year’s field.",
  raceCraft:
    "Win rate, pole-to-win conversion, podium rate, and finishing position.",
  frontRunning: "Podium rate and championship points share.",
  scoring: "Season points relative to the highest scorer that year.",
  mentality:
    "DriverDB Sharp rating — peak competitive edge — plus position blend.",
  reliability:
    "Races started versus the field max, plus how steady their Sharp rating stayed.",
  momentum:
    "Season Sharp rating change (rising or fading), blended with absolute Sharp.",
};

const ATTRIBUTE_SIGNALS: Record<AttributeKey, string[]> = {
  qualifying: ["Poles / race", "Championship position", "Sharp rating"],
  racePace: ["Fastest laps / race", "Points share", "Sharp rating"],
  raceCraft: ["Wins / race", "Pole → win", "Podiums / race", "Position"],
  frontRunning: ["Podiums / race", "Points share"],
  scoring: ["Season points vs leader"],
  mentality: ["Sharp rating", "Championship position"],
  reliability: ["Races started", "Sharp stability"],
  momentum: ["Sharp change", "Sharp rating"],
};

export interface AttributeGuide {
  key: AttributeKey;
  label: string;
  short: string;
  blurb: string;
  how: string;
  signals: string[];
  weightPct: number;
}

export const ATTRIBUTE_GUIDES: AttributeGuide[] = ATTRIBUTE_KEYS.map((key) => ({
  key,
  label: ATTRIBUTE_META[key].label,
  short: ATTRIBUTE_META[key].short,
  blurb: ATTRIBUTE_META[key].blurb,
  weightPct: Math.round(OVERALL_WEIGHTS[key] * 100),
  how: ATTRIBUTE_HOW[key],
  signals: ATTRIBUTE_SIGNALS[key],
}));

export const RATINGS_GUIDE = {
  title: "How ratings work",
  steps: [
    {
      id: "scale" as const,
      label: "Scale",
      hint: "Where the numbers come from",
    },
    {
      id: "attrs" as const,
      label: "Attributes",
      hint: "What each rating measures",
    },
    {
      id: "ovr" as const,
      label: "Overall",
      hint: "Feel the weights yourself",
    },
  ],
  intro:
    "Every attribute comes from a real F1 driver-season on DriverDB, ranked against that year’s field, then curved onto 55–99.",
  bands: [
    {
      label: "90+",
      meaning: "Elite",
      range: [90, 99] as const,
      example: "Title-winning pace",
    },
    {
      label: "80–89",
      meaning: "Great",
      range: [80, 89] as const,
      example: "Regular podium threat",
    },
    {
      label: "70–79",
      meaning: "Good",
      range: [70, 79] as const,
      example: "Solid midfield",
    },
    {
      label: "55–69",
      meaning: "Lower",
      range: [55, 69] as const,
      example: "Backmarkers / rookies",
    },
  ],
  presets: [
    {
      id: "midfield",
      label: "Midfield",
      values: {
        qualifying: 72,
        racePace: 71,
        raceCraft: 70,
        frontRunning: 69,
        scoring: 71,
        mentality: 70,
        reliability: 74,
        momentum: 68,
      } satisfies Record<AttributeKey, number>,
    },
    {
      id: "elite",
      label: "Elite",
      values: {
        qualifying: 94,
        racePace: 93,
        raceCraft: 95,
        frontRunning: 94,
        scoring: 92,
        mentality: 93,
        reliability: 88,
        momentum: 90,
      } satisfies Record<AttributeKey, number>,
    },
    {
      id: "saturday",
      label: "Saturday hero",
      values: {
        qualifying: 96,
        racePace: 82,
        raceCraft: 68,
        frontRunning: 70,
        scoring: 74,
        mentality: 80,
        reliability: 78,
        momentum: 72,
      } satisfies Record<AttributeKey, number>,
    },
  ],
};
