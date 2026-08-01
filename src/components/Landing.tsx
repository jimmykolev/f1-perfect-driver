import { useEffect, useState } from "react";
import { RatingsGuideButton } from "@/components/RatingsGuide";
import { SoundToggle } from "@/components/SoundToggle";
import { generateDriverName } from "@/lib/names";
import { datasetMeta, useGameStore } from "@/store/gameStore";

export function Landing() {
  const driverName = useGameStore((s) => s.driverName);
  const setName = useGameStore((s) => s.setName);
  const start = useGameStore((s) => s.start);
  const playgroundMode = useGameStore((s) => s.playgroundMode);
  const setPlaygroundMode = useGameStore((s) => s.setPlaygroundMode);
  const expertMode = useGameStore((s) => s.expertMode);
  const setExpertMode = useGameStore((s) => s.setExpertMode);
  const meta = datasetMeta();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const eyebrow = playgroundMode
    ? "Playground · Hand-pick · Simulate"
    : expertMode
      ? "Expert · Blind draft · Simulate"
      : "Spin · Draft · Simulate";

  const lede = playgroundMode
    ? "Build any frankenstein you want — max every attribute, or pull individual stats from any driver and year in the dataset, including pre-hybrid legends."
    : expertMode
      ? "Same draft, no numbers. You’ll see the driver, year, and season facts — pick attributes from memory. Ratings stay hidden until the build is complete."
      : "Spin a real F1 driver and season — modern grid, or a pre-hybrid top-ten season (icons land as Legends). Keep one attribute. Repeat until your frankenstein ace is complete.";

  return (
    <section className={`landing ${ready ? "is-ready" : ""}`}>
      <div className="landing__track" aria-hidden />
      <div className="landing__veil" />
      <div className="landing__content">
        <div className="landing__top">
          <p className="eyebrow landing__eyebrow">{eyebrow}</p>
          <SoundToggle />
        </div>
        <h1 className="brand">
          Perfect
          <span>Driver</span>
        </h1>
        <p className="landing__lede">{lede}</p>
        <form
          className="landing__form"
          onSubmit={(e) => {
            e.preventDefault();
            if (driverName.trim()) start();
          }}
        >
          <label htmlFor="driver-name">Name your creation</label>
          <div className="landing__name-row">
            <input
              id="driver-name"
              value={driverName}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Lando Hamilton"
              maxLength={32}
              autoComplete="off"
            />
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setName(generateDriverName(driverName))}
            >
              Auto name
            </button>
          </div>
          <button
            type="submit"
            className="btn btn-primary landing__cta"
            disabled={!driverName.trim()}
          >
            {playgroundMode
              ? "Open playground build"
              : expertMode
                ? "Start expert draft"
                : "Start drafting"}
          </button>
        </form>
        <div className="landing__meta">
          <p>
            Data from DriverDB · {meta.count} driver-seasons · {meta.years[0]}–
            {meta.years[meta.years.length - 1]}
          </p>
          <div className="landing__tools">
            <RatingsGuideButton />
            <div className="landing__modes">
              <button
                type="button"
                className={`mode-toggle ${expertMode ? "is-on" : ""}`}
                onClick={() => setExpertMode(!expertMode)}
                aria-pressed={expertMode}
              >
                {expertMode ? "Expert on" : "Expert"}
              </button>
              <button
                type="button"
                className={`mode-toggle ${playgroundMode ? "is-on" : ""}`}
                onClick={() => setPlaygroundMode(!playgroundMode)}
                aria-pressed={playgroundMode}
                aria-label={playgroundMode ? "Playground mode on" : "Playground mode"}
              >
                {playgroundMode ? "Playground on" : "Playground"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
