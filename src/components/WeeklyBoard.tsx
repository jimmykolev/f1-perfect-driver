import { useEffect, useId, useRef, useState } from "react";
import {
  getOrCreateClientId,
  loadWeeklyBoard,
  type WeeklyBoardSnapshot,
} from "@/lib/weeklyLeaderboard";

function WeeklyBoardPanel({
  weekKey,
  label,
  titleId,
  onClose,
}: {
  weekKey: string;
  label: string;
  titleId: string;
  onClose: () => void;
}) {
  const [board, setBoard] = useState<WeeklyBoardSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [clientId] = useState(() => getOrCreateClientId());

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadWeeklyBoard(weekKey).then((snap) => {
      if (cancelled) return;
      setBoard(snap);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [weekKey]);

  const top = board?.entries.slice(0, 12) ?? [];

  return (
    <div className="weekly-board-modal__panel">
      <div className="weekly-board-modal__head">
        <div>
          <p className="eyebrow">Classification</p>
          <h2 id={titleId} className="weekly-board-modal__title">
            This week's board
          </h2>
          <p className="weekly-board-modal__meta">
            {label} · {weekKey}
            {board?.localOnly ? " · local preview" : ""}
          </p>
        </div>
        <button
          type="button"
          className="btn btn-ghost weekly-board-modal__close"
          onClick={onClose}
        >
          Close
        </button>
      </div>

      {loading ? (
        <p className="weekly-board-modal__empty">Loading board…</p>
      ) : top.length === 0 ? (
        <p className="weekly-board-modal__empty">
          No runs yet. Draft the grid and submit your career.
        </p>
      ) : (
        <ol className="weekly-board-modal__list">
          {top.map((entry, i) => {
            const mine = entry.clientId === clientId;
            return (
              <li
                key={entry.clientId}
                className={
                  mine
                    ? "weekly-board-modal__row is-mine"
                    : "weekly-board-modal__row"
                }
              >
                <span className="weekly-board-modal__rank">{i + 1}</span>
                <span className="weekly-board-modal__who">
                  <strong>{entry.displayName}</strong>
                  <span>{entry.driverName}</span>
                </span>
                <span className="weekly-board-modal__stats">
                  <em>{entry.tierLabel}</em>
                  <span>
                    {entry.titles}T · {entry.wins}W
                  </span>
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

export function WeeklyBoardButton({
  weekKey,
  label,
  className = "",
}: {
  weekKey: string;
  label: string;
  className?: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const onClose = () => setOpen(false);
    dialog.addEventListener("close", onClose);
    return () => dialog.removeEventListener("close", onClose);
  }, []);

  const close = () => {
    dialogRef.current?.close();
  };

  return (
    <>
      <button
        type="button"
        className={`weekly-board-trigger ${className}`.trim()}
        onClick={() => {
          setOpen(true);
          dialogRef.current?.showModal();
        }}
      >
        View board
      </button>

      <dialog
        ref={dialogRef}
        className="weekly-board-modal"
        aria-labelledby={titleId}
        onClick={(e) => {
          if (e.target === dialogRef.current) close();
        }}
      >
        {open ? (
          <WeeklyBoardPanel
            weekKey={weekKey}
            label={label}
            titleId={titleId}
            onClose={close}
          />
        ) : null}
      </dialog>
    </>
  );
}
