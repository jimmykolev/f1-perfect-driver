import { useEffect, useMemo, useRef, useState } from "react";
import { PlaygroundPanel } from "@/components/PlaygroundPanel";
import { BuildPanel } from "@/components/BuildPanel";
import { RatingsGuideButton } from "@/components/RatingsGuide";
import { SoundToggle } from "@/components/SoundToggle";
import { pickAutoDraftAttribute } from "@/lib/autoDraft";
import { isLegendSeason } from "@/lib/era";
import {
  playLockSound,
  playNearMissSound,
  playSpinSound,
} from "@/lib/sound";
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
  const autoDraft = useGameStore((s) => s.autoDraft);
  const passesLeft = useGameStore((s) => s.passesLeft);
  const pool = useGameStore((s) => s.pool);
  const playgroundMode = useGameStore((s) => s.playgroundMode);
  const expertMode = useGameStore((s) => s.expertMode);
  const weeklyGridMode = useGameStore((s) => s.weeklyGridMode);
  const weeklyWeekKey = useGameStore((s) => s.weeklyWeekKey);
  const nearMiss = useGameStore((s) => s.nearMiss);
  const spin = useGameStore((s) => s.spin);
  const pass = useGameStore((s) => s.pass);
  const pickAttribute = useGameStore((s) => s.pickAttribute);
  const setAutoDraft = useGameStore((s) => s.setAutoDraft);
  const playgroundUnlock = useGameStore((s) => s.playgroundUnlock);
  const openSlots = useGameStore((s) => s.openSlots);
  const buildOverall = useGameStore((s) => s.buildOverall);
  const reset = useGameStore((s) => s.reset);

  const openKeys = openSlots();
  const overall = buildOverall();
  const currentIsLegend = Boolean(
    current && isLegendSeason(current.year, current.name),
  );
  const autoDraftStatus = spinning
    ? "Spinning next season…"
    : current
      ? `Keeping strongest attribute · ${locked.length}/8`
      : `Drafting · ${locked.length}/8 locked`;

  const prevLockedCount = useRef(locked.length);
  const prevNearMiss = useRef(nearMiss);
  const [stealFlash, setStealFlash] = useState<{
    label: string;
    value: number;
    from: string;
    year: number;
    legend: boolean;
  } | null>(null);

  const handleSpin = () => {
    playSpinSound();
    spin();
  };

  useEffect(() => {
    if (locked.length > prevLockedCount.current) {
      playLockSound();
      const newest = locked[locked.length - 1];
      if (newest) {
        setStealFlash({
          label: ATTRIBUTE_META[newest.key].label,
          value: newest.value,
          from: newest.from.name,
          year: newest.from.year,
          legend: isLegendSeason(newest.from.year, newest.from.name),
        });
      }
    }
    prevLockedCount.current = locked.length;
  }, [locked]);

  useEffect(() => {
    if (!stealFlash) return;
    const id = window.setTimeout(() => setStealFlash(null), 2200);
    return () => window.clearTimeout(id);
  }, [stealFlash]);

  useEffect(() => {
    if (nearMiss && !prevNearMiss.current) {
      playNearMissSound();
    }
    prevNearMiss.current = nearMiss;
  }, [nearMiss]);

  const handleRestart = () => {
    if (
      locked.length > 0 &&
      !window.confirm("Restart and scrap this build?")
    ) {
      return;
    }
    reset();
  };

  useEffect(() => {
    if (
      !autoDraft ||
      playgroundMode ||
      spinning ||
      locked.length >= 8
    ) {
      return;
    }

    const timer = window.setTimeout(() => {
      if (current) {
        const key = pickAutoDraftAttribute(
          current,
          locked.map((item) => item.key),
        );
        if (key) {
          pickAttribute(key);
        } else if (passesLeft > 0) {
          pass();
        } else {
          spin(true);
        }
      } else {
        spin(true);
      }
    }, current ? 100 : 150);

    return () => window.clearTimeout(timer);
  }, [
    playgroundMode,
    autoDraft,
    current,
    locked,
    pass,
    passesLeft,
    pickAttribute,
    spin,
    spinning,
  ]);

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
      className={`draft ${playgroundMode ? "draft--playground" : ""} ${
        expertMode ? "draft--expert" : ""
      } ${weeklyGridMode ? "draft--weekly" : ""}`}
    >
      <header className="draft__header">
        <div>
          <p className="eyebrow">
            {playgroundMode
              ? "Playground build"
              : weeklyGridMode
                ? `Weekly Grid · ${weeklyWeekKey ?? "this week"}`
                : expertMode
                  ? "Expert build"
                  : "Building"}
            {!playgroundMode ? (
              <span className="draft__legend-hint">
                {weeklyGridMode
                  ? " · Same 8 seasons for everyone · no passes"
                  : expertMode
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
          {playgroundMode || weeklyGridMode ? (
            <span>{locked.length}/8 locked</span>
          ) : (
            <span>
              {passesLeft} pass{passesLeft === 1 ? "" : "es"} left
            </span>
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

      {playgroundMode ? (
        <div className="draft__layout draft__layout--playground">
          <PlaygroundPanel />
          <BuildPanel
            locked={locked}
            overall={overall}
            onUnlock={playgroundUnlock}
          />
        </div>
      ) : (
        <div className="draft__layout">
          <div className="draft__main">
            <div
              className={`spin-board ${currentIsLegend ? "spin-board--legend" : ""} ${
                autoDraft ? "spin-board--auto" : ""
              }`}
            >
              <div className="spin-board__toolbar">
                <p className="eyebrow">
                  {weeklyGridMode ? "Grid spin" : "Season spin"}
                </p>
                {!weeklyGridMode ? (
                  <div
                    className="spin-board__mode"
                    title="Auto draft spins seasons and keeps the strongest open attribute."
                  >
                    <div
                      className="segmented segmented--compact"
                      role="radiogroup"
                      aria-label="Draft mode"
                    >
                      <button
                        type="button"
                        role="radio"
                        aria-checked={!autoDraft}
                        className={!autoDraft ? "is-active" : ""}
                        onClick={() => setAutoDraft(false)}
                      >
                        Manual
                      </button>
                      <button
                        type="button"
                        role="radio"
                        aria-checked={autoDraft}
                        className={autoDraft ? "is-active" : ""}
                        onClick={() => setAutoDraft(true)}
                      >
                        Auto
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
              {stealFlash ? (
                <p
                  className={`steal-flash ${stealFlash.legend ? "is-legend" : ""}`}
                  role="status"
                >
                  <span>Stolen</span>
                  <strong>
                    {stealFlash.label} {expertMode ? "" : stealFlash.value}
                  </strong>
                  <em>
                    {stealFlash.from} · {stealFlash.year}
                    {stealFlash.legend ? " · Legend" : ""}
                  </em>
                </p>
              ) : null}
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
              {autoDraft ? (
                <p className="spin-board__auto-status" role="status">
                  {autoDraftStatus}
                </p>
              ) : (
                <>
                  <div className="spin-board__actions">
                    <button
                      type="button"
                      className="btn btn-primary"
                      data-no-click-sound
                      onClick={handleSpin}
                      disabled={
                        spinning || Boolean(current) || locked.length >= 8
                      }
                    >
                      {spinning
                        ? "Spinning…"
                        : current
                          ? "Pick an attribute"
                          : "Spin"}
                    </button>
                    {!weeklyGridMode ? (
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={pass}
                        disabled={!current || spinning || passesLeft <= 0}
                      >
                        Pass ({passesLeft})
                      </button>
                    ) : null}
                  </div>
                  {nearMiss && !spinning ? (
                    <p className="spin-board__near-miss" role="status">
                      Near miss — a legend just slipped past the reels.
                    </p>
                  ) : null}
                </>
              )}
            </div>

            {autoDraft ? (
              current && !spinning ? (
                <div className="driver-card driver-card--auto">
                  <p className="eyebrow">
                    {current.year} · {current.team}
                  </p>
                  <h2 className="driver-card--auto__name">{current.name}</h2>
                </div>
              ) : null
            ) : current && !spinning ? (
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
