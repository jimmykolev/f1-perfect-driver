import { useEffect, useMemo, useRef, useState } from "react";
import { BrandMark } from "@/components/BrandMark";
import { SoundToggle } from "@/components/SoundToggle";
import { pickAutoCarAttribute } from "@/lib/autoDraft";
import { playLockSound, playSpinSound } from "@/lib/sound";
import {
  CAR_ATTRIBUTE_KEYS,
  CAR_ATTRIBUTE_META,
  type CarAttributeKey,
} from "@/lib/teamCarPool";
import { useTeamStore } from "@/store/teamStore";

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
}: {
  spinning: boolean;
  value: string;
  alternatives: string[];
}) {
  const [display, setDisplay] = useState(value || "—");
  useEffect(() => {
    if (!spinning) {
      setDisplay(value || "—");
      return;
    }
    if (!alternatives.length) return;
    let i = 0;
    const id = window.setInterval(() => {
      setDisplay(alternatives[i % alternatives.length]!);
      i += 1;
    }, 70);
    return () => window.clearInterval(id);
  }, [spinning, value, alternatives]);

  return (
    <div className={`reel ${spinning ? "is-spinning" : ""}`}>
      <span>{display}</span>
    </div>
  );
}

export function TeamCarDraft() {
  const teamName = useTeamStore((s) => s.teamName);
  const carLocked = useTeamStore((s) => s.carLocked);
  const carCurrent = useTeamStore((s) => s.carCurrent);
  const carSpinning = useTeamStore((s) => s.carSpinning);
  const passesLeft = useTeamStore((s) => s.passesLeft);
  const carPool = useTeamStore((s) => s.carPool);
  const spinCar = useTeamStore((s) => s.spinCar);
  const pickCarAttribute = useTeamStore((s) => s.pickCarAttribute);
  const passCar = useTeamStore((s) => s.passCar);
  const reset = useTeamStore((s) => s.reset);
  const openSlots = useTeamStore((s) => s.openCarSlots);
  const overall = useTeamStore((s) => s.carOverall);
  const autoDraft = useTeamStore((s) => s.autoDraft);
  const setAutoDraft = useTeamStore((s) => s.setAutoDraft);
  const openKeys = openSlots();
  const ovr = overall();

  const prevLocked = useRef(carLocked.length);
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    if (carLocked.length > prevLocked.current) {
      playLockSound();
      const newest = carLocked[carLocked.length - 1];
      if (newest) {
        setFlash(
          `${CAR_ATTRIBUTE_META[newest.key].label} ${newest.value} · ${newest.from.team} ${newest.from.year}`,
        );
      }
    }
    prevLocked.current = carLocked.length;
  }, [carLocked]);

  useEffect(() => {
    if (!flash) return;
    const id = window.setTimeout(() => setFlash(null), 2000);
    return () => window.clearTimeout(id);
  }, [flash]);

  useEffect(() => {
    if (!autoDraft || carSpinning || carLocked.length >= 4) return;
    const timer = window.setTimeout(() => {
      if (carCurrent) {
        const key = pickAutoCarAttribute(
          carCurrent,
          carLocked.map((item) => item.key),
        );
        if (key) pickCarAttribute(key);
        else if (passesLeft > 0) passCar();
        else spinCar(true);
        return;
      }
      spinCar(true);
    }, 140);
    return () => window.clearTimeout(timer);
  }, [
    autoDraft,
    carCurrent,
    carLocked,
    carSpinning,
    passCar,
    passesLeft,
    pickCarAttribute,
    spinCar,
  ]);

  const teamAlts = useMemo(() => {
    const names = [...new Set(carPool.map((c) => c.team))];
    return names.sort(() => Math.random() - 0.5).slice(0, 20);
  }, [carPool]);

  const yearAlts = useMemo(
    () => [...new Set(carPool.map((c) => String(c.year)))],
    [carPool],
  );

  const byKey = Object.fromEntries(carLocked.map((l) => [l.key, l])) as Partial<
    Record<CarAttributeKey, (typeof carLocked)[number]>
  >;

  return (
    <section className="team-draft">
      <header className="team-draft__header">
        <div className="team-draft__identity">
          <BrandMark size="chrome" />
          <div>
            <p className="eyebrow">Perfect Team · Step 1 of 3</p>
            <h1>{teamName || "Your team"}</h1>
          </div>
        </div>
        <div className="team-draft__tools">
          <SoundToggle />
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              if (
                carLocked.length > 0 &&
                !window.confirm("Leave Perfect Team and scrap this build?")
              ) {
                return;
              }
              reset();
            }}
          >
            Exit
          </button>
        </div>
      </header>

      <ol className="team-draft__steps" aria-label="Build progress">
        <li className="is-on">
          <span>01</span>
          <strong>Car</strong>
        </li>
        <li>
          <span>02</span>
          <strong>Seats</strong>
        </li>
        <li>
          <span>03</span>
          <strong>Principal</strong>
        </li>
      </ol>

      <div className="team-draft__stage">
        <div className="team-draft__spin">
          <div className="team-draft__spin-head">
            <p className="eyebrow">
              {carCurrent && !carSpinning ? "Steal one rating" : "Constructor spin"}
            </p>
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
            {flash ? (
              <p className="team-draft__flash" role="status">
                {flash}
              </p>
            ) : (
              <p className="team-draft__hint">
                {autoDraft
                  ? `Auto drafting · ${carLocked.length}/4`
                  : `${carLocked.length}/4 locked · ${
                      passesLeft === 1
                        ? "1 pass left"
                        : `${passesLeft} passes left`
                    }`}
              </p>
            )}
          </div>

          {carCurrent && !carSpinning ? (
            <div className="team-pick">
              <div className="team-pick__head">
                <div>
                  <p className="eyebrow">{carCurrent.year}</p>
                  <h2>{carCurrent.team}</h2>
                  {carCurrent.drivers.length ? (
                    <p className="team-pick__drivers">
                      {carCurrent.drivers.slice(0, 3).join(" · ")}
                    </p>
                  ) : null}
                </div>
                <div className="team-pick__ovr">
                  <span>OVR</span>
                  <strong className={ratingColor(carCurrent.overall)}>
                    {carCurrent.overall}
                  </strong>
                </div>
              </div>
              <p className="team-pick__prompt">
                Keep one open attribute
                <em>{openKeys.length} open</em>
              </p>
              <ul className="attr-list team-pick__attrs">
                {CAR_ATTRIBUTE_KEYS.map((key) => {
                  const value = carCurrent.attributes[key];
                  const meta = CAR_ATTRIBUTE_META[key];
                  const open = openKeys.includes(key);
                  if (!open) {
                    return (
                      <li key={key} className="attr-row">
                        <span className="attr-row__label">{meta.label}</span>
                        <span className="attr-row__bar" />
                        <span className="attr-row__open">taken</span>
                      </li>
                    );
                  }
                  return (
                    <li key={key}>
                      <button
                        type="button"
                        className="attr-row attr-row--pick is-filled"
                        onClick={() => pickCarAttribute(key)}
                        title={meta.blurb}
                      >
                        <span className="attr-row__label">{meta.label}</span>
                        <span className="attr-row__bar">
                          <i
                            style={{ width: `${value}%` }}
                            className={ratingColor(value)}
                          />
                        </span>
                        <strong
                          className={`attr-row__val ${ratingColor(value)}`}
                        >
                          {value}
                        </strong>
                        <span className="attr-row__source">
                          {carCurrent.team} · {carCurrent.year}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              <div className="team-draft__actions team-draft__actions--pick">
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={passCar}
                  disabled={passesLeft <= 0}
                >
                  Pass ({passesLeft})
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="team-draft__reels">
                <div className="team-draft__reel">
                  <p className="eyebrow">Constructor</p>
                  <Reel
                    spinning={carSpinning}
                    value={carCurrent?.team ?? ""}
                    alternatives={teamAlts}
                  />
                </div>
                <div className="team-draft__reel">
                  <p className="eyebrow">Year</p>
                  <Reel
                    spinning={carSpinning}
                    value={carCurrent ? String(carCurrent.year) : ""}
                    alternatives={yearAlts}
                  />
                </div>
              </div>

              <div className="team-draft__actions">
                <button
                  type="button"
                  className="btn btn-primary"
                  data-no-click-sound
                  onClick={() => {
                    playSpinSound();
                    spinCar();
                  }}
                  disabled={carSpinning || carLocked.length >= 4}
                >
                  {carSpinning ? "Spinning…" : "Spin constructor"}
                </button>
              </div>

              <div className="team-pick team-pick--idle">
                <p>
                  {carSpinning
                    ? "Landing on a constructor-year…"
                    : "Spin a constructor-year, then steal aero, chassis, powertrain, or durability."}
                </p>
              </div>
            </>
          )}
        </div>

        <aside className="build-panel team-build-panel" aria-label="Car build">
          <div className="build-panel__head">
            <p className="eyebrow">Your car</p>
            <div className="build-panel__ovr">
              <span>OVR</span>
              <strong className={ratingColor(ovr || 50)}>{ovr || "—"}</strong>
            </div>
          </div>
          <ul className="attr-list">
            {CAR_ATTRIBUTE_KEYS.map((key) => {
              const meta = CAR_ATTRIBUTE_META[key];
              const item = byKey[key];
              return (
                <li
                  key={key}
                  className={`attr-row ${item ? "is-filled" : ""}`}
                >
                  <span className="attr-row__label">{meta.label}</span>
                  {item ? (
                    <>
                      <span className="attr-row__bar">
                        <i
                          style={{ width: `${item.value}%` }}
                          className={ratingColor(item.value)}
                        />
                      </span>
                      <strong
                        className={`attr-row__val ${ratingColor(item.value)}`}
                      >
                        {item.value}
                      </strong>
                      <span className="attr-row__source">
                        {item.from.team} · {item.from.year}
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="attr-row__bar" />
                      <span className="attr-row__open">open</span>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="build-panel__progress">
            <span style={{ width: `${(carLocked.length / 4) * 100}%` }} />
          </div>
          <p className="build-panel__count">
            {carLocked.length} of 4 locked
          </p>
        </aside>
      </div>
    </section>
  );
}
