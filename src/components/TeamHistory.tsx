import { useState } from "react";
import {
  clearTeamHistory,
  getTeamHistory,
  pickBestTeamChase,
} from "@/lib/teamArchive";

export function TeamHistory() {
  const [entries, setEntries] = useState(() => getTeamHistory());
  const best = pickBestTeamChase(entries);

  if (!best) {
    return (
      <p className="landing__mode-note">
        No chases archived yet — lock a roster and run a season.
      </p>
    );
  }

  return (
    <div className="career-history team-history">
      <div className="career-history__best">
        <p className="eyebrow">Personal best</p>
        <strong>
          {best.teamName} · {best.year}
        </strong>
        <span>
          {best.gradeLabel} · {best.wins}/{best.calendarLength} wins
        </span>
        <em>{best.archetype}</em>
      </div>
      {entries.length > 1 ? (
        <p className="landing__mode-note">
          {entries.length} chases saved in this browser.
        </p>
      ) : null}
      <button
        type="button"
        className="btn btn-ghost"
        onClick={() => {
          if (!window.confirm("Clear Perfect Team history on this device?")) {
            return;
          }
          clearTeamHistory();
          setEntries([]);
        }}
      >
        Clear history
      </button>
    </div>
  );
}
