import { useMemo, useState } from "react";
import { filterPool, peakForAttribute } from "@/lib/adminBuild";
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

const ADMIN_RESULT_CAP = 40;

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
    return <p className="admin__empty">No seasons match that filter.</p>;
  }

  const shown = seasons.slice(0, ADMIN_RESULT_CAP);
  const truncated = seasons.length > ADMIN_RESULT_CAP;

  return (
    <div className="admin__results-wrap">
      {truncated ? (
        <p className="admin__results-note">
          Showing {ADMIN_RESULT_CAP} of {seasons.length} — narrow search
        </p>
      ) : null}
      <ul className="admin__results">
        {shown.map((season) => (
          <li key={season.id}>
            <button
              type="button"
              className={selectedId === season.id ? "is-active" : ""}
              onClick={() => onSelect(season)}
            >
              <span className="admin__result-main">
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
                className={`admin__result-ovr ${ratingColor(season.overall)}`}
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
    <div className="admin__attrs">
      <div className="admin__attrs-head">
        {season.image ? (
          <img src={season.image} alt="" className="admin__photo" />
        ) : (
          <div className="admin__photo admin__photo--empty" />
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
          <p className="admin__attrs-meta">
            {season.points} pts · {season.wins}W · {season.podiums} podium
            {season.podiums === 1 ? "" : "s"} · {season.poles} poles
          </p>
        </div>
      </div>

      <p className="admin__prompt">
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

export function AdminPanel() {
  const pool = useGameStore((s) => s.pool);
  const locked = useGameStore((s) => s.locked);
  const adminLock = useGameStore((s) => s.adminLock);
  const adminUnlock = useGameStore((s) => s.adminUnlock);
  const adminClear = useGameStore((s) => s.adminClear);
  const adminMaxBuild = useGameStore((s) => s.adminMaxBuild);
  const adminFinish = useGameStore((s) => s.adminFinish);

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
    <div className="admin">
      <div className="admin__toolbar">
        <div>
          <p className="eyebrow">Admin</p>
          <h2>Hand-pick build</h2>
        </div>
        <div className="admin__actions">
          <button type="button" className="btn btn-primary" onClick={adminMaxBuild}>
            Max every slot
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={adminClear}
            disabled={!locked.length}
          >
            Clear
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={adminFinish}
            disabled={locked.length < 8}
          >
            Finish build
          </button>
        </div>
      </div>

      <div className="admin__peaks">
        {ATTRIBUTE_KEYS.map((key) => {
          const peak = peaks[key];
          const lockedRow = locked.find((l) => l.key === key);
          return (
            <button
              key={key}
              type="button"
              className={`admin__peak ${lockedRow ? "is-filled" : ""}`}
              onClick={() => {
                if (lockedRow) adminUnlock(key);
                else if (peak) adminLock(key, peak.from);
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

      <div className="admin__filters">
        <label className="admin__search">
          <span className="eyebrow">Search</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Driver or team…"
            autoComplete="off"
          />
        </label>
        <label className="admin__year">
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

      <div className="admin__body">
        <SeasonPicker
          seasons={results}
          selectedId={selected?.id ?? null}
          onSelect={setSelected}
        />
        {selected ? (
          <AttributeLocker
            season={selected}
            lockedKeys={lockedKeys}
            onLock={(key) => adminLock(key, selected)}
          />
        ) : (
          <p className="admin__empty admin__empty--panel">
            Pick a driver-season to lock attributes from it — or hit{" "}
            <strong>Max every slot</strong> for the theoretical peak build.
          </p>
        )}
      </div>
    </div>
  );
}
