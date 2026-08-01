import { useState } from "react";
import { CHALLENGES, objectiveLabel } from "@/lib/challenges";
import { useGameStore } from "@/store/gameStore";

export function ChallengeSelect() {
  const selectChallenge = useGameStore((state) => state.selectChallenge);
  const goToEraChoice = useGameStore((state) => state.goToEraChoice);
  const [selectedId, setSelectedId] = useState(CHALLENGES[0]?.id ?? "");
  const selected = CHALLENGES.find((challenge) => challenge.id === selectedId);

  return (
    <section className="challenge-select">
      <header className="challenge-select__hero">
        <p className="eyebrow">Challenge mode</p>
        <h1>Take a fixed shot</h1>
        <p>
          Each challenge locks the grid, season, and simulation seed. Build your
          driver, then beat the brief.
        </p>
      </header>

      <div className="challenge-select__grid" role="radiogroup" aria-label="Challenge">
        {CHALLENGES.map((challenge) => (
          <button
            key={challenge.id}
            type="button"
            role="radio"
            aria-checked={selectedId === challenge.id}
            className={`challenge-card ${
              selectedId === challenge.id ? "is-selected" : ""
            }`}
            onClick={() => setSelectedId(challenge.id)}
          >
            <span className="challenge-card__year">{challenge.startYear}</span>
            <strong>{challenge.title}</strong>
            <p>{challenge.blurb}</p>
            <em>{objectiveLabel(challenge)}</em>
            {challenge.debutTeam ? <small>Locked seat · {challenge.debutTeam}</small> : null}
          </button>
        ))}
      </div>

      <div className="challenge-select__actions">
        <button
          type="button"
          className="btn btn-primary"
          disabled={!selected}
          onClick={() => selected && selectChallenge(selected.id)}
        >
          {selected?.debutTeam ? "Start challenge" : "Choose debut seat"}
        </button>
        <button type="button" className="btn btn-ghost" onClick={goToEraChoice}>
          Free career instead
        </button>
      </div>
    </section>
  );
}
