import { useEffect, useState } from "react";
import { TeamRaceRow } from "@/components/TeamSeasonRun";
import { playVerdictSound } from "@/lib/sound";
import { TEAM_GRADE_META } from "@/lib/teamOutcome";
import { teamHeistCredits } from "@/lib/teamOutcome";
import { copyText } from "@/lib/shareCard";
import {
  downloadTeamCard,
  shareTeamResult,
  teamShareText,
} from "@/lib/teamShare";
import { useTeamStore } from "@/store/teamStore";

export function TeamSeasonResult() {
  const teamName = useTeamStore((s) => s.teamName);
  const seasonResult = useTeamStore((s) => s.seasonResult);
  const archetype = useTeamStore((s) => s.teamArchetypeLabel);
  const carLocked = useTeamStore((s) => s.carLocked);
  const retrySeason = useTeamStore((s) => s.retrySeason);
  const backToSheet = useTeamStore((s) => s.backToSheet);
  const start = useTeamStore((s) => s.start);
  const reset = useTeamStore((s) => s.reset);
  const [openRound, setOpenRound] = useState<number | null>(null);
  const [shareNote, setShareNote] = useState<string | null>(null);
  const [reveal, setReveal] = useState(false);

  useEffect(() => {
    if (!seasonResult) return;
    playVerdictSound(
      seasonResult.grade === "perfect"
        ? "legend"
        : seasonResult.grade === "nearMiss"
          ? "champion"
          : seasonResult.grade === "contender"
            ? "raceWinner"
            : "pointsRegular",
    );
    const t = window.setTimeout(() => setReveal(true), 180);
    return () => window.clearTimeout(t);
  }, [seasonResult]);

  if (!seasonResult) return null;

  const misses = seasonResult.calendarLength - seasonResult.teamWins;
  const heist = teamHeistCredits(carLocked);
  const gradeColor = TEAM_GRADE_META[seasonResult.grade]?.color;

  return (
    <section className="career-sim team-season-result">
      <header className="career-sim__hero">
        <p className="eyebrow">Season verdict · {seasonResult.year}</p>
        <h1>{teamName || seasonResult.teamName}</h1>
        <p>{archetype || "Constructor heist"}</p>
      </header>

      <div
        className={`career-sim__complete team-season-result__grade ${
          reveal ? "is-in" : "is-waiting"
        }`}
        style={{ borderColor: gradeColor }}
      >
        <p className="eyebrow">{seasonResult.gradeLabel}</p>
        <h2>
          {seasonResult.perfect
            ? "Perfect season"
            : seasonResult.grade === "nearMiss"
              ? "One race short"
              : "Not this year"}
        </h2>
        <p>{seasonResult.summary}</p>
        {seasonResult.brokenAtRound != null ? (
          <p className="team-season-result__villain">
            Defining miss · Round {seasonResult.brokenAtRound}{" "}
            {seasonResult.races[seasonResult.brokenAtRound - 1]?.name}
          </p>
        ) : null}
      </div>

      <div className="record career-sim__record">
        <div className="record__item">
          <strong>{seasonResult.calendarLength}</strong>
          <span>Races</span>
        </div>
        <div className="record__item">
          <strong>{seasonResult.teamWins}</strong>
          <span>Wins</span>
        </div>
        <div className="record__item">
          <strong>{misses}</strong>
          <span>Missed</span>
        </div>
        <div className="record__item">
          <strong>{seasonResult.reserveAppearances || "—"}</strong>
          <span>Reserve</span>
        </div>
      </div>

      <div className="team-sheet-board__actions">
        <button
          type="button"
          className="btn btn-primary"
          onClick={async () => {
            const result = await shareTeamResult({
              teamName: teamName || seasonResult.teamName,
              result: seasonResult,
              archetype: archetype || "Constructor heist",
              heist,
            });
            setShareNote(
              result === "shared"
                ? "Shared."
                : result === "copied"
                  ? "Copied share text."
                  : "Card downloaded.",
            );
          }}
        >
          Share result
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={async () => {
            const ok = await copyText(
              teamShareText({
                teamName: teamName || seasonResult.teamName,
                result: seasonResult,
                archetype: archetype || "Constructor heist",
                heist,
              }),
            );
            setShareNote(ok ? "Copied." : "Could not copy.");
          }}
        >
          Copy text
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() =>
            downloadTeamCard({
              teamName: teamName || seasonResult.teamName,
              result: seasonResult,
              archetype: archetype || "Constructor heist",
            })
          }
        >
          Save card
        </button>
      </div>
      {shareNote ? (
        <p className="landing__mode-note" role="status">
          {shareNote}
        </p>
      ) : null}

      <div className="season-list career-sim__seasons">
        {seasonResult.races.map((race) => (
          <TeamRaceRow
            key={race.round}
            race={race}
            open={openRound === race.round}
            onToggle={() =>
              setOpenRound((current) =>
                current === race.round ? null : race.round,
              )
            }
          />
        ))}
      </div>

      <div className="career-sim__footer">
        <button type="button" className="btn btn-primary" onClick={retrySeason}>
          Try another year
        </button>
        <button type="button" className="btn btn-ghost" onClick={backToSheet}>
          Back to roster
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => start()}>
          New team
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => reset()}>
          Back to Perfect Grid
        </button>
      </div>
    </section>
  );
}
