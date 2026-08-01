import { useEffect, useId, useRef, useState } from "react";
import { computeOverall, emptyAttributes } from "@/lib/ratings";
import {
  ATTRIBUTE_GUIDES,
  RATINGS_GUIDE,
  type AttributeGuide,
} from "@/lib/ratingsGuide";
import { ATTRIBUTE_KEYS, type AttributeKey, type Attributes } from "@/types";

type GuideStep = (typeof RATINGS_GUIDE.steps)[number]["id"];

function ratingColor(v: number) {
  if (v >= 90) return "text-rating-elite";
  if (v >= 80) return "text-rating-great";
  if (v >= 70) return "text-rating-good";
  return "text-ink-muted";
}

function bandFor(value: number) {
  return (
    RATINGS_GUIDE.bands.find(
      (band) => value >= band.range[0] && value <= band.range[1],
    ) ?? RATINGS_GUIDE.bands[RATINGS_GUIDE.bands.length - 1]
  );
}

function ScaleStep() {
  const [probe, setProbe] = useState(78);
  const band = bandFor(probe);

  return (
    <div className="rg-step">
      <p className="rg-step__lede">{RATINGS_GUIDE.intro}</p>
      <p className="rg-step__hint">
        Drag the needle — ratings are relative to that season’s field, then
        mapped onto this band.
      </p>

      <div className="rg-probe">
        <div className="rg-probe__readout">
          <strong className={ratingColor(probe)}>{probe}</strong>
          <span>
            {band.meaning}
            <em>{band.example}</em>
          </span>
        </div>
        <label className="rg-probe__slider">
          <span className="visually-hidden">Sample rating</span>
          <input
            type="range"
            min={55}
            max={99}
            value={probe}
            onChange={(e) => setProbe(Number(e.target.value))}
          />
          <span className="rg-probe__ends" aria-hidden>
            <i>55</i>
            <i>99</i>
          </span>
        </label>
      </div>

      <ul className="rg-bands" aria-label="Rating bands">
        {RATINGS_GUIDE.bands.map((item) => {
          const active = item.label === band.label;
          return (
            <li key={item.label}>
              <button
                type="button"
                className={`rg-band ${active ? "is-active" : ""}`}
                onClick={() =>
                  setProbe(Math.round((item.range[0] + item.range[1]) / 2))
                }
                aria-pressed={active}
              >
                <strong>{item.label}</strong>
                <span>{item.meaning}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function AttributesStep() {
  const [selected, setSelected] = useState<AttributeKey>("raceCraft");
  const attr =
    ATTRIBUTE_GUIDES.find((item) => item.key === selected) ??
    ATTRIBUTE_GUIDES[0];
  const maxWeight = Math.max(...ATTRIBUTE_GUIDES.map((item) => item.weightPct));

  return (
    <div className="rg-step">
      <p className="rg-step__hint">
        Tap an attribute to see what feeds it and how hard it pulls overall.
      </p>

      <div className="rg-attr-grid" role="listbox" aria-label="Attributes">
        {ATTRIBUTE_GUIDES.map((item) => (
          <button
            key={item.key}
            type="button"
            role="option"
            aria-selected={item.key === selected}
            className={`rg-attr-chip ${item.key === selected ? "is-active" : ""}`}
            onClick={() => setSelected(item.key)}
          >
            <span>{item.short}</span>
            <strong>{item.weightPct}%</strong>
          </button>
        ))}
      </div>

      <AttributeDetail attr={attr} maxWeight={maxWeight} />

      <ul className="rg-weight-bars">
        {ATTRIBUTE_GUIDES.map((item) => (
          <li
            key={item.key}
            className={item.key === selected ? "is-active" : ""}
          >
            <span>{item.short}</span>
            <i>
              <b style={{ width: `${(item.weightPct / maxWeight) * 100}%` }} />
            </i>
            <em>{item.weightPct}%</em>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AttributeDetail({
  attr,
  maxWeight,
}: {
  attr: AttributeGuide;
  maxWeight: number;
}) {
  return (
    <div className="rg-attr-detail" key={attr.key}>
      <div className="rg-attr-detail__top">
        <div>
          <p className="eyebrow">{attr.short}</p>
          <h3>{attr.label}</h3>
        </div>
        <div className="rg-attr-detail__weight">
          <span>OVR weight</span>
          <strong>{attr.weightPct}%</strong>
        </div>
      </div>
      <p>{attr.blurb}</p>
      <p className="rg-attr-detail__how">{attr.how}</p>
      <ul className="rg-signals">
        {attr.signals.map((signal) => (
          <li key={signal}>{signal}</li>
        ))}
      </ul>
      <div className="rg-attr-detail__bar" aria-hidden>
        <span style={{ width: `${(attr.weightPct / maxWeight) * 100}%` }} />
      </div>
    </div>
  );
}

function OverallStep() {
  const [attrs, setAttrs] = useState<Attributes>(() => ({
    ...RATINGS_GUIDE.presets[0].values,
  }));
  const overall = computeOverall(attrs);
  const [bumpKey, setBumpKey] = useState<AttributeKey | null>(null);
  const [bumpDelta, setBumpDelta] = useState(0);

  const setValue = (key: AttributeKey, value: number) => {
    setBumpKey(null);
    setBumpDelta(0);
    setAttrs((prev) => ({ ...prev, [key]: value }));
  };

  const applyPreset = (id: string) => {
    const preset = RATINGS_GUIDE.presets.find((item) => item.id === id);
    if (!preset) return;
    setBumpKey(null);
    setBumpDelta(0);
    setAttrs({ ...preset.values });
  };

  const compareBump = (key: AttributeKey) => {
    const base = emptyAttributes();
    for (const k of ATTRIBUTE_KEYS) base[k] = 75;
    const before = computeOverall(base);
    const afterAttrs = { ...base, [key]: 85 };
    const after = computeOverall(afterAttrs);
    setAttrs(afterAttrs);
    setBumpKey(key);
    setBumpDelta(after - before);
  };

  return (
    <div className="rg-step">
      <p className="rg-step__hint">
        Drag the sliders — overall is a weighted blend. Race craft hits harder
        than momentum.
      </p>

      <div className="rg-ovr-hero">
        <div>
          <span>Live overall</span>
          <strong className={ratingColor(overall)}>{overall}</strong>
        </div>
        {bumpKey ? (
          <p className="rg-ovr-bump" key={`${bumpKey}-${bumpDelta}`}>
            +10 {ATTRIBUTE_GUIDES.find((a) => a.key === bumpKey)?.short} →{" "}
            <em>+{bumpDelta} OVR</em>
          </p>
        ) : (
          <p className="rg-ovr-note">Try a +10 bump on different attributes</p>
        )}
      </div>

      <div className="rg-presets">
        {RATINGS_GUIDE.presets.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className="rg-preset"
            onClick={() => applyPreset(preset.id)}
          >
            {preset.label}
          </button>
        ))}
        <button
          type="button"
          className="rg-preset"
          onClick={() => compareBump("raceCraft")}
        >
          +10 Craft
        </button>
        <button
          type="button"
          className="rg-preset"
          onClick={() => compareBump("momentum")}
        >
          +10 Form
        </button>
      </div>

      <ul className="rg-sliders">
        {ATTRIBUTE_GUIDES.map((item) => (
          <li key={item.key}>
            <div className="rg-slider__top">
              <label htmlFor={`rg-${item.key}`}>
                {item.label}
                <em>{item.weightPct}%</em>
              </label>
              <strong className={ratingColor(attrs[item.key])}>
                {attrs[item.key]}
              </strong>
            </div>
            <input
              id={`rg-${item.key}`}
              type="range"
              min={55}
              max={99}
              value={attrs[item.key]}
              onChange={(e) => setValue(item.key, Number(e.target.value))}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

function RatingsGuidePanel({ titleId }: { titleId: string }) {
  const [step, setStep] = useState<GuideStep>("scale");

  return (
    <div className="ratings-guide__panel">
      <header className="ratings-guide__head">
        <div>
          <p className="eyebrow">Methodology</p>
          <h2 id={titleId}>{RATINGS_GUIDE.title}</h2>
        </div>
        <form method="dialog">
          <button type="submit" className="btn btn-ghost ratings-guide__close">
            Close
          </button>
        </form>
      </header>

      <div className="rg-tabs" role="tablist" aria-label="Ratings guide sections">
        {RATINGS_GUIDE.steps.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            id={`rg-tab-${item.id}`}
            aria-selected={step === item.id}
            aria-controls={`rg-panel-${item.id}`}
            className={`rg-tab ${step === item.id ? "is-active" : ""}`}
            onClick={() => setStep(item.id)}
          >
            <strong>{item.label}</strong>
            <span>{item.hint}</span>
          </button>
        ))}
      </div>

      <div
        className="ratings-guide__body"
        role="tabpanel"
        id={`rg-panel-${step}`}
        aria-labelledby={`rg-tab-${step}`}
      >
        {step === "scale" ? <ScaleStep /> : null}
        {step === "attrs" ? <AttributesStep /> : null}
        {step === "ovr" ? <OverallStep /> : null}
      </div>
    </div>
  );
}

export function RatingsGuideButton({
  className = "",
  label = "How ratings work",
}: {
  className?: string;
  label?: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const onClick = (event: MouseEvent) => {
      if (event.target === dialog) dialog.close();
    };
    const onClose = () => setOpen(false);
    dialog.addEventListener("click", onClick);
    dialog.addEventListener("close", onClose);
    return () => {
      dialog.removeEventListener("click", onClick);
      dialog.removeEventListener("close", onClose);
    };
  }, []);

  return (
    <>
      <button
        type="button"
        className={`ratings-guide-trigger ${className}`.trim()}
        onClick={() => {
          setOpen(true);
          dialogRef.current?.showModal();
        }}
      >
        {label}
      </button>

      <dialog ref={dialogRef} className="ratings-guide" aria-labelledby={titleId}>
        {open ? <RatingsGuidePanel titleId={titleId} /> : null}
      </dialog>
    </>
  );
}
