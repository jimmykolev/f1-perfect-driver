import { ATTRIBUTE_META, type AttributeKey, type LockedAttribute } from "@/types";

function ratingColor(v: number) {
  if (v >= 90) return "text-rating-elite";
  if (v >= 80) return "text-rating-great";
  if (v >= 70) return "text-rating-good";
  if (v >= 60) return "text-ink-muted";
  return "text-ink-faint";
}

export function BuildPanel({
  locked,
  overall,
  highlight,
  onUnlock,
  blind = false,
}: {
  locked: LockedAttribute[];
  overall: number;
  highlight?: AttributeKey | null;
  onUnlock?: (key: AttributeKey) => void;
  /** Hide numeric ratings — expert / blind draft. */
  blind?: boolean;
}) {
  const byKey = Object.fromEntries(locked.map((l) => [l.key, l])) as Partial<
    Record<AttributeKey, LockedAttribute>
  >;

  return (
    <aside className={`build-panel ${blind ? "build-panel--blind" : ""}`}>
      <div className="build-panel__head">
        <p className="eyebrow">{blind ? "Blind build" : "Your build"}</p>
        <div className="build-panel__ovr">
          <span>OVR</span>
          <strong className={blind ? "" : ratingColor(overall || 50)}>
            {blind ? "?" : overall || "—"}
          </strong>
        </div>
      </div>

      <ul className="attr-list">
        {(Object.keys(ATTRIBUTE_META) as AttributeKey[]).map((key) => {
          const meta = ATTRIBUTE_META[key];
          const item = byKey[key];
          return (
            <li
              key={key}
              className={`attr-row ${item ? "is-filled" : ""} ${
                highlight === key ? "is-active" : ""
              }`}
            >
              <span className="attr-row__label">{meta.label}</span>
              {item ? (
                <>
                  {blind ? (
                    <span className="attr-row__source">
                      {item.from.name} · {item.from.year}
                    </span>
                  ) : (
                    <>
                      <span className="attr-row__bar">
                        <i
                          style={{ width: `${item.value}%` }}
                          className={ratingColor(item.value)}
                        />
                      </span>
                      <strong
                        className={`attr-row__val ${ratingColor(item.value)}`}
                      >
                        {item.value}
                      </strong>
                    </>
                  )}
                  {onUnlock ? (
                    <button
                      type="button"
                      className="attr-row__clear"
                      onClick={() => onUnlock(key)}
                      title={`Unlock ${meta.label}`}
                      aria-label={`Unlock ${meta.label}`}
                    >
                      ×
                    </button>
                  ) : null}
                </>
              ) : (
                <>
                  <span className="attr-row__bar" />
                  <span className="attr-row__open">open</span>
                </>
              )}
            </li>
          );
        })}
      </ul>

      <div className="build-panel__progress">
        <span style={{ width: `${(locked.length / 8) * 100}%` }} />
      </div>
      <p className="build-panel__count">{locked.length} of 8 locked</p>
    </aside>
  );
}
