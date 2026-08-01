import { useEffect, useMemo, useState } from "react";
import { AdminPanel } from "@/components/AdminPanel";
import { BuildPanel } from "@/components/BuildPanel";
import { RatingsGuideButton } from "@/components/RatingsGuide";
import { SoundToggle } from "@/components/SoundToggle";
import { isLegendSeason } from "@/lib/era";
import { playSpinSound } from "@/lib/sound";
import { ATTRIBUTE_META, type AttributeKey, type DriverSeason } from "@/types";
import { useGameStore } from "@/store/gameStore";

function ratingColor(v: number) {
  if (v >= 90) return "text-rating-elite";
  if (v >= 80) return "text-rating-great";
  if (v >= 70) return "text-rating-good";
  return "text-ink-muted";
}

function Reel({
  spinning,
  value,
  alternatives,
  legend,
}: {
  spinning: boolean;
  value: string;
  alternatives: string[];
  legend?: boolean;
}) {
  const [display, setDisplay] = useState(value || alternatives[0] || "—");

  useEffect(() => {
    if (!spinning) {
      setDisplay(value || "—");
      return;
    }
    let i = 0;
    const id = window.setInterval(() => {
      setDisplay(alternatives[i % alternatives.length]!);
      i++;
    }, 70);
    return () => clearInterval(id);
  }, [spinning, value, alternatives]);

  return (
    <div
      className={`reel ${spinning ? "is-spinning" : ""} ${
        legend && !spinning ? "is-legend" : ""
      }`}
    >
      <span>{display}</span>
      {legend && !spinning ? <em className="reel__legend">Legend</em> : null}
    </div>
  );
}

function DriverCard({
  season,
  openKeys,
  onPick,
  passesLeft,
  blind,
}: {
  season: DriverSeason;
  openKeys: AttributeKey[];
  onPick: (key: AttributeKey) => void;
  passesLeft: number;
  blind: boolean;
}) {
  const legend = isLegendSeason(season.year, season.name);
  const stats = [
    `P${season.position}`,
    `${season.points} pts`,
    `${season.wins} ${season.wins === 1 ? "win" : "wins"}`,
    `${season.podiums} ${season.podiums === 1 ? "podium" : "podiums"}`,
    `${season.poles} ${season.poles === 1 ? "pole" : "poles"}`,
  ];

  return (
    <div
      className={`driver-card ${legend ? "driver-card--legend" : ""} ${
        blind ? "driver-card--blind" : ""
      }`}
    >
      {legend ? (
        <p className="legend-banner" aria-label="Legend icon season">
          <span>Legend</span>
          Pre-2014 icon · {season.name.split(" ").slice(-1)[0]} · {season.year}
        </p>
      ) : null}
      <div className="driver-card__top">
        {season.image ? (
          <img src={season.image} alt="" className="driver-card__photo" />
        ) : (
          <div className="driver-card__photo driver-card__photo--empty" />
        )}
        <div>
          <p className="eyebrow">
            {season.year} · {season.team}
          </p>
          <h2>{season.name}</h2>
          <ul className="chips chips--sm">
            {stats.map((stat) => (
              <li key={stat}>{stat}</li>
            ))}
          </ul>
        </div>
        <div className="overall-badge">
          <span>OVR</span>
          <strong className={blind ? "" : ratingColor(season.overall)}>
            {blind ? "?" : season.overall}
          </strong>
        </div>
      </div>

      <p className="driver-card__prompt">
        {passesLeft <= 0
          ? "No passes left — keep one attribute"
          : blind
            ? "Trust your knowledge — keep one attribute"
            : "Keep one attribute from this season"}
        <em>{openKeys.length} still open</em>
      </p>
      <div className={`pick-grid ${blind ? "pick-grid--blind" : ""}`}>
        {openKeys.map((key) => {
          const value = season.attributes[key];
          const meta = ATTRIBUTE_META[key];
          return (
            <button
              key={key}
              type="button"
              className={`pick-btn ${blind ? "pick-btn--blind" : ""}`}
              onClick={() => onPick(key)}
              title={meta.blurb}
            >
              <span>{meta.label}</span>
              {blind ? (
                <strong className="pick-btn__mystery" aria-hidden>
                  ?
                </strong>
              ) : (
                <strong className={ratingColor(value)}>{value}</strong>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function Draft() {
  const driverName = useGameStore((s) => s.driverName);
  const locked = useGameStore((s) => s.locked);
  const current = useGameStore((s) => s.current);
  const spinning = useGameStore((s) => s.spinning);
  const passesLeft = useGameStore((s) => s.passesLeft);
  const pool = useGameStore((s) => s.pool);
  const adminMode = useGameStore((s) => s.adminMode);
  const expertMode = useGameStore((s) => s.expertMode);
  const challengeSpinAvailable = useGameStore((s) => s.challengeSpinAvailable);
  const challengeSpinActive = useGameStore((s) => s.challengeSpinActive);
  const nearMiss = useGameStore((s) => s.nearMiss);
  const activateChallengeSpin = useGameStore((s) => s.activateChallengeSpin);
  const spin = useGameStore((s) => s.spin);
  const pass = useGameStore((s) => s.pass);
  const pickAttribute = useGameStore((s) => s.pickAttribute);
  const adminUnlock = useGameStore((s) => s.adminUnlock);
  const openSlots = useGameStore((s) => s.openSlots);
  const buildOverall = useGameStore((s) => s.buildOverall);
  const reset = useGameStore((s) => s.reset);

  const openKeys = openSlots();
  const overall = buildOverall();
  const currentIsLegend = Boolean(
    current && isLegendSeason(current.year, current.name),
  );

  const handleSpin = () => {
    playSpinSound();
    spin();
  };

  const handleRestart = () => {
    if (
      locked.length > 0 &&
      !window.confirm("Restart and scrap this build?")
    ) {
      return;
    }
    reset();
  };

  const nameAlts = useMemo(() => {
    const names = [...new Set(pool.map((p) => p.name))];
    return names.sort(() => Math.random() - 0.5).slice(0, 24);
  }, [pool]);

  const yearAlts = useMemo(() => {
    const years = [...new Set(pool.map((p) => String(p.year)))];
    return years;
  }, [pool]);

  return (
    <section
      className={`draft ${adminMode ? "draft--admin" : ""} ${
        expertMode ? "draft--expert" : ""
      }`}
    >
      <header className="draft__header">
        <div>
          <p className="eyebrow">
            {adminMode
              ? "Admin build"
              : expertMode
                ? "Expert build"
                : "Building"}
            {!adminMode ? (
              <span className="draft__legend-hint">
                {expertMode
                  ? " · Ratings hidden until reveal"
                  : " · Gold = pre-2014 icon"}
              </span>
            ) : null}
          </p>
          <h1 className="draft__name">{driverName || "Your Driver"}</h1>
        </div>
        <div className="draft__meta">
          <span className="slot-dots" aria-label={`${locked.length} of 8 locked`}>
            {Array.from({ length: 8 }, (_, i) => (
              <i key={i} className={i < locked.length ? "is-on" : ""} />
            ))}
          </span>
          {!adminMode ? (
            <span>
              {passesLeft} pass{passesLeft === 1 ? "" : "es"} left
            </span>
          ) : (
            <span>{locked.length}/8 locked</span>
          )}
          <RatingsGuideButton />
          <SoundToggle />
          <button
            type="button"
            className="btn btn-ghost draft__restart"
            onClick={handleRestart}
          >
            Restart
          </button>
        </div>
      </header>

      {adminMode ? (
        <div className="draft__layout draft__layout--admin">
          <AdminPanel />
          <BuildPanel
            locked={locked}
            overall={overall}
            onUnlock={adminUnlock}
          />
        </div>
      ) : (
        <div className="draft__layout">
          <div className="draft__main">
            <div
              className={`spin-board ${currentIsLegend ? "spin-board--legend" : ""}`}
            >
              <div className="spin-board__reels">
                <div>
                  <p className="eyebrow">Driver</p>
                  <Reel
                    spinning={spinning}
                    value={current?.name ?? ""}
                    alternatives={nameAlts}
                    legend={currentIsLegend}
                  />
                </div>
                <div>
                  <p className="eyebrow">Year</p>
                  <Reel
                    spinning={spinning}
                    value={current ? String(current.year) : ""}
                    alternatives={yearAlts}
                    legend={currentIsLegend}
                  />
                </div>
              </div>
              <div className="spin-board__actions">
                <button
                  type="button"
                  className="btn btn-primary"
                  data-no-click-sound
                  onClick={handleSpin}
                  disabled={spinning || Boolean(current) || locked.length >= 8}
                >
                  {spinning
                    ? "Spinning…"
                    : current
                      ? "Pick an attribute"
                      : challengeSpinActive
                        ? "Challenge spin"
                        : "Spin"}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={pass}
                  disabled={!current || spinning || passesLeft <= 0}
                >
                  Pass ({passesLeft})
                </button>
                {!adminMode && challengeSpinAvailable && !current && !spinning ? (
                  <button
                    type="button"
                    className={`btn btn-ghost ${challengeSpinActive ? "is-armed" : ""}`}
                    onClick={activateChallengeSpin}
                    title="Once per draft: riskier pool, bigger upside"
                  >
                    {challengeSpinActive ? "Armed" : "Challenge"}
                  </button>
                ) : null}
              </div>
              {nearMiss && !spinning ? (
                <p className="spin-board__near-miss" role="status">
                  Near miss — a legend just slipped past the reels.
                </p>
              ) : null}
              {challengeSpinActive && !current ? (
                <p className="spin-board__challenge-note" role="status">
                  Challenge armed — next spin pulls from legends and long shots.
                </p>
              ) : null}
            </div>

            {current && !spinning ? (
              <DriverCard
                season={current}
                openKeys={openKeys}
                onPick={pickAttribute}
                passesLeft={passesLeft}
                blind={expertMode}
              />
            ) : (
              <div className="driver-card driver-card--placeholder">
                <p>
                  {spinning
                    ? "Landing on a driver-season…"
                    : expertMode
                      ? "Spin a season, then draft from memory — no ratings shown."
                      : "Spin to draft the next piece of your driver."}
                </p>
              </div>
            )}
          </div>

          <BuildPanel locked={locked} overall={overall} blind={expertMode} />
        </div>
      )}
    </section>
  );
}
