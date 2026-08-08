import { useEffect, useMemo, useRef, useState } from "react";
import {
  playNearMissSound,
  playSeasonTickSound,
  playTitleBeatSound,
} from "@/lib/sound";
import type { TeamRaceRound, TeamSeatResult } from "@/lib/teamSeason";
import { useTeamStore } from "@/store/teamStore";

const RACE_REVEAL_MS = 850;

function finishLabel(seat: TeamSeatResult) {
  if (seat.dnf || seat.finish == null) return "DNF";
  return `P${seat.finish}`;
}

function seatResultKey(seat: TeamSeatResult) {
  if (seat.dnf || seat.finish == null) return "dnf";
  if (seat.win) return "win";
  if (seat.podium) return "podium";
  if (seat.points > 0) return "points";
  return "none";
}

function SeatFormStrip({ race }: { race: TeamRaceRound }) {
  const seats = [race.first, race.second];
  return (
    <span className="form-strip" aria-hidden>
      {seats.map((seat) => (
        <i
          key={seat.seat}
          className={`form-strip__cell is-${seatResultKey(seat)}`}
          title={`${seat.name} — ${finishLabel(seat)}`}
        />
      ))}
    </span>
  );
}

export function TeamRaceRow({
  race,
  open,
  onToggle,
}: {
  race: TeamRaceRound;
  open: boolean;
  onToggle: () => void;
}) {
  const teamPts = race.first.points + race.second.points;
  const posLabel = race.teamWon ? "Win" : "Miss";
  const formSummary = `${finishLabel(race.first)} · ${finishLabel(race.second)}`;

  return (
    <article
      className={`season ${race.teamWon ? "is-champion" : "is-transfer"} ${
        open ? "is-open" : ""
      }`}
    >
      <button
        type="button"
        className="season__summary"
        onClick={onToggle}
        aria-expanded={open}
        aria-label={`Round ${race.round}, ${race.name}, ${posLabel}, ${formSummary}`}
      >
        <span className="season__year">R{race.round}</span>
        <span className="season__team">
          <span className="season__route">{race.name}</span>
        </span>
        <span className="season__pos">{posLabel}</span>
        <span className="season__pts">
          {teamPts}
          <small>pts</small>
        </span>
        <span className="season__form-text" aria-hidden>
          {formSummary}
        </span>
        <SeatFormStrip race={race} />
        <span className="season__chev" aria-hidden>
          {open ? "−" : "+"}
        </span>
      </button>

      {open ? (
        <div className="season__detail">
          <p className="season__thesis">{race.beat}</p>
          <div className="dtable-wrap">
            <table className="dtable">
              <thead>
                <tr>
                  <th>Seat</th>
                  <th>Driver</th>
                  <th className="num">Grid</th>
                  <th className="num">Finish</th>
                  <th className="num">Pts</th>
                </tr>
              </thead>
              <tbody>
                {([race.first, race.second] as const).map((seat) => (
                  <tr
                    key={seat.seat}
                    className={`is-${seatResultKey(seat)} is-you`}
                  >
                    <td className="muted">
                      {seat.seat === "first" ? "1st" : "2nd"}
                      {seat.reserve ? (
                        <em className="tag tag--return">Reserve</em>
                      ) : null}
                    </td>
                    <td>
                      {seat.name}
                      {seat.win ? (
                        <em className="tag tag--you">Win</em>
                      ) : null}
                    </td>
                    <td className="num">
                      {seat.grid}
                      {seat.pole ? (
                        <em className="tag tag--gold">Pole</em>
                      ) : null}
                    </td>
                    <td className="num strong">{finishLabel(seat)}</td>
                    <td className="num">{seat.points || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </article>
  );
}

export function TeamSeasonRun() {
  const teamName = useTeamStore((s) => s.teamName);
  const seasonResult = useTeamStore((s) => s.seasonResult);
  const revealedCount = useTeamStore((s) => s.seasonRevealCount);
  const setSeasonRevealCount = useTeamStore((s) => s.setSeasonRevealCount);
  const finishSeason = useTeamStore((s) => s.finishSeason);
  const reset = useTeamStore((s) => s.reset);

  const [openRound, setOpenRound] = useState<number | null>(null);
  const latestRaceRef = useRef<HTMLDivElement | null>(null);
  const prevRevealedCount = useRef(revealedCount);

  const reducedMotion = useMemo(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    [],
  );

  const races = seasonResult?.races ?? [];
  const total = races.length;

  useEffect(() => {
    if (revealedCount >= total) return;
    if (reducedMotion) {
      setSeasonRevealCount(total);
      return;
    }

    const timer = window.setTimeout(() => {
      setSeasonRevealCount(revealedCount + 1);
    }, RACE_REVEAL_MS);
    return () => window.clearTimeout(timer);
  }, [reducedMotion, revealedCount, setSeasonRevealCount, total]);

  useEffect(() => {
    if (!seasonResult) return;
    const delta = revealedCount - prevRevealedCount.current;
    prevRevealedCount.current = revealedCount;
    if (delta !== 1) return;

    const race = races[revealedCount - 1];
    if (!race) return;
    if (race.teamWon) {
      const lastAndPerfect =
        revealedCount === total && seasonResult.perfect;
      if (lastAndPerfect) playTitleBeatSound();
      else playSeasonTickSound();
    } else if (seasonResult.brokenAtRound === race.round) {
      playNearMissSound();
    } else {
      playSeasonTickSound();
    }
  }, [races, revealedCount, seasonResult, total]);

  useEffect(() => {
    if (revealedCount <= 0) return;
    const node = latestRaceRef.current;
    if (!node) return;
    node.scrollIntoView({
      behavior: reducedMotion ? "auto" : "smooth",
      block: "center",
    });
  }, [reducedMotion, revealedCount]);

  if (!seasonResult) return null;

  const visible = races.slice(0, revealedCount);
  const showingResults = revealedCount < total;
  const nextRace = races[revealedCount];
  const winsSoFar = visible.filter((r) => r.teamWon).length;
  const teamPts = visible.reduce(
    (sum, race) => sum + race.first.points + race.second.points,
    0,
  );
  const missesSoFar = visible.length - winsSoFar;
  const latest = visible[visible.length - 1] ?? null;

  return (
    <section className="career-sim team-season-run">
      <header className="career-sim__hero">
        <p className="eyebrow">
          Season replay · {seasonResult.year} chase
        </p>
        <h1>{teamName || seasonResult.teamName}</h1>
        <p>
          Your full season is simulated — watch it unfold race by race.
          Principal and reserve choices are live. Win only if your team takes
          every grand prix.
        </p>
      </header>

      <div className="record career-sim__record" aria-live="polite">
        <div className="record__item">
          <strong>{visible.length}</strong>
          <span>Races</span>
        </div>
        <div className="record__item">
          <strong>{winsSoFar}</strong>
          <span>Wins</span>
        </div>
        <div className="record__item">
          <strong>{missesSoFar}</strong>
          <span>Missed</span>
        </div>
        <div className="record__item">
          <strong>{teamPts}</strong>
          <span>Points</span>
        </div>
      </div>

      {showingResults ? (
        <div className="career-sim__loading" role="status">
          <span className="career-sim__pulse" aria-hidden />
          <div>
            <strong>Revealing {nextRace?.name ?? "next race"}</strong>
            <p>
              {latest?.beat ??
                "Unpacking both cars, the race winner, and your sweep streak…"}
            </p>
          </div>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setSeasonRevealCount(total)}
          >
            Show all
          </button>
        </div>
      ) : null}

      {latest ? (
        <p className="team-season-run__live-beat" aria-live="polite">
          {latest.beat}
        </p>
      ) : null}

      <div className="season-list career-sim__seasons">
        {visible.map((race, index) => {
          const isLatest = index === visible.length - 1;
          return (
            <div key={race.round} ref={isLatest ? latestRaceRef : null}>
              <TeamRaceRow
                race={race}
                open={openRound === race.round}
                onToggle={() =>
                  setOpenRound((current) =>
                    current === race.round ? null : race.round,
                  )
                }
              />
            </div>
          );
        })}
      </div>

      {!showingResults ? (
        <div className="career-sim__complete">
          <p className="eyebrow">Season complete</p>
          <h2>The final flag has fallen</h2>
          <p>
            {visible.length} races · {winsSoFar} wins · {missesSoFar} missed
            {seasonResult.brokenAtRound != null
              ? ` · first miss round ${seasonResult.brokenAtRound}`
              : ""}
            {seasonResult.reserveAppearances
              ? ` · reserve used ${seasonResult.reserveAppearances}×`
              : ""}
          </p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={finishSeason}
          >
            View season verdict
          </button>
        </div>
      ) : null}

      <div className="career-sim__footer">
        <button type="button" className="btn btn-ghost" onClick={reset}>
          New team
        </button>
      </div>
    </section>
  );
}
