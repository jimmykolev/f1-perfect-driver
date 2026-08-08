import { useEffect, useMemo, useState } from "react";
import { BrandMark } from "@/components/BrandMark";
import { SoundToggle } from "@/components/SoundToggle";
import { playLockSound, playSpinSound } from "@/lib/sound";
import {
  PRINCIPAL_ATTRIBUTE_KEYS,
  PRINCIPAL_ATTRIBUTE_META,
} from "@/lib/teamPrincipalPool";
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

export function TeamPrincipalDraft() {
  const teamName = useTeamStore((s) => s.teamName);
  const principalPool = useTeamStore((s) => s.principalPool);
  const principalCurrent = useTeamStore((s) => s.principalCurrent);
  const principalSpinning = useTeamStore((s) => s.principalSpinning);
  const passesLeft = useTeamStore((s) => s.passesLeft);
  const spinPrincipal = useTeamStore((s) => s.spinPrincipal);
  const lockPrincipal = useTeamStore((s) => s.lockPrincipal);
  const passPrincipal = useTeamStore((s) => s.passPrincipal);
  const carOverall = useTeamStore((s) => s.carOverall);
  const reset = useTeamStore((s) => s.reset);
  const autoDraft = useTeamStore((s) => s.autoDraft);
  const setAutoDraft = useTeamStore((s) => s.setAutoDraft);
  const principal = useTeamStore((s) => s.principal);

  const canLock = Boolean(principalCurrent) && !principalSpinning;

  useEffect(() => {
    if (!autoDraft || principalSpinning || principal) return;
    const timer = window.setTimeout(() => {
      if (principalCurrent) {
        lockPrincipal();
        return;
      }
      spinPrincipal(true);
    }, 140);
    return () => window.clearTimeout(timer);
  }, [
    autoDraft,
    lockPrincipal,
    principal,
    principalCurrent,
    principalSpinning,
    spinPrincipal,
  ]);

  const nameAlts = useMemo(() => {
    const names = [...new Set(principalPool.map((p) => p.name))];
    return names.sort(() => Math.random() - 0.5).slice(0, 24);
  }, [principalPool]);

  const teamAlts = useMemo(() => {
    const teams = [...new Set(principalPool.flatMap((p) => p.teams))];
    return teams.sort(() => Math.random() - 0.5).slice(0, 20);
  }, [principalPool]);

  return (
    <section className="team-draft">
      <header className="team-draft__header">
        <div className="team-draft__identity">
          <BrandMark size="chrome" />
          <div>
            <p className="eyebrow">Perfect Team · Step 3 of 3</p>
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
        <li className="is-done">
          <span>02</span>
          <strong>Seats</strong>
        </li>
        <li className="is-on">
          <span>03</span>
          <strong>Principal</strong>
        </li>
      </ol>

      <div className="team-draft__stage">
        <div className="team-draft__spin">
          <div className="team-draft__spin-head">
            <p className="eyebrow">
              {principalCurrent && !principalSpinning
                ? "Sign your principal"
                : "Principal spin"}
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
            <p className="team-draft__hint">
              {autoDraft
                ? "Auto signing principal…"
                : passesLeft === 1
                  ? "1 pass left"
                  : `${passesLeft} passes left`}
            </p>
          </div>

          {principalCurrent && !principalSpinning ? (
            <div className="team-pick">
              <div className="team-pick__head">
                <div>
                  <p className="eyebrow">
                    {principalCurrent.startYear}–{principalCurrent.endYear}
                  </p>
                  <h2>{principalCurrent.name}</h2>
                  <p className="team-pick__drivers">
                    {principalCurrent.teams.slice(0, 3).join(" · ")}
                    {principalCurrent.teams.length > 3 ? "…" : ""}
                    {" · "}
                    {principalCurrent.yearsLed} seasons led
                  </p>
                </div>
                <div className="team-pick__ovr">
                  <span>OVR</span>
                  <strong className={ratingColor(principalCurrent.overall)}>
                    {principalCurrent.overall}
                  </strong>
                </div>
              </div>
              <p className="team-pick__prompt">
                Peak {principalCurrent.peakTeam} {principalCurrent.peakYear}
                <em>Whole-card lock</em>
              </p>
              <ul className="attr-list team-pick__attrs">
                {PRINCIPAL_ATTRIBUTE_KEYS.map((key) => {
                  const value = principalCurrent.attributes[key];
                  return (
                    <li key={key} className="attr-row is-filled">
                      <span className="attr-row__label">
                        {PRINCIPAL_ATTRIBUTE_META[key].label}
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
                        {principalCurrent.peakTeam} · {principalCurrent.peakYear}
                      </span>
                    </li>
                  );
                })}
              </ul>
              <div className="team-draft__actions team-draft__actions--pick">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => {
                    playLockSound();
                    lockPrincipal();
                  }}
                >
                  Sign principal
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={passPrincipal}
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
                  <p className="eyebrow">Principal</p>
                  <Reel
                    spinning={principalSpinning}
                    value={principalCurrent?.name ?? ""}
                    alternatives={nameAlts}
                  />
                </div>
                <div className="team-draft__reel">
                  <p className="eyebrow">Known for</p>
                  <Reel
                    spinning={principalSpinning}
                    value={principalCurrent?.peakTeam ?? ""}
                    alternatives={teamAlts}
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
                    spinPrincipal();
                  }}
                  disabled={principalSpinning || canLock}
                >
                  {principalSpinning ? "Spinning…" : "Spin principal"}
                </button>
              </div>

              <div className="team-pick team-pick--idle">
                <p>
                  {principalSpinning
                    ? "Landing on a team principal…"
                    : "Spin a real F1 team principal — ratings from constructor results during their tenure."}
                </p>
              </div>
            </>
          )}
        </div>

        <aside
          className="build-panel team-build-panel"
          aria-label="Principal build"
        >
          <div className="build-panel__head">
            <p className="eyebrow">Your principal</p>
            <div className="build-panel__ovr">
              <span>OVR</span>
              <strong
                className={
                  canLock ? ratingColor(principalCurrent!.overall) : ""
                }
              >
                {canLock ? principalCurrent!.overall : "—"}
              </strong>
            </div>
          </div>
          <ul className="attr-list">
            {PRINCIPAL_ATTRIBUTE_KEYS.map((key) => {
              const value = canLock
                ? principalCurrent!.attributes[key]
                : null;
              return (
                <li
                  key={key}
                  className={`attr-row ${value != null ? "is-filled" : ""}`}
                >
                  <span className="attr-row__label">
                    {PRINCIPAL_ATTRIBUTE_META[key].label}
                  </span>
                  {value != null ? (
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
                        {principalCurrent!.name}
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
            <span style={{ width: canLock ? "100%" : "0%" }} />
          </div>
          <p className="build-panel__count">
            {canLock ? "Ready to sign" : "0 of 1 locked"}
          </p>
        </aside>
      </div>
    </section>
  );
}
