import { useMemo, useState } from "react";
import { filterPool, peakForAttribute } from "@/lib/playgroundBuild";
import { isLegendSeason } from "@/lib/era";
import { useGameStore } from "@/store/gameStore";
import {
  ATTRIBUTE_KEYS,
  ATTRIBUTE_META,
  type AttributeKey,
  type DriverSeason,
} from "@/types";

function ratingColor(v: number) {
  if (v >= 90) return "text-rating-elite";
  if (v >= 80) return "text-rating-great";
  if (v >= 70) return "text-rating-good";
  return "text-ink-muted";
}

const PLAYGROUND_RESULT_CAP = 40;

function SeasonPicker({
  seasons,
  selectedId,
  onSelect,
}: {
  seasons: DriverSeason[];
  selectedId: string | null;
  onSelect: (season: DriverSeason) => void;
}) {
  if (!seasons.length) {
    return <p className="playground__empty">No seasons match that filter.</p>;
  }

  const shown = seasons.slice(0, PLAYGROUND_RESULT_CAP);
  const truncated = seasons.length > PLAYGROUND_RESULT_CAP;

  return (
    <div className="playground__results-wrap">
      {truncated ? (
        <p className="playground__results-note">
          Showing {PLAYGROUND_RESULT_CAP} of {seasons.length} — narrow search
        </p>
      ) : null}
      <ul className="playground__results">
        {shown.map((season) => (
          <li key={season.id}>
            <button
              type="button"
              className={selectedId === season.id ? "is-active" : ""}
              onClick={() => onSelect(season)}
            >
              <span className="playground__result-main">
                <strong>
                  {season.name}
                  {isLegendSeason(season.year, season.name) ? (
                    <em className="tag tag--gold">Legend</em>
                  ) : null}
                </strong>
                <em>
                  {season.year} · {season.team}
                </em>
              </span>
              <span
                className={`playground__result-ovr ${ratingColor(season.overall)}`}
              >
                {season.overall}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AttributeLocker({
  season,
  lockedKeys,
  onLock,
}: {
  season: DriverSeason;
  lockedKeys: Set<AttributeKey>;
  onLock: (key: AttributeKey) => void;
}) {
  return (
    <div className="playground__attrs">
      <div className="playground__attrs-head">
        {season.image ? (
          <img src={season.image} alt="" className="playground__photo" />
        ) : (
          <div className="playground__photo playground__photo--empty" />
        )}
        <div>
          <p className="eyebrow">
            {isLegendSeason(season.year, season.name) ? (
              <>
                <em className="tag tag--gold">Legend</em> {season.year} ·{" "}
                {season.team} · P{season.position}
              </>
            ) : (
              <>
                {season.year} · {season.team} · P{season.position}
              </>
            )}
          </p>
          <h3>{season.name}</h3>
          <p className="playground__attrs-meta">
            {season.points} pts · {season.wins}W · {season.podiums} podium
            {season.podiums === 1 ? "" : "s"} · {season.poles} poles
          </p>
        </div>
      </div>

      <p className="playground__prompt">
        Click an attribute to lock it into the build
        {lockedKeys.size ? " (replaces that slot if already filled)" : ""}
      </p>

      <div className="pick-grid">
        {ATTRIBUTE_KEYS.map((key) => {
          const value = season.attributes[key];
          const taken = lockedKeys.has(key);
          return (
            <button
              key={key}
              type="button"
              className={`pick-btn ${taken ? "is-replace" : ""}`}
              onClick={() => onLock(key)}
              title={ATTRIBUTE_META[key].blurb}
            >
              <span>
                {ATTRIBUTE_META[key].label}
                {taken ? " · replace" : ""}
              </span>
              <strong className={ratingColor(value)}>{value}</strong>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function PlaygroundPanel() {
  const pool = useGameStore((s) => s.pool);
  const locked = useGameStore((s) => s.locked);
  const playgroundLock = useGameStore((s) => s.playgroundLock);
  const playgroundUnlock = useGameStore((s) => s.playgroundUnlock);
  const playgroundClear = useGameStore((s) => s.playgroundClear);
  const playgroundMaxBuild = useGameStore((s) => s.playgroundMaxBuild);
  const playgroundFinish = useGameStore((s) => s.playgroundFinish);

  const [query, setQuery] = useState("");
  const [year, setYear] = useState<number | null>(null);
  const [selected, setSelected] = useState<DriverSeason | null>(null);

  const years = useMemo(
    () => [...new Set(pool.map((s) => s.year))].sort((a, b) => b - a),
    [pool],
  );

  const results = useMemo(
    () => filterPool(pool, { query, year }),
    [pool, query, year],
  );

  const lockedKeys = useMemo(
    () => new Set(locked.map((l) => l.key)),
    [locked],
  );

  const peaks = useMemo(
    () =>
      Object.fromEntries(
        ATTRIBUTE_KEYS.map((key) => [key, peakForAttribute(pool, key)]),
      ) as Record<
        AttributeKey,
        { value: number; from: DriverSeason } | null
      >,
    [pool],
  );

  return (
    <div className="playground">
      <div className="playground__toolbar">
        <div>
          <p className="eyebrow">Playground</p>
          <h2>Hand-pick build</h2>
        </div>
        <div className="playground__actions">
          <button type="button" className="btn btn-primary" onClick={playgroundMaxBuild}>
            Max every slot
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={playgroundClear}
            disabled={!locked.length}
          >
            Clear
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={playgroundFinish}
            disabled={locked.length < 8}
          >
            Finish build
          </button>
        </div>
      </div>

      <div className="playground__peaks">
        {ATTRIBUTE_KEYS.map((key) => {
          const peak = peaks[key];
          const lockedRow = locked.find((l) => l.key === key);
          return (
            <button
              key={key}
              type="button"
              className={`playground__peak ${lockedRow ? "is-filled" : ""}`}
              onClick={() => {
                if (lockedRow) playgroundUnlock(key);
                else if (peak) playgroundLock(key, peak.from);
              }}
              title={
                lockedRow
                  ? `Unlock ${ATTRIBUTE_META[key].label}`
                  : peak
                    ? `Lock peak: ${peak.from.name} ${peak.from.year}`
                    : undefined
              }
            >
              <span>{ATTRIBUTE_META[key].short}</span>
              <strong className={ratingColor(lockedRow?.value ?? peak?.value ?? 0)}>
                {lockedRow?.value ?? peak?.value ?? "—"}
              </strong>
              <em>
                {lockedRow
                  ? `${lockedRow.from.name.split(" ").slice(-1)[0]} ’${String(lockedRow.from.year).slice(2)}`
                  : peak
                    ? `max · ${peak.from.name.split(" ").slice(-1)[0]} ’${String(peak.from.year).slice(2)}`
                    : "—"}
              </em>
            </button>
          );
        })}
      </div>

      <div className="playground__filters">
        <label className="playground__search">
          <span className="eyebrow">Search</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Driver or team…"
            autoComplete="off"
          />
        </label>
        <label className="playground__year">
          <span className="eyebrow">Year</span>
          <select
            value={year ?? ""}
            onChange={(e) =>
              setYear(e.target.value ? Number(e.target.value) : null)
            }
          >
            <option value="">All years</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="playground__body">
        <SeasonPicker
          seasons={results}
          selectedId={selected?.id ?? null}
          onSelect={setSelected}
        />
        {selected ? (
          <AttributeLocker
            season={selected}
            lockedKeys={lockedKeys}
            onLock={(key) => playgroundLock(key, selected)}
          />
        ) : (
          <p className="playground__empty playground__empty--panel">
            Pick a driver-season to lock attributes from it — or hit{" "}
            <strong>Max every slot</strong> for the theoretical peak build.
          </p>
        )}
      </div>
    </div>
  );
}
