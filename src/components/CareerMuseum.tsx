import { useEffect, useMemo, useRef, useState } from "react";
import {
  StatChips,
  StatGrid,
  TeamMove,
  YearLabel,
  yearTick,
} from "@/components/careerUi";
import {
  buildCareerMuseum,
  type MuseumArcPoint,
  type MuseumBeat,
  type MuseumBeatGroup,
} from "@/lib/careerMuseum";
import type { CareerResult } from "@/types";

type Filter = "all" | MuseumBeatGroup;

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "Everything" },
  { id: "titles", label: "Titles" },
  { id: "moves", label: "Team moves" },
  { id: "moments", label: "Key moments" },
];

const CHART = {
  padLeft: 30,
  padRight: 12,
  padTop: 16,
  padBottom: 30,
  step: 36,
  height: 190,
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
    const worst = Math.max(5, ...arc.map((p) => p.position));
    const axisMax = Math.ceil(worst / 5) * 5;
    const width =
      CHART.padLeft + arc.length * CHART.step + CHART.padRight;
    const plotTop = CHART.padTop;
    const plotBottom = CHART.height - CHART.padBottom;
    const x = (i: number) => CHART.padLeft + i * CHART.step + CHART.step / 2;
    const y = (position: number) =>
      plotTop + ((position - 1) / (axisMax - 1)) * (plotBottom - plotTop);
    const lines = [1, 5, 10, 15, 20, 25].filter((p) => p <= axisMax);
    return { axisMax, width, plotTop, plotBottom, x, y, lines };
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
        <span>Championship position by season</span>
        <em>Hover or arrow keys · click / Enter to pin</em>
      </figcaption>

      <ul className="arc__key" aria-label="Chart key">
        <li className="is-title">Gold = title</li>
        <li className="is-switch">Dashed = team change</li>
      </ul>

      <div className="arc__plot">
        <svg
          viewBox={`0 0 ${geometry.width} ${CHART.height}`}
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
                x1={geometry.x(i) - CHART.step / 2}
                x2={geometry.x(i) - CHART.step / 2}
                y1={geometry.plotTop - 6}
                y2={geometry.plotBottom + 4}
              />
            ) : null,
          )}

          <polyline className="arc__line" points={path.join(" ")} />

          {arc.map((point, i) => (
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
              <text
                className="arc__yeartick"
                x={geometry.x(i)}
                y={CHART.height - 12}
              >
                {yearTick(point.year)}
              </text>
              <rect
                className="arc__hit"
                x={geometry.x(i) - CHART.step / 2}
                y={0}
                width={CHART.step}
                height={CHART.height}
                onMouseEnter={() => setHoverYear(point.year)}
                onMouseLeave={() => setHoverYear(null)}
                onClick={() =>
                  onPick(activeYear === point.year ? null : point.year)
                }
              />
            </g>
          ))}
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
  const [filter, setFilter] = useState<Filter>("all");
  const [activeYear, setActiveYear] = useState<number | null>(null);
  const beatNodes = useRef(new Map<number, HTMLLIElement>());

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

      {visibleActs.length ? (
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
