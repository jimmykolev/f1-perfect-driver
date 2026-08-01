import { useEffect, useState } from "react";
import { AltHistoryButton } from "@/components/AltHistory";
import { CareerMuseum } from "@/components/CareerMuseum";
import { TeamMove } from "@/components/careerUi";
import { useGameStore } from "@/store/gameStore";
import { hasAlternateHistory } from "@/lib/altHistory";
import { rivalSeasonLine } from "@/lib/drama";
import { seatNoteKind } from "@/lib/careerStory";
import { getChallenge } from "@/lib/challenges";
import { isLegendSeason } from "@/lib/era";
import {
  playChallengeClearedSound,
  playChallengeFailedSound,
  playVerdictSound,
} from "@/lib/sound";
import {
  careerShareText,
  copyText,
  downloadCareerCard,
} from "@/lib/shareCard";
import {
  ATTRIBUTE_META,
  type ConstructorEntry,
  type OffseasonNote,
  type RaceResult,
  type SeasonResult,
  type StandingEntry,
} from "@/types";

type ResultsView = "museum" | "log";

const TIER_CLASS: Record<string, string> = {
  legend: "tier-legend",
  champion: "tier-champion",
  raceWinner: "tier-winner",
  podiumThreat: "tier-podium",
  pointsRegular: "tier-points",
  nobody: "tier-nobody",
};

type SeasonTab = "races" | "wdc" | "wcc" | "winter";

const RESULT_LEGEND = [
  { key: "win", label: "Win" },
  { key: "podium", label: "Podium" },
  { key: "points", label: "Points" },
  { key: "none", label: "No points" },
  { key: "dnf", label: "DNF" },
] as const;

function resultKey(race: RaceResult) {
  if (race.dnf || race.finish == null) return "dnf";
  if (race.win) return "win";
  if (race.podium) return "podium";
  if (race.points > 0) return "points";
  return "none";
}

function finishLabel(race: RaceResult) {
  if (race.dnf || race.finish == null) return "DNF";
  return `P${race.finish}`;
}

/** One cell per round: the shape of a season without reading a single number. */
function FormStrip({ races }: { races: RaceResult[] }) {
  return (
    <span className="form-strip" aria-hidden>
      {races.map((race) => (
        <i
          key={race.round}
          className={`form-strip__cell is-${resultKey(race)}`}
          title={`R${race.round} ${race.name} — ${finishLabel(race)}`}
        />
      ))}
    </span>
  );
}

function RaceTable({ races }: { races: RaceResult[] }) {
  return (
    <div className="dtable-wrap">
      <table className="dtable">
        <thead>
          <tr>
            <th className="num">Rd</th>
            <th>Grand Prix</th>
            <th className="num">Grid</th>
            <th className="num">Finish</th>
            <th className="num">Pts</th>
          </tr>
        </thead>
        <tbody>
          {races.map((race) => (
            <tr key={race.round} className={`is-${resultKey(race)}`}>
              <td className="num muted">{race.round}</td>
              <td>{race.name}</td>
              <td className="num">
                {race.grid}
                {race.pole ? <em className="tag tag--gold">Pole</em> : null}
              </td>
              <td className="num strong">{finishLabel(race)}</td>
              <td className="num">
                {race.points || "—"}
                {race.sprintPoints > 0 ? (
                  <em className="tag">+{race.sprintPoints} spr</em>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StandingsTable({
  standings,
  rivalName = null,
}: {
  standings: StandingEntry[];
  rivalName?: string | null;
}) {
  return (
    <div className="dtable-wrap">
      <table className="dtable">
        <thead>
          <tr>
            <th className="num">Pos</th>
            <th>Driver</th>
            <th>Team</th>
            <th className="num hide-sm">Poles</th>
            <th className="num">Wins</th>
            <th className="num">Podiums</th>
            <th className="num">Pts</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((row) => (
            <tr
              key={`${row.position}-${row.name}`}
              className={`${row.position === 1 ? "is-win" : ""} ${
                row.isPlayer ? "is-you" : ""
              } ${
                rivalName && row.name === rivalName ? "is-rival" : ""
              }`}
            >
              <td className="num muted">{row.position}</td>
              <td>
                {row.name}
                <em className="age">{row.age}</em>
                {row.isPlayer ? <em className="tag tag--you">You</em> : null}
                {rivalName && row.name === rivalName ? (
                  <em className="tag tag--rival">Rival</em>
                ) : null}
              </td>
              <td className="muted">{row.team}</td>
              <td className="num hide-sm">{row.poles || "—"}</td>
              <td className="num">{row.wins || "—"}</td>
              <td className="num">{row.podiums || "—"}</td>
              <td className="num strong">{row.points}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ConstructorsTable({
  constructors,
}: {
  constructors: ConstructorEntry[];
}) {
  const best = constructors[0]?.points || 1;

  return (
    <div className="dtable-wrap">
      <table className="dtable">
        <thead>
          <tr>
            <th className="num">Pos</th>
            <th>Constructor</th>
            <th className="num">Wins</th>
            <th>Season</th>
            <th className="num">Pts</th>
          </tr>
        </thead>
        <tbody>
          {constructors.map((row) => (
            <tr
              key={row.team}
              className={`${row.position === 1 ? "is-win" : ""} ${
                row.isPlayerTeam ? "is-you" : ""
              }`}
            >
              <td className="num muted">{row.position}</td>
              <td>
                {row.team}
                {row.isPlayerTeam ? <em className="tag tag--you">You</em> : null}
              </td>
              <td className="num">{row.wins || "—"}</td>
              <td className="bar-cell">
                <span
                  className="bar"
                  style={{ width: `${Math.max(2, (row.points / best) * 100)}%` }}
                />
              </td>
              <td className="num strong">{row.points}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function WinterList({ note }: { note: OffseasonNote | null }) {
  if (!note) {
    return <p className="detail-empty">Career ended here — no winter to report.</p>;
  }

  const rebrands = note.moves.filter((item) => / becomes /.test(item));
  const moves = note.moves.filter((item) => !/ becomes /.test(item));
  const groups = [
    { label: "Retired", items: note.retirements },
    { label: "Promoted", items: note.promotions },
    { label: "Moved", items: moves },
    { label: "Team changes", items: rebrands },
    { label: "Out of a seat", items: note.departures },
  ].filter((group) => group.items.length > 0);

  if (!groups.length) {
    return <p className="detail-empty">A quiet winter — the grid stayed put.</p>;
  }

  return (
    <div className="winter">
      {groups.map((group) => (
        <div key={group.label} className="winter__group">
          <h4>{group.label}</h4>
          <ul>
            {group.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

export function previousTeamFor(
  seasons: SeasonResult[],
  season: SeasonResult,
): string | null {
  const idx = seasons.findIndex((row) => row.year === season.year);
  return idx > 0 ? seasons[idx - 1]!.team : null;
}

export function SeasonRow({
  season,
  previousTeam = null,
  open,
  onToggle,
}: {
  season: SeasonResult;
  /** Team from the prior season; null on debut. */
  previousTeam?: string | null;
  open: boolean;
  onToggle: () => void;
}) {
  const [tab, setTab] = useState<SeasonTab>("races");

  const tabs: { id: SeasonTab; label: string }[] = [
    { id: "races", label: "Races" },
    { id: "wdc", label: "Drivers" },
    { id: "wcc", label: "Teams" },
    { id: "winter", label: "Winter" },
  ];

  const formSummary = `${season.wins}W · ${season.dnfs} DNF${
    season.dnfs === 1 ? "" : "s"
  }`;
  const posLabel = season.champion ? "Champion" : `P${season.position}`;
  const transferred = previousTeam != null && previousTeam !== season.team;
  const debut = previousTeam == null;
  const noteKind = seatNoteKind(season.seatNote);
  const seatLabel = transferred
    ? `moved from ${previousTeam} to ${season.team}`
    : season.team;

  return (
    <article
      className={`season ${season.champion ? "is-champion" : ""} ${
        transferred ? "is-transfer" : ""
      } ${noteKind === "number2" ? "is-role" : ""} ${
        noteKind === "return" ? "is-return" : ""
      } ${open ? "is-open" : ""}`}
    >
      <button
        type="button"
        className="season__summary"
        onClick={onToggle}
        aria-expanded={open}
        aria-label={`${season.year}, ${seatLabel}, ${posLabel}, ${season.points} points, ${formSummary}`}
      >
        <span className="season__year">{season.year}</span>
        <span className="season__team">
          <i className={`tier-dot tier-${season.teamTier}`} aria-hidden />
          {transferred && previousTeam ? (
            <span className="season__route">
              <TeamMove from={previousTeam} to={season.team} />
              {noteKind === "number2" ? (
                <em className="tag tag--role">#2</em>
              ) : null}
              {noteKind === "return" ? (
                <em className="tag tag--return">Return</em>
              ) : null}
            </span>
          ) : (
            <span className="season__route">
              {season.team}
              {debut ? <em className="tag tag--debut">Debut</em> : null}
              {noteKind === "return" ? (
                <em className="tag tag--return">Return</em>
              ) : null}
            </span>
          )}
        </span>
        <span className="season__pos">{posLabel}</span>
        <span className="season__pts">
          {season.points}
          <small>pts</small>
        </span>
        <span className="season__form-text" aria-hidden>
          {formSummary}
        </span>
        <FormStrip races={season.races} />
        <span className="season__chev" aria-hidden>
          {open ? "−" : "+"}
        </span>
      </button>

      {open ? (
        <div className="season__detail">
          {season.seatNote ? (
            <p
              className={`season__note ${
                noteKind === "number2"
                  ? "is-role"
                  : noteKind === "return"
                    ? "is-return"
                    : transferred
                      ? "is-transfer"
                      : ""
              }`}
            >
              <span>
                {noteKind === "number2"
                  ? "#2 seat"
                  : noteKind === "return"
                    ? "Return"
                    : "Seat"}
              </span>
              {season.seatNote}
            </p>
          ) : transferred && previousTeam ? (
            <p className="season__transfer">
              <span>Team move</span>
              <TeamMove from={previousTeam} to={season.team} showTag={false} />
              {season.replacedDriver
                ? `Took ${season.replacedDriver}'s seat.`
                : null}
            </p>
          ) : null}

          <p className="season__thesis">
            {season.champion
              ? "World Champion."
              : `${season.championName} took the title.`}
            {season.goal
              ? ` Goal: ${season.goal.label} — ${season.goal.met ? "done" : "missed"}.`
              : ""}
          </p>

          {season.rival ? (
            <p
              className={`season__rival is-${season.rival.heat}${
                season.rival.beatThem ? " is-won" : " is-lost"
              }`}
            >
              <span>Rival</span>
              {rivalSeasonLine(season.rival)}
            </p>
          ) : null}

          <div
            className="season-tabs"
            role="tablist"
            aria-label={`${season.year} detail views`}
          >
            {tabs.map((entry) => (
              <button
                key={entry.id}
                type="button"
                role="tab"
                aria-selected={tab === entry.id}
                className={tab === entry.id ? "is-active" : ""}
                onClick={() => setTab(entry.id)}
              >
                {entry.label}
              </button>
            ))}
          </div>

          {tab === "races" ? <RaceTable races={season.races} /> : null}
          {tab === "wdc" ? (
            <StandingsTable
              standings={season.standings}
              rivalName={season.rival?.name ?? null}
            />
          ) : null}
          {tab === "wcc" ? (
            <ConstructorsTable constructors={season.constructors} />
          ) : null}
          {tab === "winter" ? <WinterList note={season.offseason} /> : null}
        </div>
      ) : null}
    </article>
  );
}

export function Career() {
  const driverName = useGameStore((s) => s.driverName);
  const career = useGameStore((s) => s.career);
  const reset = useGameStore((s) => s.reset);
  const rematch = useGameStore((s) => s.rematch);
  const locked = useGameStore((s) => s.locked);
  const activeChallengeId = useGameStore((s) => s.activeChallengeId);
  const challengeResult = useGameStore((s) => s.challengeResult);
  const [openYear, setOpenYear] = useState<number | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "ok" | "fail">("idle");
  const [view, setView] = useState<ResultsView>("museum");

  useEffect(() => {
    if (!career) return;
    playVerdictSound(career.tier);
    if (challengeResult) {
      if (challengeResult.passed) playChallengeClearedSound();
      else playChallengeFailedSound();
    }
  }, [career, challengeResult]);

  if (!career) return null;

  const first = career.seasons[0];
  const last = career.seasons[career.seasons.length - 1];
  const starts = career.seasons.reduce((n, s) => n + s.races.length, 0);
  const goalsHit = career.seasons.filter((s) => s.goal?.met).length;
  const goalsTotal = career.seasons.filter((s) => s.goal).length;
  const challenge = activeChallengeId ? getChallenge(activeChallengeId) : undefined;
  const challengeShare =
    challenge && challengeResult
      ? { def: challenge, passed: challengeResult.passed }
      : null;

  const slimChips = [
    `${first?.year ?? 2026}–${last?.year ?? 2026}`,
    `Age ${career.debutAge} → ${career.finalAge}`,
    career.pathMarks.walkedAway
      ? "Walked away"
      : career.endReason === "retired"
        ? "Retired"
        : "Lost the seat",
  ];

  const headline = [
    { value: career.titles, label: career.titles === 1 ? "Title" : "Titles" },
    { value: career.wins, label: "Wins" },
    { value: career.podiums, label: "Podiums" },
    { value: career.points, label: "Points" },
  ];

  return (
    <section className="career">
      <div className="career__payoff">
        <header className={`verdict ${TIER_CLASS[career.tier]}`}>
          <p className="eyebrow">Career verdict</p>
          <h1 className="verdict__name">{driverName}</h1>
          <p className="verdict__tier">{career.tierLabel}</p>
          <p className="verdict__summary">{career.summary}</p>
          {challenge && challengeResult ? (
            <div
              className={`challenge-verdict ${
                challengeResult.passed ? "is-passed" : "is-failed"
              }`}
            >
              <p className="eyebrow">
                Challenge {challengeResult.passed ? "cleared" : "failed"}
              </p>
              <strong>{challenge.title}</strong>
              <span>{challengeResult.detail}</span>
            </div>
          ) : null}
        </header>

        <div className="record">
          {headline.map((item) => (
            <div key={item.label} className="record__item">
              <strong>{item.value}</strong>
              <span>{item.label}</span>
            </div>
          ))}
        </div>
        <p className="record__more">
          {career.seasons.length} seasons · {starts} starts · {career.poles}{" "}
          poles · best championship finish P{career.bestFinish}
          {goalsTotal ? ` · goals ${goalsHit}/${goalsTotal}` : ""}
        </p>

        <ul className="chips chips--sm">
          {slimChips.map((chip) => (
            <li key={chip}>{chip}</li>
          ))}
        </ul>

        {career.traits.length ? (
          <ul className="trait-chips">
            {career.traits.map((trait) => (
              <li key={trait.id} title={trait.blurb}>
                {trait.name}
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="career__story">
        <div
          className="results-view"
          role="tablist"
          aria-label="Career results view"
        >
          <button
            type="button"
            role="tab"
            aria-selected={view === "museum"}
            className={view === "museum" ? "is-active" : ""}
            onClick={() => {
              setView("museum");
              setOpenYear(null);
            }}
          >
            Museum
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === "log"}
            className={view === "log" ? "is-active" : ""}
            onClick={() => setView("log")}
          >
            Season log
          </button>
        </div>

        {career.rival ? (
          <p className={`career__rival is-${career.rival.heat}`}>
            <span>Chief rival</span>
            {career.rival.blurb}
          </p>
        ) : null}

        {view === "museum" ? (
          <>
            <CareerMuseum career={career} playerName={driverName} />
            {hasAlternateHistory(career) ? (
              <div className="alt-history-callout">
                <div>
                  <p className="eyebrow">Timeline divergence</p>
                  <p className="alt-history-callout__copy">
                    You raced through recorded history. Open the rewrite to see
                    which World Champions you displaced and which legends left
                    empty-handed.
                  </p>
                </div>
                <AltHistoryButton career={career} playerName={driverName} />
              </div>
            ) : null}
          </>
        ) : (
        <div className="seasons">
          <div className="seasons__head">
            <h2>Season log</h2>
            <ul className="legend">
              {RESULT_LEGEND.map((item) => (
                <li key={item.key}>
                  <i className={`form-strip__cell is-${item.key}`} aria-hidden />
                  {item.label}
                </li>
              ))}
            </ul>
          </div>

          <div className="season-list">
            {career.chapters.map((chapter) => (
              <div key={chapter.id} className="chapter-block">
                <p className="chapter-block__label">
                  {chapter.label}
                  <span>
                    {chapter.yearFrom}
                    {chapter.yearTo !== chapter.yearFrom
                      ? `–${chapter.yearTo}`
                      : ""}
                  </span>
                </p>
                {career.seasons
                  .filter((season) => season.chapter === chapter.id)
                  .map((season) => (
                    <SeasonRow
                      key={season.year}
                      season={season}
                      previousTeam={previousTeamFor(career.seasons, season)}
                      open={openYear === season.year}
                      onToggle={() =>
                        setOpenYear((current) =>
                          current === season.year ? null : season.year,
                        )
                      }
                    />
                  ))}
              </div>
            ))}
          </div>
        </div>
        )}
      </div>

      <details className="dna">
        <summary>How this driver was built</summary>
        <ul>
          {locked.map((item) => (
            <li key={item.key}>
              <span>{ATTRIBUTE_META[item.key].label}</span>
              <strong>{item.value}</strong>
              <em>
                {item.from.name}, {item.from.year}
                {isLegendSeason(item.from.year, item.from.name)
                  ? " · Legend"
                  : ""}
              </em>
            </li>
          ))}
        </ul>
      </details>

      <div className="career__actions">
        <button type="button" className="btn btn-primary" onClick={rematch}>
          Rematch career
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => {
            downloadCareerCard(driverName, career, challengeShare);
          }}
        >
          Save card
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={async () => {
            const ok = await copyText(
              careerShareText(driverName, career, challengeShare),
            );
            setCopyState(ok ? "ok" : "fail");
            window.setTimeout(() => setCopyState("idle"), 1600);
          }}
        >
          {copyState === "ok"
            ? "Copied"
            : copyState === "fail"
              ? "Couldn't copy"
              : "Copy result"}
        </button>
        <button type="button" className="btn btn-ghost" onClick={reset}>
          New driver
        </button>
      </div>
    </section>
  );
}
