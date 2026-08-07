/** Capitalize the first character; leave the rest unchanged. */
export function capitalizeFirst(text: string): string {
  if (!text) return text;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** `3 titles` → `3 Titles`, `2 title fights` → `2 Title Fights`. */
export function formatCount(n: number, noun: string, suffix = "s"): string {
  const word = noun
    .split(" ")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
  return `${n} ${word}${n === 1 ? "" : suffix}`;
}

const PHRASE_FIXES: [RegExp, string][] = [
  [/\bworld champion\b/g, "World Champion"],
  [/\bworld championship\b/g, "World Championship"],
  [/\bworld titles\b/g, "World Titles"],
  [/\bworld title\b/g, "World Title"],
  [/\bgrand prix\b/g, "Grand Prix"],
  [/\bformula 1\b/g, "Formula 1"],
  [/\bhead-to-head\b/g, "Head-to-Head"],
  [/\bthe paddock\b/g, "The Paddock"],
];

/** Normalize common F1 phrases and labels for on-screen copy. */
export function polishDisplayText(text: string): string {
  let out = text.trim();
  if (!out) return out;

  for (const [pattern, replacement] of PHRASE_FIXES) {
    out = out.replace(pattern, replacement);
  }

  return out;
}
