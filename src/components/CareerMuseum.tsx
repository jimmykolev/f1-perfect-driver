import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import {
  StatChips,
  StatGrid,
  TeamMove,
  YearLabel,
  yearTick,
} from "@/components/careerUi";
import {
  buildCareerMuseum,
  selectHighlightBeats,
  type MuseumArcPoint,
  type MuseumBeat,
  type MuseumBeatGroup,
} from "@/lib/careerMuseum";
import {
  buildCareerLeaderboard,
  type CareerLeaderboardRow,
} from "@/lib/careerLeaderboard";
import type { CareerResult } from "@/types";

type Filter = "highlights" | "leaderboard" | "all" | MuseumBeatGroup;

const FILTERS: { id: Filter; label: string }[] = [
  { id: "highlights", label: "Highlights" },
  { id: "leaderboard", label: "Leaderboard" },
  { id: "titles", label: "Titles" },
  { id: "moves", label: "Team moves" },
  { id: "moments", label: "Key moments" },
  { id: "all", label: "Everything" },
];

/** Fixed coordinate space — seasons spread across it; CSS keeps height stable. */
const CHART = {
  padLeft: 36,
  padRight: 16,
  padTop: 16,
  padBottom: 30,
  width: 720,
  height: 200,
};

/** Season the readout falls back to: first title, else career-best finish. */
function defaultFocus(arc: MuseumArcPoint[]) {
  const title = arc.find((p) => p.champion);
  if (title) return title.year;
  return arc.reduce((best, p) => (p.position < best.position ? p : best), arc[0]!)
    .year;
}

function ArcReadout({ point }: { point: MuseumArcPoint }) {
  return (
    <StatGrid
      className={`arc__readout ${point.champion ? "is-champion" : ""}`}
      accent={point.champion ? "Finish" : undefined}
      cells={[
        { label: "Season", value: String(point.year) },
        { label: "Team", value: point.team },
        {
          label: "Finish",
          value: point.champion ? "Champion" : `P${point.position}`,
        },
        { label: "Wins", value: String(point.wins) },
        { label: "Podiums", value: String(point.podiums) },
        { label: "Poles", value: String(point.poles) },
        { label: "Points", value: String(point.points) },
        { label: "Age", value: String(point.age) },
      ]}
    />
  );
}

/** Championship position per season, P1 at the top. */
function CareerArc({
  arc,
  activeYear,
  onPick,
}: {
  arc: MuseumArcPoint[];
  activeYear: number | null;
  onPick: (year: number | null) => void;
}) {
  const [hoverYear, setHoverYear] = useState<number | null>(null);
  const [keyboardYear, setKeyboardYear] = useState<number | null>(null);

  const geometry = useMemo(() => {
    const n = arc.length;
    const worst = Math.max(5, ...arc.map((p) => p.position));
    const axisMax = Math.ceil(worst / 5) * 5;
    const { width, padLeft, padRight, padTop, padBottom, height } = CHART;
    const inner = width - padLeft - padRight;
    const plotTop = padTop;
    const plotBottom = height - padBottom;
    const x = (i: number) =>
      n <= 1 ? padLeft + inner / 2 : padLeft + (i / (n - 1)) * inner;
    const hitLeft = (i: number) => {
      if (n <= 1 || i === 0) return padLeft;
      return (x(i - 1) + x(i)) / 2;
    };
    const hitRight = (i: number) => {
      if (n <= 1 || i === n - 1) return width - padRight;
      return (x(i) + x(i + 1)) / 2;
    };
    const y = (position: number) =>
      plotTop + ((position - 1) / (axisMax - 1)) * (plotBottom - plotTop);
    const lines = [1, 5, 10, 15, 20, 25].filter((p) => p <= axisMax);
    // Dense careers: thin year labels so the axis stays readable.
    const labelEvery = n <= 10 ? 1 : n <= 16 ? 2 : 3;
    return {
      axisMax,
      width,
      plotTop,
      plotBottom,
      x,
      y,
      lines,
      hitLeft,
      hitRight,
      labelEvery,
      n,
    };
  }, [arc]);

  if (!arc.length) return null;

  const focusYear =
    hoverYear ?? keyboardYear ?? activeYear ?? defaultFocus(arc);
  const focus = arc.find((p) => p.year === focusYear) ?? arc[0]!;
  const path = arc.map((p, i) => `${geometry.x(i)},${geometry.y(p.position)}`);
  const focusIndex = Math.max(
    0,
    arc.findIndex((p) => p.year === focusYear),
  );

  const moveFocus = (delta: number) => {
    const next = Math.max(0, Math.min(arc.length - 1, focusIndex + delta));
    setKeyboardYear(arc[next]!.year);
  };

  const showYear = (i: number) =>
    i === 0 ||
    i === geometry.n - 1 ||
    i % geometry.labelEvery === 0 ||
    arc[i]!.year === focusYear;

  return (
    <figure
      className="arc"
      tabIndex={0}
      aria-label="Championship position chart. Use left and right arrows to move between seasons, Enter to pin."
      onKeyDown={(event) => {
        if (event.key === "ArrowRight" || event.key === "ArrowDown") {
          event.preventDefault();
          moveFocus(1);
        } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
          event.preventDefault();
          moveFocus(-1);
        } else if (event.key === "Home") {
          event.preventDefault();
          setKeyboardYear(arc[0]!.year);
        } else if (event.key === "End") {
          event.preventDefault();
          setKeyboardYear(arc[arc.length - 1]!.year);
        } else if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onPick(activeYear === focusYear ? null : focusYear);
        }
      }}
    >
      <figcaption className="arc__caption">
        <span>Career arc</span>
        <em>Hover or arrow keys · click / Enter to pin</em>
      </figcaption>

      <ul className="arc__key" aria-label="Chart key">
        <li className="is-title">Gold = title</li>
        <li className="is-switch">Dashed = team change</li>
      </ul>

      <div className="arc__plot">
        <svg
          viewBox={`0 0 ${geometry.width} ${CHART.height}`}
          preserveAspectRatio="xMidYMid meet"
          className="arc__svg"
          role="img"
          aria-label={`Championship position from ${arc[0]!.year} to ${arc[arc.length - 1]!.year}`}
        >
          {geometry.lines.map((position) => (
            <g key={position} className="arc__grid">
              <line
                x1={CHART.padLeft}
                x2={geometry.width - CHART.padRight}
                y1={geometry.y(position)}
                y2={geometry.y(position)}
              />
              <text x={0} y={geometry.y(position) + 3.5}>
                P{position}
              </text>
            </g>
          ))}

          {arc.map((point, i) =>
            point.teamChange ? (
              <line
                key={`switch-${point.year}`}
                className="arc__switch"
                x1={geometry.hitLeft(i)}
                x2={geometry.hitLeft(i)}
                y1={geometry.plotTop - 6}
                y2={geometry.plotBottom + 4}
              />
            ) : null,
          )}

          <polyline className="arc__line" points={path.join(" ")} />

          {arc.map((point, i) => {
            const left = geometry.hitLeft(i);
            const right = geometry.hitRight(i);
            return (
              <g
                key={point.year}
                className={`arc__point ${point.champion ? "is-champion" : ""} ${
                  point.position <= 3 ? "is-front" : ""
                } ${focusYear === point.year ? "is-focus" : ""} ${
                  activeYear === point.year ? "is-pinned" : ""
                }`}
              >
                <circle
                  className="arc__dot"
                  cx={geometry.x(i)}
                  cy={geometry.y(point.position)}
                  r={point.champion ? 5.5 : 4}
                />
                {showYear(i) ? (
                  <text
                    className="arc__yeartick"
                    x={geometry.x(i)}
                    y={CHART.height - 12}
                  >
                    {yearTick(point.year)}
                  </text>
                ) : null}
                <rect
                  className="arc__hit"
                  x={left}
                  y={0}
                  width={Math.max(8, right - left)}
                  height={CHART.height}
                  onMouseEnter={() => setHoverYear(point.year)}
                  onMouseLeave={() => setHoverYear(null)}
                  onClick={() =>
                    onPick(activeYear === point.year ? null : point.year)
                  }
                />
              </g>
            );
          })}
        </svg>
      </div>

      <ArcReadout point={focus} />
    </figure>
  );
}

function BeatRow({
  beat,
  pinned,
  beatRef,
}: {
  beat: MuseumBeat;
  pinned: boolean;
  beatRef?: (node: HTMLLIElement | null) => void;
}) {
  return (
    <li
      ref={beatRef}
      className={`beat beat--${beat.kind} ${pinned ? "is-pinned" : ""}`}
    >
      <YearLabel
        year={beat.year}
        yearTo={beat.yearTo}
        className="beat__year"
      />
      <span className="beat__tag">{beat.tag}</span>
      <span className="beat__main">
        {beat.move ? (
          <TeamMove from={beat.move.from} to={beat.move.to} showTag={false} />
        ) : (
          <b>{beat.headline}</b>
        )}
        {beat.note ? <i>{beat.note}</i> : null}
      </span>
      <StatChips items={beat.stats} />
    </li>
  );
}

function LeaderboardTable({
  rows,
  truncated,
  playerPinned,
  totalDrivers,
}: {
  rows: CareerLeaderboardRow[];
  truncated: boolean;
  playerPinned: boolean;
  totalDrivers: number;
}) {
  return (
    <div className="dtable-wrap museum__leaderboard-table">
      <table className="dtable">
        <thead>
          <tr>
            <th className="num">#</th>
            <th>Driver</th>
            <th className="num hide-sm">Yrs</th>
            <th className="num">WDC</th>
            <th className="num">Wins</th>
            <th className="num hide-sm">Pod</th>
            <th className="num">Pts</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const prev = rows[index - 1];
            const gap =
              playerPinned &&
              index > 0 &&
              prev &&
              !prev.isPlayer &&
              row.isPlayer &&
              row.rank - prev.rank > 1;

            return (
              <Fragment key={row.name}>
                {gap ? (
                  <tr className="museum__leaderboard-gap">
                    <td colSpan={7}>…</td>
                  </tr>
                ) : null}
                <tr
                  className={`${row.titles > 0 ? "is-win" : ""} ${
                    row.isPlayer ? "is-you" : ""
                  }`}
                >
                  <td className="num muted">{row.rank}</td>
                  <td>
                    {row.name}
                    {row.isPlayer ? <em className="tag tag--you">You</em> : null}
                    <em className="age hide-sm">{row.lastTeam}</em>
                  </td>
                  <td className="num hide-sm">{row.seasons}</td>
                  <td className="num strong">{row.titles || "—"}</td>
                  <td className="num">{row.wins || "—"}</td>
                  <td className="num hide-sm">{row.podiums || "—"}</td>
                  <td className="num strong">{row.points}</td>
                </tr>
              </Fragment>
            );
          })}
        </tbody>
      </table>
      {truncated ? (
        <p className="museum__leaderboard-note">
          Top {rows.length - (playerPinned ? 1 : 0)} of {totalDrivers} drivers
          in your world
          {playerPinned ? " · your row pinned below" : null}
        </p>
      ) : null}
    </div>
  );
}

export function CareerMuseum({
  career,
  playerName,
}: {
  career: CareerResult;
  playerName: string;
}) {
  const { arc, acts, headline } = useMemo(
    () => buildCareerMuseum(career, playerName),
    [career, playerName],
  );
  const [filter, setFilter] = useState<Filter>("highlights");
  const [activeYear, setActiveYear] = useState<number | null>(null);
  const beatNodes = useRef(new Map<number, HTMLLIElement>());
  const highlightBeats = useMemo(() => selectHighlightBeats(acts), [acts]);
  const leaderboard = useMemo(
    () => buildCareerLeaderboard(career, playerName),
    [career, playerName],
  );

  useEffect(() => {
    if (activeYear == null) return;
    const node = beatNodes.current.get(activeYear);
    node?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [activeYear]);

  if (!acts.length) return null;

  const visibleActs = acts
    .map((act) => ({
      ...act,
      beats: act.beats.filter(
        (beat) => filter === "all" || beat.group === filter,
      ),
    }))
    .filter((act) => act.beats.length > 0);

  return (
    <div className="museum">
      <div className="museum__head">
        <h2>Career museum</h2>
        <p>{headline}</p>
      </div>

      <CareerArc arc={arc} activeYear={activeYear} onPick={setActiveYear} />

      <div className="museum__filters" role="tablist" aria-label="Story filter">
        {FILTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={filter === item.id}
            className={filter === item.id ? "is-active" : ""}
            onClick={() => setFilter(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {filter === "highlights" ? (
        highlightBeats.length ? (
          <section className="museum__highlights">
            <header className="museum__highlights-head">
              <h3>Highlights</h3>
              <p>{headline}</p>
            </header>
            <ol className="act__beats">
              {highlightBeats.map((beat) => (
                <BeatRow
                  key={beat.id}
                  beat={beat}
                  pinned={activeYear != null && beat.year === activeYear}
                  beatRef={
                    beat.year != null
                      ? (node) => {
                          if (node) beatNodes.current.set(beat.year!, node);
                          else beatNodes.current.delete(beat.year!);
                        }
                      : undefined
                  }
                />
              ))}
            </ol>
          </section>
        ) : (
          <p className="museum__empty">
            Nothing in this career matched that filter.
          </p>
        )
      ) : filter === "leaderboard" ? (
        leaderboard.rows.length ? (
          <section className="museum__leaderboard">
            <header className="museum__highlights-head">
              <h3>Leaderboard</h3>
              <p>
                {leaderboard.playerRank != null
                  ? `You finished P${leaderboard.playerRank} of ${leaderboard.totalDrivers} drivers across this world.`
                  : `Career totals for ${leaderboard.totalDrivers} drivers in this world.`}
                {!leaderboard.fromStandings
                  ? " · Partial data from champions and rivals."
                  : null}
              </p>
            </header>
            <LeaderboardTable
              rows={leaderboard.rows}
              truncated={leaderboard.truncated}
              playerPinned={leaderboard.playerPinned}
              totalDrivers={leaderboard.totalDrivers}
            />
          </section>
        ) : (
          <p className="museum__empty">
            No driver data to rank — season standings were not saved for this
            career.
          </p>
        )
      ) : visibleActs.length ? (
        <div className="museum__acts">
          {visibleActs.map((act) => (
            <section key={act.id} className={`act act--${act.id}`}>
              <header className="act__head">
                <div className="act__title">
                  <h3>{act.label}</h3>
                  {act.yearFrom != null ? (
                    <YearLabel year={act.yearFrom} yearTo={act.yearTo} />
                  ) : null}
                  <p>{act.blurb}</p>
                </div>
                <StatChips items={act.stats} />
              </header>

              <ol className="act__beats">
                {act.beats.map((beat) => (
                  <BeatRow
                    key={beat.id}
                    beat={beat}
                    pinned={activeYear != null && beat.year === activeYear}
                    beatRef={
                      beat.year != null
                        ? (node) => {
                            if (node) beatNodes.current.set(beat.year!, node);
                            else beatNodes.current.delete(beat.year!);
                          }
                        : undefined
                    }
                  />
                ))}
              </ol>
            </section>
          ))}
        </div>
      ) : (
        <p className="museum__empty">
          Nothing in this career matched that filter.
        </p>
      )}
    </div>
  );
}
