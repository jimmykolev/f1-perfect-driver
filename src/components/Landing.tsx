import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { BrandMark } from "@/components/BrandMark";
import { CareerHistory } from "@/components/CareerHistory";
import { RatingsGuideButton } from "@/components/RatingsGuide";
import { SoundToggle } from "@/components/SoundToggle";
import { TeamHistory } from "@/components/TeamHistory";
import { WeeklyBoardButton } from "@/components/WeeklyBoard";
import { isLegendSeason } from "@/lib/era";
import { generateDriverName } from "@/lib/names";
import { formatWeekReset } from "@/lib/weeklyGrid";
import {
  currentWeeklyGrid,
  datasetMeta,
  useGameStore,
} from "@/store/gameStore";
import { useTeamStore } from "@/store/teamStore";

type HubMode = "driver" | "weekly" | "team";

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
  const startTeam = useTeamStore((s) => s.start);
  const setTeamName = useTeamStore((s) => s.setTeamName);
  const meta = datasetMeta();
  const [ready, setReady] = useState(false);
  const [hubMode, setHubMode] = useState<HubMode>("driver");
  const [teamLabel, setTeamLabel] = useState("Perfect Team");
  const grid = useMemo(() => currentWeeklyGrid(), []);
  const [resetIn, setResetIn] = useState(() => formatWeekReset());

  useEffect(() => {
    const id = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    if (!weeklyGridMode) return;
    const tick = () => setResetIn(formatWeekReset());
    tick();
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, [weeklyGridMode]);

  if (weeklyGridMode) {
    return (
      <section
        className={`landing landing--weekly ${ready ? "is-ready" : ""}`}
      >
        <div className="landing__track landing__track--weekly" aria-hidden />
        <div className="landing__veil landing__veil--weekly" />
        <div className="landing__hero landing__hero--weekly">
          <div className="landing__content landing__content--weekly">
            <div className="landing__top">
              <button
                type="button"
                className="landing__back"
                onClick={() => {
                  setWeeklyGridMode(false);
                  setHubMode("weekly");
                }}
              >
                ← Perfect Grid
              </button>
              <SoundToggle />
            </div>

            <div className="landing__brand-row">
              <BrandMark size="chrome" />
            </div>
            <h1 className="weekly-mode-title">
              Weekly
              <span>Grid</span>
            </h1>
            <p className="landing__lede landing__lede--weekly">
              Same eight seasons. Full career sim. One board. Resets Monday.
            </p>

            <div
              className="weekly-clock"
              aria-label={`${grid.label}, resets in ${resetIn}`}
            >
              <span className="weekly-clock__week">{grid.label}</span>
              <span className="weekly-clock__key">{grid.weekKey}</span>
              <span className="weekly-clock__reset">Resets in {resetIn}</span>
              <WeeklyBoardButton weekKey={grid.weekKey} label={grid.label} />
            </div>

            <ol
              className="weekly-starting-grid"
              aria-label={`This week's eight seasons, ${grid.weekKey}`}
            >
              {grid.seasons.map((season, index) => {
                const legend = isLegendSeason(season.year, season.name);
                return (
                  <li
                    key={season.id}
                    className={
                      legend
                        ? "weekly-starting-grid__slot is-legend"
                        : "weekly-starting-grid__slot"
                    }
                    style={{ "--slot": index } as CSSProperties}
                  >
                    <span className="weekly-starting-grid__pos">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="weekly-starting-grid__body">
                      <strong>{season.name}</strong>
                      <span>
                        {season.year}
                        {season.team ? ` · ${season.team}` : ""}
                        {legend ? " · Legend" : ""}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ol>

            <form
              className="landing__form landing__form--weekly"
              onSubmit={(e) => {
                e.preventDefault();
                if (driverName.trim()) start();
              }}
            >
              <label htmlFor="driver-name-weekly">Name your driver</label>
              <div className="landing__name-row">
                <input
                  id="driver-name-weekly"
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
                Enter this week's grid
              </button>
            </form>

            <p className="weekly-lobby__rules">
              No passes · draft from the fixed grid · submit to the board
            </p>
          </div>
        </div>
      </section>
    );
  }

  const driverCta = playgroundMode
    ? "Open playground build"
    : expertMode
      ? "Start expert draft"
      : "Start Perfect Driver";

  return (
    <section className={`landing landing--hub ${ready ? "is-ready" : ""}`}>
      <div className="landing__track" aria-hidden />
      <div className="landing__veil" />
      <div className="landing__hero landing__hero--hub">
        <div className="landing__content landing__content--hub">
          <div className="landing__top">
            <BrandMark size="chrome" />
            <SoundToggle />
          </div>

          <h1 className="brand brand--hub">
            <span className="brand-mark__name">
              Perfect
              <span>Grid</span>
            </span>
          </h1>
          <p className="landing__lede landing__lede--hub">
            Pick a mode. Build from real ratings. Simulate what happens.
          </p>

          <div className="landing__mode-picker" role="tablist" aria-label="Modes">
            <button
              type="button"
              role="tab"
              aria-selected={hubMode === "driver"}
              className={`landing__mode-card ${hubMode === "driver" ? "is-on" : ""}`}
              onClick={() => {
                setHubMode("driver");
                setWeeklyGridMode(false);
              }}
            >
              <span className="landing__mode-kicker">Live</span>
              <strong>Perfect Driver</strong>
              <span>Draft a driver. Run the career.</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={hubMode === "weekly"}
              className={`landing__mode-card ${hubMode === "weekly" ? "is-on" : ""}`}
              onClick={() => setHubMode("weekly")}
            >
              <span className="landing__mode-kicker">Compete</span>
              <strong>Weekly Grid</strong>
              <span>{grid.label} · one shared board</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={hubMode === "team"}
              className={`landing__mode-card ${hubMode === "team" ? "is-on" : ""}`}
              onClick={() => {
                setHubMode("team");
                setPlaygroundMode(false);
              }}
            >
              <span className="landing__mode-kicker">Live</span>
              <strong>Perfect Team</strong>
              <span>Build a team. One season, every race.</span>
            </button>
          </div>

          <div className="landing__mode-panel" role="tabpanel">
            {hubMode === "driver" ? (
              <>
                <div className="landing__mode-panel-head">
                  <h2>Perfect Driver</h2>
                  <p>
                    Draft attributes from real driver-seasons, then simulate a
                    full career from those ratings.
                  </p>
                </div>
                <form
                  className="landing__form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (driverName.trim()) start();
                  }}
                >
                  <label htmlFor="driver-name">Name your driver</label>
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
                    {driverCta}
                  </button>
                </form>
                <div className="landing__meta">
                  <p>
                    Data from DriverDB · {meta.count} driver-seasons ·{" "}
                    {meta.years[0]}–{meta.years[meta.years.length - 1]}
                  </p>
                  <div className="landing__tools">
                    <RatingsGuideButton />
                    <div
                      className="landing__modes"
                      role="group"
                      aria-label="Perfect Driver variants"
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
                          playgroundMode
                            ? "Playground mode on"
                            : "Playground mode"
                        }
                        title="Hand-pick any driver-season"
                      >
                        {playgroundMode ? "Playground on" : "Playground"}
                      </button>
                    </div>
                  </div>
                </div>
                <CareerHistory />
              </>
            ) : null}

            {hubMode === "weekly" ? (
              <>
                <div className="landing__mode-panel-head">
                  <h2>Weekly Grid</h2>
                  <p>
                    Everyone drafts from the same eight seasons this week, runs
                    the full career, and submits to one board.
                  </p>
                </div>
                <ul className="landing__weekly-preview" aria-label="This week's grid">
                  {grid.seasons.map((season) => (
                    <li key={season.id}>
                      <strong>{season.name}</strong>
                      <span>{season.year}</span>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  className="btn btn-primary landing__cta"
                  onClick={() => {
                    setPlaygroundMode(false);
                    setWeeklyGridMode(true);
                  }}
                >
                  Open Weekly Grid
                </button>
              </>
            ) : null}

            {hubMode === "team" ? (
              <>
                <div className="landing__mode-panel-head">
                  <h2>Perfect Team</h2>
                  <p>
                    Build the car, sign three seats, appoint a team principal,
                    then chase every race win in one season.
                  </p>
                </div>
                <div className="landing__team-teaser" aria-hidden>
                  <span>1</span>
                  <em>Season. Every race. Your constructor.</em>
                </div>
                <form
                  className="landing__form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const name = teamLabel.trim() || "Perfect Team";
                    setTeamName(name);
                    setPlaygroundMode(false);
                    setWeeklyGridMode(false);
                    startTeam();
                  }}
                >
                  <label htmlFor="team-name">Name your team</label>
                  <div className="landing__name-row">
                    <input
                      id="team-name"
                      value={teamLabel}
                      onChange={(e) => setTeamLabel(e.target.value)}
                      placeholder="e.g. Apex Racing"
                      maxLength={32}
                      autoComplete="off"
                    />
                  </div>
                  <button type="submit" className="btn btn-primary landing__cta">
                    Build the car
                  </button>
                </form>
                <TeamHistory />
                <p className="landing__mode-note">
                  Car + seats + principal · progress saves in this browser.
                </p>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
