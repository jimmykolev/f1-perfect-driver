import { useEffect, useMemo, useRef, useState } from "react";
import { BrandMark } from "@/components/BrandMark";
import { SoundToggle } from "@/components/SoundToggle";
import { playLockSound, playSpinSound } from "@/lib/sound";
import { TEAM_SEAT_LABEL, TEAM_SEAT_ORDER } from "@/lib/teamCarPool";
import { useTeamStore } from "@/store/teamStore";
import data from "@/data/driverSeasons.json";
import { isEligibleSeason } from "@/lib/era";
import {
  ATTRIBUTE_KEYS,
  ATTRIBUTE_META,
  type DriverDataFile,
} from "@/types";

const eligible = (data as DriverDataFile).seasons.filter(isEligibleSeason);

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

export function TeamSeatDraft() {
  const teamName = useTeamStore((s) => s.teamName);
  const seats = useTeamStore((s) => s.seats);
  const seatCurrent = useTeamStore((s) => s.seatCurrent);
  const seatSpinning = useTeamStore((s) => s.seatSpinning);
  const spinSeat = useTeamStore((s) => s.spinSeat);
  const lockSeat = useTeamStore((s) => s.lockSeat);
  const passSeat = useTeamStore((s) => s.passSeat);
  const passesLeft = useTeamStore((s) => s.passesLeft);
  const openSeats = useTeamStore((s) => s.openSeats);
  const reset = useTeamStore((s) => s.reset);
  const carOverall = useTeamStore((s) => s.carOverall);
  const autoDraft = useTeamStore((s) => s.autoDraft);
  const setAutoDraft = useTeamStore((s) => s.setAutoDraft);

  const open = openSeats();
  const lockedCount = TEAM_SEAT_ORDER.length - open.length;
  const prevCount = useRef(lockedCount);
  const [flash, setFlash] = useState<string | null>(null);
  const canAssign = Boolean(seatCurrent) && !seatSpinning;

  useEffect(() => {
    if (!autoDraft || seatSpinning || open.length === 0) return;
    const timer = window.setTimeout(() => {
      if (seatCurrent) {
        const seat = open[0];
        if (seat) lockSeat(seat);
        return;
      }
      spinSeat(true);
    }, 140);
    return () => window.clearTimeout(timer);
  }, [autoDraft, lockSeat, open, seatCurrent, seatSpinning, spinSeat]);

  useEffect(() => {
    if (lockedCount > prevCount.current) {
      playLockSound();
      const last = TEAM_SEAT_ORDER.filter((id) => seats[id]).at(-1);
      if (last && seats[last]) {
        setFlash(
          `${TEAM_SEAT_LABEL[last]} · ${seats[last]!.name} ${seats[last]!.year}`,
        );
      }
    }
    prevCount.current = lockedCount;
  }, [lockedCount, seats]);

  useEffect(() => {
    if (!flash) return;
    const id = window.setTimeout(() => setFlash(null), 2000);
    return () => window.clearTimeout(id);
  }, [flash]);

  const nameAlts = useMemo(() => {
    const names = [...new Set(eligible.map((s) => s.name))];
    return names.sort(() => Math.random() - 0.5).slice(0, 24);
  }, []);

  const yearAlts = useMemo(
    () => [...new Set(eligible.map((s) => String(s.year)))],
    [],
  );

  return (
    <section className="team-draft">
      <header className="team-draft__header">
        <div className="team-draft__identity">
          <BrandMark size="chrome" />
          <div>
            <p className="eyebrow">Perfect Team · Step 2 of 3</p>
            <h1>{teamName || "Your team"}</h1>
          </div>
        </div>
        <div className="team-draft__tools">
          <span className="team-draft__meta-pill">
            Car OVR {carOverall() || "—"}
          </span>
          <SoundToggle />
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
      </header>

      <ol className="team-draft__steps" aria-label="Build progress">
        <li className="is-done">
          <span>01</span>
          <strong>Car</strong>
        </li>
        <li className="is-on">
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
              {seatCurrent && !seatSpinning ? "Assign a seat" : "Driver spin"}
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
                  ? `Auto signing · ${lockedCount}/3`
                  : `${lockedCount}/3 signed · ${
                      passesLeft === 1
                        ? "1 pass left"
                        : `${passesLeft} passes left`
                    }`}
              </p>
            )}
          </div>

          {seatCurrent && !seatSpinning ? (
            <div className="team-pick">
              <div className="team-pick__head">
                <div>
                  <p className="eyebrow">{seatCurrent.team}</p>
                  <h2>{seatCurrent.name}</h2>
                  <p className="team-pick__drivers">
                    {seatCurrent.year} · P{seatCurrent.position} ·{" "}
                    {seatCurrent.wins}W · {seatCurrent.podiums} podiums
                  </p>
                </div>
                <div className="team-pick__ovr">
                  <span>OVR</span>
                  <strong className={ratingColor(seatCurrent.overall)}>
                    {seatCurrent.overall}
                  </strong>
                </div>
              </div>
              <ul className="attr-list team-pick__attrs">
                {ATTRIBUTE_KEYS.map((key) => {
                  const value = seatCurrent.attributes[key];
                  return (
                    <li key={key} className="attr-row is-filled">
                      <span className="attr-row__label">
                        {ATTRIBUTE_META[key].label}
                      </span>
                      <span className="attr-row__bar">
                        <i
                          style={{ width: `${value}%` }}
                          className={ratingColor(value)}
                        />
                      </span>
                      <strong className={`attr-row__val ${ratingColor(value)}`}>
                        {value}
                      </strong>
                      <span className="attr-row__source">
                        {seatCurrent.name} · {seatCurrent.year}
                      </span>
                    </li>
                  );
                })}
              </ul>
              <p className="team-pick__prompt">
                Assign this driver
                <em>{open.length} open</em>
              </p>
              <div className="team-pick__grid team-pick__grid--seats">
                {open.map((id) => (
                  <button
                    key={id}
                    type="button"
                    className="team-pick__btn"
                    onClick={() => lockSeat(id)}
                  >
                    <span>{TEAM_SEAT_LABEL[id]}</span>
                    <strong>Sign</strong>
                  </button>
                ))}
              </div>
              <div className="team-draft__actions team-draft__actions--pick">
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={passSeat}
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
                  <p className="eyebrow">Driver</p>
                  <Reel
                    spinning={seatSpinning}
                    value={seatCurrent?.name ?? ""}
                    alternatives={nameAlts}
                  />
                </div>
                <div className="team-draft__reel">
                  <p className="eyebrow">Year</p>
                  <Reel
                    spinning={seatSpinning}
                    value={seatCurrent ? String(seatCurrent.year) : ""}
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
                    spinSeat();
                  }}
                  disabled={seatSpinning || open.length === 0}
                >
                  {seatSpinning ? "Spinning…" : "Spin driver"}
                </button>
              </div>

              <div className="team-pick team-pick--idle">
                <p>
                  {seatSpinning
                    ? "Landing on a driver-season…"
                    : "Spin a real driver-season, then put them in 1st, 2nd, or reserve."}
                </p>
              </div>
            </>
          )}
        </div>

        <aside
          className="build-panel team-build-panel"
          aria-label="Seat roster"
        >
          <div className="build-panel__head">
            <p className="eyebrow">Roster</p>
            <div className="build-panel__ovr">
              <span>Seats</span>
              <strong>{lockedCount}/3</strong>
            </div>
          </div>
          <ul className="attr-list">
            {TEAM_SEAT_ORDER.map((id) => {
              const driver = seats[id];
              const openSeat = !driver;
              const interactive = openSeat && canAssign;
              const value = driver?.overall;
              const row = (
                <>
                  <span className="attr-row__label">{TEAM_SEAT_LABEL[id]}</span>
                  {driver && value != null ? (
                    <>
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
                        {driver.name} · {driver.year}
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="attr-row__bar" />
                      <span className="attr-row__open">
                        {interactive ? "sign" : "open"}
                      </span>
                    </>
                  )}
                </>
              );
              return (
                <li key={id}>
                  {interactive ? (
                    <button
                      type="button"
                      className="attr-row attr-row--pick"
                      onClick={() => lockSeat(id)}
                    >
                      {row}
                    </button>
                  ) : (
                    <div
                      className={`attr-row ${driver ? "is-filled" : ""}`}
                    >
                      {row}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="build-panel__progress">
            <span style={{ width: `${(lockedCount / 3) * 100}%` }} />
          </div>
          <p className="build-panel__count">{lockedCount} of 3 locked</p>
        </aside>
      </div>
    </section>
  );
}
