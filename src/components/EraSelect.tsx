import { useMemo, useState } from "react";
import {
  AVAILABLE_START_YEARS,
  eraFlavorForYear,
  isRegulationReset,
  LATEST_START_YEAR,
  rulesForYear,
} from "@/lib/f1Meta";
import { useGameStore } from "@/store/gameStore";

function decadeOf(year: number) {
  return Math.floor(year / 10) * 10;
}

/** Match `.era-decade__row` column count — later years of a decade on the first row. */
const DECADE_GRID_COLS = 5;

/** Chunk ascending years into rows, then put the later chunk on top. */
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

export function EraSelect() {
  const driverName = useGameStore((s) => s.driverName);
  const traits = useGameStore((s) => s.traits);
  const confirmStartYear = useGameStore((s) => s.confirmStartYear);
  const reset = useGameStore((s) => s.reset);

  const classicYears = AVAILABLE_START_YEARS.filter((y) => y < LATEST_START_YEAR);
  const decades = useMemo(() => {
    const map = new Map<number, number[]>();
    for (const year of classicYears) {
      const decade = decadeOf(year);
      const list = map.get(decade) ?? [];
      list.push(year);
      map.set(decade, list);
    }
    // Newest decades first (1980s at the bottom). Within a decade, later years
    // sit on the first row (2025 alone above 2020–24; 2015–19 above 2010–14).
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
    <section className="era-select">
      <header className="era-select__hero">
        <p className="eyebrow">Career start</p>
        <h1 className="era-select__name">{driverName || "Your Driver"}</h1>
        <p className="era-select__lede">
          Debut on the current grid, or drop into any season from{" "}
          {AVAILABLE_START_YEARS[0]} onward — same drivers, teams and calendar
          as that year.
        </p>
        {traits.length ? (
          <ul className="trait-chips">
            {traits.map((trait) => (
              <li key={trait.id} title={trait.blurb}>
                {trait.name}
              </li>
            ))}
          </ul>
        ) : null}
      </header>

      <div className="era-options">
        <button
          type="button"
          className="era-option era-option--modern"
          onClick={() => confirmStartYear(LATEST_START_YEAR)}
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
            Each era races differently — attrition, calendars, and reset years
            change the feel of the grid you break into.
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
              onClick={() => confirmStartYear(selectedYear)}
            >
              Debut in {selectedYear}
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
        <button type="button" className="btn btn-ghost" onClick={reset}>
          New driver
        </button>
      </div>
    </section>
  );
}
