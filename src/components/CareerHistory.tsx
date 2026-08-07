import { useMemo, useState } from "react";
import {
  clearCareerHistory,
  getCareerHistory,
  pickPersonalBest,
} from "@/lib/careerArchive";

export function CareerHistory() {
  const [tick, setTick] = useState(0);
  const entries = useMemo(() => {
    void tick;
    return getCareerHistory();
  }, [tick]);

  if (!entries.length) return null;

  const best = pickPersonalBest(entries);
  if (!best) return null;

  const titles = best.titles === 1 ? "1 title" : `${best.titles} titles`;

  return (
    <p className="career-history career-history--quiet">
      <span>
        Beat this · {best.tierLabel} · {best.driverName} · {titles}
      </span>
      <button
        type="button"
        className="career-history__clear"
        onClick={() => {
          if (!window.confirm("Clear career history on this device?")) return;
          clearCareerHistory();
          setTick((n) => n + 1);
        }}
      >
        Clear
      </button>
    </p>
  );
}
