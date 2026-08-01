import { useEffect, useId, useRef } from "react";
import { offerRelative, TeamMove } from "@/components/careerUi";
import { useGameStore } from "@/store/gameStore";

export function CareerDecision({
  open,
  onDismiss,
}: {
  open: boolean;
  onDismiss: () => void;
}) {
  const driverName = useGameStore((s) => s.driverName);
  const decision = useGameStore((s) => s.decision);
  const selectedDecisionSeat = useGameStore((s) => s.selectedDecisionSeat);
  const selectDecisionSeat = useGameStore((s) => s.selectDecisionSeat);
  const resolveDecision = useGameStore((s) => s.resolveDecision);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closingRef = useRef(false);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      closingRef.current = true;
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleClose = () => {
      // Closing to show the season log is a dismissal; closing because the
      // simulation moved on is not.
      if (closingRef.current) {
        closingRef.current = false;
        return;
      }
      onDismiss();
    };
    const handleBackdrop = (event: MouseEvent) => {
      if (event.target === dialog) dialog.close();
    };

    dialog.addEventListener("close", handleClose);
    dialog.addEventListener("click", handleBackdrop);
    return () => {
      dialog.removeEventListener("close", handleClose);
      dialog.removeEventListener("click", handleBackdrop);
    };
  }, [onDismiss]);

  if (!decision) return null;

  const last = decision.lastSeason;
  const currentOffer =
    decision.offers.find((o) => o.kind === "stay") ?? decision.offers[0]!;
  const selected =
    decision.offers.find((o) => o.team === selectedDecisionSeat) ?? null;
  const leaving =
    selected != null &&
    selected.kind !== "stay" &&
    selected.team !== decision.currentTeam;

  return (
    <dialog ref={dialogRef} className="contract-modal" aria-labelledby={titleId}>
      <div className="contract-modal__panel">
        <header className="contract-modal__head">
          <div>
            <p className="eyebrow">
              Contract talks · winter {decision.year - 1}/{decision.year}
            </p>
            <h2 id={titleId}>{driverName || "Your Driver"}</h2>
          </div>
          <form method="dialog">
            <button type="submit" className="btn btn-ghost contract-modal__close">
              Review seasons
            </button>
          </form>
        </header>

        {decision.marketMove ? (
          <div className="contract-modal__current is-move">
            <span>Winter move</span>
            <TeamMove
              from={decision.marketMove.from}
              to={decision.marketMove.to}
              showTag={false}
            />
            <em>
              {decision.marketMove.promoted
                ? `${decision.marketMove.to} came for you before talks opened.`
                : `${decision.marketMove.from} moved on. ${decision.marketMove.to} is your seat now.`}
            </em>
          </div>
        ) : (
          <div className="contract-modal__current">
            <span>Current seat</span>
            <strong>{decision.currentTeam}</strong>
          </div>
        )}

        <p className="contract-modal__last">
          Last year · P{last.position}
          {last.champion ? " champion" : ""} · {last.points} pts
          {last.wins > 0 ? ` · ${last.wins}W` : ""}
        </p>

        <div className="seat-offers contract-modal__offers">
          {decision.offers.map((offer) => {
            const isMove =
              offer.kind !== "stay" && offer.team !== decision.currentTeam;
            const relative = offerRelative(
              offer.rank,
              currentOffer.rank,
              offer.kind,
            );
            return (
              <button
                key={`${offer.kind}-${offer.team}`}
                type="button"
                className={`seat-offer seat-offer--${offer.kind} ${
                  isMove ? "seat-offer--transfer" : ""
                } ${selectedDecisionSeat === offer.team ? "is-selected" : ""}`}
                onClick={() => selectDecisionSeat(offer.team)}
                aria-pressed={selectedDecisionSeat === offer.team}
              >
                <span className="seat-offer__kind">{offer.label}</span>
                <span className={`seat-offer__relative is-${relative.tone}`}>
                  {relative.label}
                </span>
                {isMove ? (
                  <TeamMove
                    from={decision.currentTeam}
                    to={offer.team}
                    showTag={false}
                    className="seat-offer__route"
                  />
                ) : (
                  <strong>{offer.team}</strong>
                )}
                <ul className="seat-offer__meta">
                  <li>P{offer.rank} car</li>
                  <li>Tier {offer.tier}</li>
                </ul>
                <p>{offer.blurb}</p>
              </button>
            );
          })}
        </div>

        {selected ? (
          <p
            className={`contract-modal__choice ${
              leaving ? "is-transfer" : "is-stay"
            }`}
          >
            {leaving ? (
              <>
                <span>Team move</span>
                <TeamMove
                  from={decision.currentTeam}
                  to={selected.team}
                  showTag={false}
                />
                Signing for {decision.year}.
              </>
            ) : (
              <>
                <span>{decision.marketMove ? "Accept" : "Re-sign"}</span>
                {decision.marketMove
                  ? `Racing for ${selected.team} in ${decision.year}.`
                  : `Staying at ${selected.team} for ${decision.year}.`}
              </>
            )}
          </p>
        ) : null}

        <div className="contract-modal__actions">
          <button
            type="button"
            className="btn btn-primary"
            disabled={!selectedDecisionSeat}
            onClick={resolveDecision}
          >
            {leaving ? `Move to ${selected?.team}` : "Sign and continue"}
          </button>
        </div>
      </div>
    </dialog>
  );
}
