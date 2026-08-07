import { useEffect, useMemo, useState } from "react";
import { CareerHistory } from "@/components/CareerHistory";
import { RatingsGuideButton } from "@/components/RatingsGuide";
import { SoundToggle } from "@/components/SoundToggle";
import { isLegendSeason } from "@/lib/era";
import { generateDriverName } from "@/lib/names";
import {
  currentWeeklyGrid,
  datasetMeta,
  useGameStore,
} from "@/store/gameStore";

export function Landing() {
  const driverName = useGameStore((s) => s.driverName);
  const setName = useGameStore((s) => s.setName);
  const start = useGameStore((s) => s.start);
  const playgroundMode = useGameStore((s) => s.playgroundMode);
  const setPlaygroundMode = useGameStore((s) => s.setPlaygroundMode);
  const expertMode = useGameStore((s) => s.expertMode);
  const setExpertMode = useGameStore((s) => s.setExpertMode);
  const weeklyGridMode = useGameStore((s) => s.weeklyGridMode);
  const setWeeklyGridMode = useGameStore((s) => s.setWeeklyGridMode);
  const meta = datasetMeta();
  const [ready, setReady] = useState(false);
  const grid = useMemo(() => currentWeeklyGrid(), []);

  useEffect(() => {
    const id = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const cta = playgroundMode
    ? "Open playground build"
    : weeklyGridMode
      ? "Draft this week's grid"
      : expertMode
        ? "Start expert draft"
        : "Start drafting";

  const lede = weeklyGridMode
    ? `Same eight seasons for everyone this week (${grid.weekKey}). Steal one attribute at a time, then share the career under #PDGrid.`
    : "Steal attributes from real F1 seasons. Name the frankenstein. Run the career. Share the obituary.";

  return (
    <section className={`landing ${ready ? "is-ready" : ""}`}>
      <div className="landing__track" aria-hidden />
      <div className="landing__veil" />
      <div className="landing__hero">
        <div className="landing__content">
          <div className="landing__top">
            <p className="eyebrow landing__eyebrow">
              {weeklyGridMode ? `Weekly Grid · ${grid.label}` : "Build a myth"}
            </p>
            <SoundToggle />
          </div>
          <h1 className="brand">
            Perfect
            <span>Driver</span>
          </h1>
          <p className="landing__lede">{lede}</p>

          <div className="landing__path" role="group" aria-label="Draft path">
            <button
              type="button"
              className={`landing__path-btn ${!weeklyGridMode && !playgroundMode ? "is-on" : ""}`}
              onClick={() => {
                setWeeklyGridMode(false);
                setPlaygroundMode(false);
              }}
              aria-pressed={!weeklyGridMode && !playgroundMode}
            >
              Free draft
            </button>
            <button
              type="button"
              className={`landing__path-btn ${weeklyGridMode ? "is-on" : ""}`}
              onClick={() => setWeeklyGridMode(true)}
              aria-pressed={weeklyGridMode}
            >
              This week's grid
            </button>
          </div>

          {weeklyGridMode ? (
            <ul className="weekly-grid" aria-label={`Weekly grid ${grid.weekKey}`}>
              {grid.seasons.map((season) => {
                const legend = isLegendSeason(season.year, season.name);
                return (
                  <li
                    key={season.id}
                    className={legend ? "weekly-grid__item is-legend" : "weekly-grid__item"}
                  >
                    <strong>{season.name}</strong>
                    <span>
                      {season.year}
                      {season.team ? ` · ${season.team}` : ""}
                      {legend ? " · Legend" : ""}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : null}

          <form
            className="landing__form"
            onSubmit={(e) => {
              e.preventDefault();
              if (driverName.trim()) start();
            }}
          >
            <label htmlFor="driver-name">Name your creation</label>
            <div className="landing__name-row">
              <input
                id="driver-name"
                value={driverName}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Lando Hamilton"
                maxLength={32}
                autoComplete="off"
              />
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setName(generateDriverName(driverName))}
              >
                Auto name
              </button>
            </div>
            <button
              type="submit"
              className="btn btn-primary landing__cta"
              disabled={!driverName.trim()}
            >
              {cta}
            </button>
          </form>
          <div className="landing__meta">
            <p>
              Data from DriverDB · {meta.count} driver-seasons · {meta.years[0]}–
              {meta.years[meta.years.length - 1]}
            </p>
            <div className="landing__tools">
              <RatingsGuideButton />
              <div
                className="landing__modes"
                role="group"
                aria-label="Draft variants"
              >
                <span className="landing__modes-label">Also try</span>
                <button
                  type="button"
                  className={`mode-toggle ${expertMode ? "is-on" : ""}`}
                  onClick={() => setExpertMode(!expertMode)}
                  aria-pressed={expertMode}
                  title="Blind draft — ratings hidden until reveal"
                >
                  {expertMode ? "Expert on" : "Expert"}
                </button>
                <button
                  type="button"
                  className={`mode-toggle ${playgroundMode ? "is-on" : ""}`}
                  onClick={() => setPlaygroundMode(!playgroundMode)}
                  aria-pressed={playgroundMode}
                  aria-label={
                    playgroundMode ? "Playground mode on" : "Playground mode"
                  }
                  title="Hand-pick any driver-season"
                  disabled={weeklyGridMode}
                >
                  {playgroundMode ? "Playground on" : "Playground"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
      <CareerHistory />
    </section>
  );
}
