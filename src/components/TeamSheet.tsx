import { useEffect } from "react";
import { BrandMark } from "@/components/BrandMark";
import { SoundToggle } from "@/components/SoundToggle";
import { playBuildCompleteSound } from "@/lib/sound";
import {
  CAR_ATTRIBUTE_KEYS,
  CAR_ATTRIBUTE_META,
  TEAM_SEAT_LABEL,
  TEAM_SEAT_ORDER,
} from "@/lib/teamCarPool";
import {
  PRINCIPAL_ATTRIBUTE_KEYS,
  PRINCIPAL_ATTRIBUTE_META,
} from "@/lib/teamPrincipalPool";
import { teamHeistCredits } from "@/lib/teamOutcome";
import { useTeamStore } from "@/store/teamStore";

function ratingColor(v: number) {
  if (v >= 90) return "text-rating-elite";
  if (v >= 80) return "text-rating-great";
  if (v >= 70) return "text-rating-good";
  return "text-ink-muted";
}

export function TeamSheet() {
  const teamName = useTeamStore((s) => s.teamName);
  const carLocked = useTeamStore((s) => s.carLocked);
  const seats = useTeamStore((s) => s.seats);
  const principal = useTeamStore((s) => s.principal);
  const carOverall = useTeamStore((s) => s.carOverall);
  const archetype = useTeamStore((s) => s.teamArchetypeLabel);
  const reset = useTeamStore((s) => s.reset);
  const start = useTeamStore((s) => s.start);
  const beginYearSelect = useTeamStore((s) => s.beginYearSelect);

  const byKey = Object.fromEntries(carLocked.map((l) => [l.key, l]));
  const ovr = carOverall();
  const heist = teamHeistCredits(carLocked);

  useEffect(() => {
    playBuildCompleteSound();
  }, []);

  return (
    <section className="team-draft team-draft--sheet">
      <header className="team-draft__header">
        <div className="team-draft__identity">
          <BrandMark size="chrome" />
          <div>
            <p className="eyebrow">Perfect Team · Roster locked</p>
            <h1>{teamName || "Your team"}</h1>
          </div>
        </div>
        <div className="team-draft__tools">
          <SoundToggle />
        </div>
      </header>

      <div className="team-sheet-reveal">
        <p className="eyebrow">Build complete</p>
        <h2>{archetype || "Constructor heist"}</h2>
        <p>
          {heist ? `Car DNA · ${heist}. ` : ""}
          {seats.first && seats.second
            ? `${seats.first.name} and ${seats.second.name} on race seats`
            : "Race seats locked"}
          {seats.reserve ? `, ${seats.reserve.name} in reserve` : ""}
          {principal ? `, ${principal.name} on the pit wall` : ""}.
        </p>
      </div>

      <div className="team-sheet-board">
        <section className="team-sheet-board__car">
          <div className="team-sheet-board__label">
            <p className="eyebrow">The car</p>
            <strong className={ratingColor(ovr)}>OVR {ovr}</strong>
          </div>
          <ul className="attr-list">
            {CAR_ATTRIBUTE_KEYS.map((key) => {
              const item = byKey[key];
              if (!item) return null;
              return (
                <li key={key} className="attr-row is-filled">
                  <span className="attr-row__label">
                    {CAR_ATTRIBUTE_META[key].label}
                  </span>
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
                </li>
              );
            })}
          </ul>
        </section>

        <section className="team-sheet-board__seats">
          <p className="eyebrow">The seats</p>
          <ul>
            {TEAM_SEAT_ORDER.map((id) => {
              const driver = seats[id];
              if (!driver) return null;
              return (
                <li key={id}>
                  <span className="eyebrow">{TEAM_SEAT_LABEL[id]}</span>
                  <strong>{driver.name}</strong>
                  <em>
                    {driver.year} · {driver.team}
                  </em>
                  <b className={ratingColor(driver.overall)}>
                    {driver.overall}
                  </b>
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      {principal ? (
        <section className="team-sheet-principal">
          <div className="team-sheet-principal__head">
            <div>
              <p className="eyebrow">Team principal</p>
              <h2>{principal.name}</h2>
              <p className="team-pick__drivers">
                {principal.teams.slice(0, 3).join(" · ")}
                {" · "}
                {principal.startYear}–{principal.endYear}
              </p>
            </div>
            <div className="team-pick__ovr">
              <span>OVR</span>
              <strong className={ratingColor(principal.overall)}>
                {principal.overall}
              </strong>
            </div>
          </div>
          <ul className="attr-list">
            {PRINCIPAL_ATTRIBUTE_KEYS.map((key) => {
              const value = principal.attributes[key];
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
                    Leadership, strategy, and development shape the chase.
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <div className="team-sheet-board__actions">
        <button
          type="button"
          className="btn btn-primary"
          onClick={beginYearSelect}
        >
          Chase a season
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => start()}>
          New team
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => reset()}>
          Back to Perfect Grid
        </button>
      </div>
      <p className="team-sheet-board__note">
        Pick any year. Race by race. Win only if your team takes every grand
        prix. Reserve covers crash outs; your principal tilts strategy and
        development.
      </p>
    </section>
  );
}
