import {
  ATTRIBUTE_KEYS,
  ATTRIBUTE_META,
  type AttributeKey,
  type ExpertPickGrade,
  type ExpertScorecard,
  type LockedAttribute,
} from "@/types";

function gradeForRank(rank: number): ExpertPickGrade["grade"] {
  if (rank === 1) return "steal";
  if (rank <= 3) return "solid";
  return "miss";
}

function gradeLabel(grade: ExpertPickGrade["grade"]): string {
  if (grade === "steal") return "Best on the card";
  if (grade === "solid") return "Strong call";
  return "Left better on the table";
}

/** Grade each locked pick against the other attributes on that same season card. */
export function buildExpertScorecard(locked: LockedAttribute[]): ExpertScorecard {
  const picks: ExpertPickGrade[] = locked.map((item) => {
    const values = ATTRIBUTE_KEYS.map((key) => ({
      key,
      value: item.from.attributes[key],
    })).sort((a, b) => b.value - a.value);
    const seasonRank = values.findIndex((row) => row.key === item.key) + 1;
    const seasonBest = values[0]?.value ?? item.value;
    const grade = gradeForRank(seasonRank);
    return {
      key: item.key,
      value: item.value,
      seasonBest,
      seasonRank,
      seasonCount: ATTRIBUTE_KEYS.length,
      grade,
      label: gradeLabel(grade),
    };
  });

  const steals = picks.filter((p) => p.grade === "steal").length;
  const misses = picks.filter((p) => p.grade === "miss").length;
  const averageRank =
    picks.reduce((sum, p) => sum + p.seasonRank, 0) / Math.max(picks.length, 1);

  let headline = "A measured draft.";
  if (steals >= 4) headline = "Expert eyes — you kept stripping the best lines.";
  else if (steals >= 2 && misses <= 1) headline = "Sharp drafting. You knew where the value was.";
  else if (misses >= 4) headline = "Brave, messy, human — plenty left on the table.";
  else if (averageRank <= 2.5) headline = "Consistently took the strong option.";

  return { picks, steals, misses, averageRank, headline };
}

export function pickGradeLabel(key: AttributeKey): string {
  return ATTRIBUTE_META[key].label;
}
