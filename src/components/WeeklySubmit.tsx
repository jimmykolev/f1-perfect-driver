import { useState } from "react";
import {
  careerToSubmitPayload,
  loadSavedDisplayName,
  submitWeeklyRun,
  type WeeklySubmitResult,
} from "@/lib/weeklyLeaderboard";
import type { CareerResult } from "@/types";

export function WeeklySubmit({
  weekKey,
  driverName,
  career,
  onSubmitted,
}: {
  weekKey: string;
  driverName: string;
  career: CareerResult;
  onSubmitted?: (result: WeeklySubmitResult) => void;
}) {
  const [displayName, setDisplayName] = useState(
    () => loadSavedDisplayName() || driverName,
  );
  const [status, setStatus] = useState<
    "idle" | "submitting" | "ok" | "fail"
  >("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [rank, setRank] = useState<number | null>(null);

  return (
    <form
      className="weekly-submit"
      onSubmit={async (e) => {
        e.preventDefault();
        setStatus("submitting");
        setMessage(null);
        try {
          const result = await submitWeeklyRun(
            careerToSubmitPayload(weekKey, displayName, driverName, career),
          );
          setRank(result.rank);
          setStatus("ok");
          setMessage(
            result.board.localOnly
              ? `Saved locally at #${result.rank}${result.improved ? "" : " (best run kept)"}`
              : result.improved
                ? `You're #${result.rank} this week`
                : `Still #${result.rank} — best run kept`,
          );
          onSubmitted?.(result);
        } catch (err) {
          setStatus("fail");
          setMessage(err instanceof Error ? err.message : "Submit failed.");
        }
      }}
    >
      <div className="weekly-submit__head">
        <p className="eyebrow">Weekly Grid · {weekKey}</p>
        <h3>Submit to the board</h3>
        <p>Anonymous display name · one best run per device this week</p>
      </div>
      <label htmlFor="board-display-name">Display name</label>
      <div className="weekly-submit__row">
        <input
          id="board-display-name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          maxLength={24}
          autoComplete="nickname"
          placeholder="Name on the board"
        />
        <button
          type="submit"
          className="btn btn-primary"
          disabled={status === "submitting" || displayName.trim().length < 2}
        >
          {status === "submitting"
            ? "Submitting…"
            : status === "ok" && rank != null
              ? `Rank #${rank}`
              : "Submit run"}
        </button>
      </div>
      {message ? (
        <p
          className={
            status === "fail" ? "weekly-submit__msg is-fail" : "weekly-submit__msg"
          }
        >
          {message}
        </p>
      ) : null}
    </form>
  );
}
