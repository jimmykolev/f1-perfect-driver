import { useEffect, useMemo, useRef, useState } from "react";
import { playSeasonTickSound, playTitleBeatSound } from "@/lib/sound";
import { CareerDecision } from "@/components/CareerDecision";
import { previousTeamFor, SeasonRow } from "@/components/Career";
import { useGameStore } from "@/store/gameStore";
import { getChallenge, objectiveLabel } from "@/lib/challenges";

const SEASON_REVEAL_MS = 850;

export function CareerSimulation() {
  const driverName = useGameStore((s) => s.driverName);
  const seasons = useGameStore((s) => s.simulatedSeasons);
  const decision = useGameStore((s) => s.decision);
  const career = useGameStore((s) => s.career);
  const careerControl = useGameStore((s) => s.careerControl);
  const finishSimulation = useGameStore((s) => s.finishSimulation);
  const reset = useGameStore((s) => s.reset);
  const activeChallengeId = useGameStore((s) => s.activeChallengeId);
  const [revealedCount, setRevealedCount] = useState(0);
  const [openYear, setOpenYear] = useState<number | null>(null);
  /** Modal starts closed so the last season can be read first. */
  const [talksOpen, setTalksOpen] = useState(false);
  const latestSeasonRef = useRef<HTMLDivElement | null>(null);
  const prevRevealedCount = useRef(0);

  const reducedMotion = useMemo(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    [],
  );

  useEffect(() => {
    if (revealedCount >= seasons.length) return;
    if (reducedMotion) {
      setRevealedCount(seasons.length);
      return;
    }

    const timer = window.setTimeout(() => {
      setRevealedCount((count) => count + 1);
    }, SEASON_REVEAL_MS);
    return () => window.clearTimeout(timer);
  }, [reducedMotion, revealedCount, seasons]);

  useEffect(() => {
    const delta = revealedCount - prevRevealedCount.current;
    prevRevealedCount.current = revealedCount;
    if (delta !== 1) return;

    const season = seasons[revealedCount - 1];
    if (!season) return;
    if (season.champion) playTitleBeatSound();
    else playSeasonTickSound();
  }, [revealedCount, seasons]);

  useEffect(() => {
    setTalksOpen(false);
  }, [decision]);

  useEffect(() => {
    if (revealedCount <= 0) return;
    const node = latestSeasonRef.current;
    if (!node) return;
    node.scrollIntoView({
      behavior: reducedMotion ? "auto" : "smooth",
      block: "center",
    });
  }, [reducedMotion, revealedCount]);

  const visible = seasons.slice(0, revealedCount);
  const showingResults = revealedCount < seasons.length;
  const isAutopilot = careerControl === "autopilot";
  const talksReady =
    !isAutopilot && !showingResults && Boolean(decision);
  const totals = visible.reduce(
    (sum, season) => ({
      titles: sum.titles + (season.champion ? 1 : 0),
      wins: sum.wins + season.wins,
      podiums: sum.podiums + season.podiums,
      points: sum.points + season.points,
    }),
    { titles: 0, wins: 0, podiums: 0, points: 0 },
  );
  const nextSeason = seasons[revealedCount];
  const challenge = activeChallengeId ? getChallenge(activeChallengeId) : undefined;
  const objective = challenge?.objective;
  const objectiveMet = objective
    ? (() => {
        switch (objective.type) {
          case "winTitleByAge":
            return visible.some(
              (season) =>
                season.champion && season.age <= objective.age,
            );
          case "titlesAtLeast":
            return (
              visible.filter((season) => season.champion).length >=
              objective.count
            );
          case "championInYear":
            return visible.some(
              (season) =>
                season.year === objective.year && season.champion,
            );
          case "beatNamedH2H": {
            const meetings = visible.filter(
              (season) => season.rival?.name === objective.name,
            );
            return (
              meetings.length >= (objective.minMeetings ?? 1) &&
              meetings.filter((season) => season.rival?.beatThem).length >
                meetings.length / 2
            );
          }
        }
      })()
    : false;

  return (
    <section className="career-sim">
      <header className="career-sim__hero">
        <p className="eyebrow">
          Career replay · {isAutopilot ? "autopilot" : "decisions mode"}
        </p>
        <h1>{driverName || "Your Driver"}</h1>
        <p>
          {isAutopilot
            ? "Your full career is simulated — now watch it unfold season by season before the verdict. Open any year for races, standings, rivals, and winter moves."
            : "Your seasons are ready — watching them play out one by one. Open any year for races, standings, constructors, goals, rivals, and winter moves. Progress is saved in this browser if you refresh."}
        </p>
        {challenge ? (
          <p className="challenge-objective">
            <span>Objective</span>
            {objectiveLabel(challenge)}
            {objectiveMet ? " · Objective met" : ""}
          </p>
        ) : null}
      </header>

      <div className="record career-sim__record" aria-live="polite">
        <div className="record__item">
          <strong>{visible.length}</strong>
          <span>Seasons</span>
        </div>
        <div className="record__item">
          <strong>{totals.titles}</strong>
          <span>Titles</span>
        </div>
        <div className="record__item">
          <strong>{totals.wins}</strong>
          <span>Wins</span>
        </div>
        <div className="record__item">
          <strong>{totals.points}</strong>
          <span>Points</span>
        </div>
      </div>

      {showingResults ? (
        <div className="career-sim__loading" role="status">
          <span className="career-sim__pulse" aria-hidden />
          <div>
            <strong>Revealing {nextSeason?.year ?? "next season"}</strong>
            <p>
              Unpacking races, championship standings, the driver market, and
              winter moves…
            </p>
          </div>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setRevealedCount(seasons.length)}
          >
            Show all
          </button>
        </div>
      ) : null}

      <div className="season-list career-sim__seasons">
        {visible.map((season, index) => {
          const isLatest = index === visible.length - 1;
          return (
            <div
              key={season.year}
              ref={isLatest ? latestSeasonRef : null}
            >
              <SeasonRow
                season={season}
                previousTeam={previousTeamFor(seasons, season)}
                open={openYear === season.year}
                onToggle={() =>
                  setOpenYear((current) =>
                    current === season.year ? null : season.year,
                  )
                }
              />
            </div>
          );
        })}
      </div>

      {talksReady && !talksOpen ? (
        <div className="career-sim__talks-bar">
          <div>
            <strong>Decision ready</strong>
            <p>
              {decision?.pack.headline ?? "A career choice needs your call."}{" "}
              Review the seasons, then open the options.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setTalksOpen(true)}
          >
            Open decision
          </button>
        </div>
      ) : null}

      <CareerDecision
        open={talksReady && talksOpen}
        onDismiss={() => setTalksOpen(false)}
      />

      {!showingResults && career ? (
        <div className="career-sim__complete">
          <p className="eyebrow">Career complete</p>
          <h2>The final flag has fallen</h2>
          <p>
            {visible.length} seasons · {totals.titles} title
            {totals.titles === 1 ? "" : "s"} · {totals.wins} wins ·{" "}
            {totals.podiums} podiums
          </p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={finishSimulation}
          >
            View career verdict
          </button>
        </div>
      ) : null}

      <div className="career-sim__footer">
        <button type="button" className="btn btn-ghost" onClick={reset}>
          New driver
        </button>
      </div>
    </section>
  );
}
