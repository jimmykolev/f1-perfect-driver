import { useMemo, useState } from "react";
import { BrandMark } from "@/components/BrandMark";
import {
  AVAILABLE_START_YEARS,
  eraFlavorForYear,
  isRegulationReset,
  LATEST_START_YEAR,
  rulesForYear,
} from "@/lib/f1Meta";
import { useTeamStore } from "@/store/teamStore";

function decadeOf(year: number) {
  return Math.floor(year / 10) * 10;
}

const DECADE_GRID_COLS = 5;

function arrangeDecadeYearRows(
  years: number[],
  cols = DECADE_GRID_COLS,
): number[][] {
  const sorted = [...years].sort((a, b) => a - b);
  const rows: number[][] = [];
  for (let i = 0; i < sorted.length; i += cols) {
    rows.push(sorted.slice(i, i + cols));
  }
  return rows.length > 1 ? rows.reverse() : rows;
}

export function TeamYearSelect() {
  const teamName = useTeamStore((s) => s.teamName);
  const confirmSeasonYear = useTeamStore((s) => s.confirmSeasonYear);
  const backToSheet = useTeamStore((s) => s.backToSheet);
  const reset = useTeamStore((s) => s.reset);

  const classicYears = AVAILABLE_START_YEARS.filter((y) => y < LATEST_START_YEAR);
  const decades = useMemo(() => {
    const map = new Map<number, number[]>();
    for (const year of classicYears) {
      const decade = decadeOf(year);
      const list = map.get(decade) ?? [];
      list.push(year);
      map.set(decade, list);
    }
    return [...map.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(
        ([decade, years]) =>
          [decade, arrangeDecadeYearRows(years)] as const,
      );
  }, [classicYears]);

  const [pickingClassic, setPickingClassic] = useState(false);
  const [selectedYear, setSelectedYear] = useState(
    classicYears[classicYears.length - 1] ?? 2014,
  );

  const preview = rulesForYear(selectedYear);
  const modern = rulesForYear(LATEST_START_YEAR);
  const classicFlavor = eraFlavorForYear(selectedYear);
  const modernFlavor = eraFlavorForYear(LATEST_START_YEAR);

  return (
    <section className="era-select team-draft">
      <header className="era-select__hero">
        <div className="team-draft__identity" style={{ marginBottom: "0.75rem" }}>
          <BrandMark size="chrome" />
        </div>
        <p className="eyebrow">Perfect Team · Chase season</p>
        <h1 className="era-select__name">{teamName || "Your team"}</h1>
        <p className="era-select__lede">
          Pick a year. Race that calendar race by race. Win only if your team
          takes every grand prix.
        </p>
      </header>

      <div className="era-options">
        <button
          type="button"
          className="era-option era-option--modern"
          onClick={() => confirmSeasonYear(LATEST_START_YEAR)}
        >
          <span className="era-option__kind">{modernFlavor.label}</span>
          <strong>{LATEST_START_YEAR}</strong>
          <p>
            {modern.calendar.length} grands prix
            {modern.sprintRounds.size
              ? ` · ${modern.sprintRounds.size} sprints`
              : ""}{" "}
            · {modernFlavor.blurb}.
          </p>
        </button>

        <button
          type="button"
          className={`era-option era-option--classic ${
            pickingClassic ? "is-selected" : ""
          }`}
          onClick={() => setPickingClassic(true)}
          aria-pressed={pickingClassic}
        >
          <span className="era-option__kind">Classic season</span>
          <strong>Pick a year</strong>
          <p>
            Drop into any historical grid — same drivers, teams, and calendar
            as that championship year.
          </p>
        </button>
      </div>

      {pickingClassic ? (
        <div className="era-picker">
          <div className="era-picker__preview">
            <p className="eyebrow">{classicFlavor.label}</p>
            <h2>{selectedYear}</h2>
            <p className="era-picker__flavor">{classicFlavor.blurb}</p>
            <p>
              {preview.calendar.length} races
              {preview.sprintRounds.size
                ? ` · ${preview.sprintRounds.size} sprint weekends`
                : ""}
              {isRegulationReset(selectedYear) ? " · regulation reset year" : ""}
              {" · "}
              {preview.calendar.slice(0, 3).join(", ")}
              {preview.calendar.length > 3 ? "…" : ""}
            </p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => confirmSeasonYear(selectedYear)}
            >
              Chase {selectedYear}
            </button>
          </div>

          <div className="era-picker__years">
            {decades.map(([decade, rows]) => (
              <div key={decade} className="era-decade">
                <p className="era-decade__label">{decade}s</p>
                <div className="era-decade__grid">
                  {rows.map((row) => (
                    <div
                      key={`${decade}-${row[0]}-${row[row.length - 1]}`}
                      className="era-decade__row"
                    >
                      {row.map((year) => (
                        <button
                          key={year}
                          type="button"
                          className={selectedYear === year ? "is-selected" : ""}
                          onClick={() => setSelectedYear(year)}
                        >
                          {year}
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="era-select__actions">
        <button type="button" className="btn btn-ghost" onClick={backToSheet}>
          Back to roster
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => {
            if (!window.confirm("Leave Perfect Team and scrap this build?")) {
              return;
            }
            reset();
          }}
        >
          Exit
        </button>
      </div>
    </section>
  );
}
