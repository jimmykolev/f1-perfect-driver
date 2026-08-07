import type { ReactNode } from "react";
import { polishDisplayText } from "@/lib/displayText";

/** Shared career-display tokens: years, team moves, compact stats. */

export function yearTick(year: number): string {
  return `'${String(year).slice(2)}`;
}

export function yearRange(from: number, to?: number | null): string {
  if (to == null || to === from) return String(from);
  return `${from}–${to}`;
}

export function YearLabel({
  year,
  yearTo,
  className = "",
}: {
  year?: number | null;
  yearTo?: number | null;
  className?: string;
}) {
  if (year == null) return <span className={className}>—</span>;
  return <span className={className}>{yearRange(year, yearTo)}</span>;
}

export function TeamMove({
  from,
  to,
  showTag = true,
  className = "",
}: {
  from: string;
  to: string;
  showTag?: boolean;
  className?: string;
}) {
  return (
    <span className={`team-move ${className}`.trim()}>
      <span className="team-move__from">{from}</span>
      <span className="team-move__arrow" aria-hidden>
        →
      </span>
      <strong className="team-move__to">{to}</strong>
      {showTag ? <em className="tag tag--move">Moved</em> : null}
    </span>
  );
}

export function StatChip({ children }: { children: ReactNode }) {
  return <li className="stat-chip">{children}</li>;
}

export function StatChips({ items }: { items: string[] }) {
  if (!items.length) return null;
  return (
    <ul className="stat-chips">
      {items.map((item) => (
        <StatChip key={item}>{polishDisplayText(item)}</StatChip>
      ))}
    </ul>
  );
}

export function StatGrid({
  cells,
  className = "",
  accent,
}: {
  cells: { label: string; value: string }[];
  className?: string;
  /** Highlights a cell whose label matches (e.g. Finish on a title year). */
  accent?: string;
}) {
  return (
    <dl className={`stat-grid ${className}`.trim()}>
      {cells.map((cell) => (
        <div
          key={cell.label}
          className={accent && cell.label === accent ? "is-accent" : undefined}
        >
          <dt>{cell.label}</dt>
          <dd>{cell.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Relative competitiveness of a seat offer vs the current drive. */
export function offerRelative(
  offerRank: number,
  currentRank: number,
  kind: "stay" | "reach" | "fit" | "safe" | "number2" | "retire" | "sabbatical",
): {
  label: string;
  tone: "stay" | "upgrade" | "sideways" | "safer" | "role" | "exit";
} {
  if (kind === "stay") return { label: "Stay", tone: "stay" };
  if (kind === "number2") return { label: "#2 role", tone: "role" };
  if (kind === "sabbatical") return { label: "Year off", tone: "exit" };
  if (kind === "retire") return { label: "Walk away", tone: "exit" };
  if (offerRank < currentRank) return { label: "Upgrade", tone: "upgrade" };
  if (offerRank > currentRank) return { label: "Safer", tone: "safer" };
  return { label: "Sideways", tone: "sideways" };
}
