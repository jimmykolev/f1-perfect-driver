import { useEffect, useState } from "react";
import { RatingsGuideButton } from "@/components/RatingsGuide";
import { buildExpertScorecard, pickGradeLabel } from "@/lib/expertScore";
import { archetypeFrom, emptyAttributes } from "@/lib/game";
import { isLegendSeason } from "@/lib/era";
import { playBuildCompleteSound } from "@/lib/sound";
import { buildShareText, copyText } from "@/lib/shareCard";
import { useGameStore } from "@/store/gameStore";
import {
  ATTRIBUTE_KEYS,
  ATTRIBUTE_META,
  type AttributeKey,
  type LockedAttribute,
} from "@/types";

function ratingColor(v: number) {
  if (v >= 90) return "text-rating-elite";
  if (v >= 80) return "text-rating-great";
  if (v >= 70) return "text-rating-good";
  return "text-ink-muted";
}

export function Reveal() {
  const driverName = useGameStore((s) => s.driverName);
  const locked = useGameStore((s) => s.locked);
  const goToEraChoice = useGameStore((s) => s.goToEraChoice);
  const reset = useGameStore((s) => s.reset);
  const expertMode = useGameStore((s) => s.expertMode);
  const traits = useGameStore((s) => s.traits);
  const buildOverall = useGameStore((s) => s.buildOverall);
  const careerControl = useGameStore((s) => s.careerControl);
  const setCareerControl = useGameStore((s) => s.setCareerControl);
  const decisionDensity = useGameStore((s) => s.decisionDensity);
  const setDecisionDensity = useGameStore((s) => s.setDecisionDensity);
  const weeklyWeekKey = useGameStore((s) => s.weeklyWeekKey);
  const [copyState, setCopyState] = useState<"idle" | "ok" | "fail">("idle");

  useEffect(() => {
    playBuildCompleteSound();
  }, []);

  const attrs = emptyAttributes();
  for (const item of locked) attrs[item.key] = item.value;
  const overall = buildOverall();
  const archetype = archetypeFrom(attrs);
  const byKey = Object.fromEntries(locked.map((l) => [l.key, l])) as Partial<
    Record<AttributeKey, LockedAttribute>
  >;

  const ordered = [...ATTRIBUTE_KEYS].sort((a, b) => attrs[b] - attrs[a]);
  const legendCount = locked.filter((item) =>
    isLegendSeason(item.from.year, item.from.name),
  ).length;
  const scorecard = expertMode ? buildExpertScorecard(locked) : null;

  return (
    <section className="reveal">
      <header className="reveal__hero">
        <p className="eyebrow">
          {weeklyWeekKey
            ? `Weekly Grid · ${weeklyWeekKey}`
            : expertMode
              ? "Perfect Driver · Expert"
              : "Perfect Driver"}
        </p>
        <h1 className="reveal__name">{driverName}</h1>
        <div className="reveal__headline">
          <div>
            <p className="reveal__archetype">{archetype}</p>
            {legendCount > 0 ? (
              <p className="reveal__legend-note">
                {legendCount} legend attribute
                {legendCount === 1 ? "" : "s"} in the DNA
              </p>
            ) : null}
          </div>
          <div className="reveal__ovr">
            <span>Overall</span>
            <strong className={ratingColor(overall)}>{overall}</strong>
          </div>
        </div>
      </header>

      {traits.length ? (
        <ul className="trait-chips reveal__traits">
          {traits.map((trait) => (
            <li key={trait.id} title={trait.blurb}>
              {trait.name}
            </li>
          ))}
        </ul>
      ) : null}

      {scorecard ? (
        <div className="scorecard">
          <div className="scorecard__head">
            <p className="eyebrow">Expert scorecard</p>
            <p className="scorecard__headline">{scorecard.headline}</p>
            <p className="scorecard__meta">
              {scorecard.steals} steals · {scorecard.misses} misses · avg rank #
              {scorecard.averageRank.toFixed(1)}
            </p>
          </div>
          <ul className="scorecard__list">
            {scorecard.picks.map((pick) => (
              <li key={pick.key} className={`is-${pick.grade}`}>
                <span>{pickGradeLabel(pick.key)}</span>
                <strong className={ratingColor(pick.value)}>{pick.value}</strong>
                <em>
                  #{pick.seasonRank} on card · {pick.label}
                </em>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <ul className="dna-list">
        {ordered.map((key) => {
          const item = byKey[key];
          const value = attrs[key];
          const legend = item
            ? isLegendSeason(item.from.year, item.from.name)
            : false;
          return (
            <li key={key} className={legend ? "is-legend" : ""}>
              <span className="dna-list__label">{ATTRIBUTE_META[key].label}</span>
              <span className="dna-list__bar">
                <i style={{ width: `${value}%` }} className={ratingColor(value)} />
              </span>
              <strong className={`dna-list__val ${ratingColor(value)}`}>
                {value}
              </strong>
              <span className="dna-list__source">
                {item ? (
                  <>
                    Stolen · {item.from.name} · {item.from.year}
                    {legend ? <em className="tag tag--gold">Legend</em> : null}
                  </>
                ) : (
                  "—"
                )}
              </span>
            </li>
          );
        })}
      </ul>

      <div className="reveal__actions">
        <button type="button" className="btn btn-primary" onClick={goToEraChoice}>
          Start career
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={async () => {
            const text = buildShareText(
              driverName,
              overall,
              archetype,
              traits,
              weeklyWeekKey,
            );
            const ok = await copyText(text);
            setCopyState(ok ? "ok" : "fail");
            window.setTimeout(() => setCopyState("idle"), 1600);
          }}
        >
          {copyState === "ok"
            ? "Copied"
            : copyState === "fail"
              ? "Couldn't copy"
              : "Copy build"}
        </button>
        <button type="button" className="btn btn-ghost" onClick={reset}>
          New driver
        </button>
        <RatingsGuideButton className="ratings-guide-trigger--btn" />
      </div>

      <details className="reveal__advanced">
        <summary>Advanced · decide seats yourself</summary>
        <p className="career-control__lede">
          Default is Autopilot — one-shot career, market picks the seats. Open
          this only if you want mid-career contract calls.
        </p>
        <fieldset className="career-control">
          <legend className="eyebrow">Career control</legend>
          <div
            className="career-control__options"
            role="radiogroup"
            aria-label="Career control"
          >
            <button
              type="button"
              role="radio"
              aria-checked={careerControl === "autopilot"}
              className={`career-control__option ${
                careerControl === "autopilot" ? "is-selected" : ""
              }`}
              onClick={() => setCareerControl("autopilot")}
            >
              <strong>Autopilot</strong>
              <span>One-shot career. The market picks your seats.</span>
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={careerControl === "decisions"}
              className={`career-control__option ${
                careerControl === "decisions" ? "is-selected" : ""
              }`}
              onClick={() => setCareerControl("decisions")}
            >
              <strong>Decide your seats</strong>
              <span>Pause mid-career for contract talks.</span>
            </button>
          </div>
        </fieldset>

        {careerControl === "decisions" ? (
          <fieldset className="career-control career-density">
            <legend className="eyebrow">Decision density</legend>
            <div
              className="career-control__options career-density__options"
              role="radiogroup"
              aria-label="Decision density"
            >
              <button
                type="button"
                role="radio"
                aria-checked={decisionDensity === "low"}
                className={`career-control__option ${
                  decisionDensity === "low" ? "is-selected" : ""
                }`}
                onClick={() => setDecisionDensity("low")}
              >
                <strong>Sparse</strong>
                <span>Hard winters only.</span>
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={decisionDensity === "medium"}
                className={`career-control__option ${
                  decisionDensity === "medium" ? "is-selected" : ""
                }`}
                onClick={() => setDecisionDensity("medium")}
              >
                <strong>Story</strong>
                <span>Balanced pace.</span>
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={decisionDensity === "high"}
                className={`career-control__option ${
                  decisionDensity === "high" ? "is-selected" : ""
                }`}
                onClick={() => setDecisionDensity("high")}
              >
                <strong>Busy</strong>
                <span>Full cadence.</span>
              </button>
            </div>
          </fieldset>
        ) : null}
      </details>
    </section>
  );
}
