import { useEffect, useId, useRef, type ReactNode } from "react";
import { offerRelative, TeamMove } from "@/components/careerUi";
import type { CareerSeatOffer, DecisionSnapshot } from "@/lib/careerSession";
import { useGameStore } from "@/store/gameStore";

function isSeatOffer(offer: CareerSeatOffer) {
  return (
    offer.kind === "stay" ||
    offer.kind === "reach" ||
    offer.kind === "fit" ||
    offer.kind === "safe" ||
    offer.kind === "number2"
  );
}

function choiceSummary(
  selected: CareerSeatOffer,
  decision: DecisionSnapshot,
): { className: string; body: ReactNode } {
  if (selected.kind === "retire") {
    return {
      className: "is-exit",
      body: (
        <>
          <span>Career move</span>
          Retire after {decision.seasonsDone} seasons. The story ends here.
        </>
      ),
    };
  }
  if (selected.kind === "sabbatical") {
    return {
      className: "is-exit",
      body: (
        <>
          <span>Career move</span>
          Sit out {decision.year}. Come back a year older looking for a seat.
        </>
      ),
    };
  }
  if (selected.kind === "number2") {
    return {
      className: "is-transfer",
      body: (
        <>
          <span>Number two</span>
          <TeamMove
            from={decision.currentTeam}
            to={selected.team}
            showTag={false}
          />
          Better car, smaller voice — signing for {decision.year}.
        </>
      ),
    };
  }

  const leaving =
    selected.kind !== "stay" && selected.team !== decision.currentTeam;
  if (leaving) {
    return {
      className: "is-transfer",
      body: (
        <>
          <span>Team move</span>
          <TeamMove
            from={decision.currentTeam}
            to={selected.team}
            showTag={false}
          />
          Signing for {decision.year}.
        </>
      ),
    };
  }

  return {
    className: "is-stay",
    body: (
      <>
        <span>{decision.marketMove ? "Accept" : "Re-sign"}</span>
        {decision.marketMove
          ? `Racing for ${selected.team} in ${decision.year}.`
          : `Staying at ${selected.team} for ${decision.year}.`}
      </>
    ),
  };
}

function ctaLabel(selected: CareerSeatOffer | null): string {
  if (!selected) return "Sign and continue";
  if (selected.kind === "retire") return "Retire from F1";
  if (selected.kind === "sabbatical") return "Sit out a year";
  if (selected.kind === "number2") return `Sign as #2 at ${selected.team}`;
  if (selected.kind !== "stay" && selected.team) {
    return `Move to ${selected.team}`;
  }
  return "Sign and continue";
}

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
    decision.offers.find((o) => o.id === selectedDecisionSeat) ?? null;
  const seatOffers = decision.offers.filter(isSeatOffer);
  const careerMoves = decision.offers.filter((o) => !isSeatOffer(o));
  const summary = selected ? choiceSummary(selected, decision) : null;

  const renderOffer = (offer: CareerSeatOffer) => {
    const isMove =
      offer.kind !== "stay" &&
      offer.kind !== "retire" &&
      offer.kind !== "sabbatical" &&
      offer.team !== decision.currentTeam;
    const relative = offerRelative(
      offer.rank,
      currentOffer.rank,
      offer.kind,
    );
    const careerPath =
      offer.kind === "retire" || offer.kind === "sabbatical";

    return (
      <button
        key={offer.id}
        type="button"
        className={`seat-offer seat-offer--${offer.kind} ${
          isMove ? "seat-offer--transfer" : ""
        } ${careerPath ? "seat-offer--career" : ""} ${
          selectedDecisionSeat === offer.id ? "is-selected" : ""
        }`}
        onClick={() => selectDecisionSeat(offer.id)}
        aria-pressed={selectedDecisionSeat === offer.id}
      >
        <span className="seat-offer__kind">{offer.label}</span>
        <span className={`seat-offer__relative is-${relative.tone}`}>
          {relative.label}
        </span>
        {careerPath ? (
          <strong>{offer.label}</strong>
        ) : isMove ? (
          <TeamMove
            from={decision.currentTeam}
            to={offer.team}
            showTag={false}
            className="seat-offer__route"
          />
        ) : (
          <strong>{offer.team}</strong>
        )}
        {!careerPath ? (
          <ul className="seat-offer__meta">
            <li>P{offer.rank} car</li>
            <li>Tier {offer.tier}</li>
            {offer.kind === "number2" ? <li>Support role</li> : null}
          </ul>
        ) : null}
        <p>{offer.blurb}</p>
      </button>
    );
  };

  return (
    <dialog ref={dialogRef} className="contract-modal" aria-labelledby={titleId}>
      <div className="contract-modal__panel">
        <header className="contract-modal__head">
          <div>
            <p className="eyebrow">
              {decision.drama
                ? `Crisis · winter ${decision.year - 1}/${decision.year}`
                : `Contract talks · winter ${decision.year - 1}/${decision.year}`}
            </p>
            <h2 id={titleId}>{driverName || "Your Driver"}</h2>
          </div>
          <form method="dialog">
            <button type="submit" className="btn btn-ghost contract-modal__close">
              Review seasons
            </button>
          </form>
        </header>

        {decision.drama ? (
          <div className={`contract-modal__drama is-${decision.drama.kind}`}>
            <span>Drama</span>
            <strong>{decision.drama.headline}</strong>
            <p>{decision.drama.detail}</p>
          </div>
        ) : null}

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

        <div className="contract-modal__group">
          <p className="contract-modal__group-label">Seats</p>
          <div className="seat-offers contract-modal__offers">
            {seatOffers.map(renderOffer)}
          </div>
        </div>

        {careerMoves.length > 0 ? (
          <div className="contract-modal__group">
            <p className="contract-modal__group-label">Career path</p>
            <div className="seat-offers contract-modal__offers contract-modal__offers--career">
              {careerMoves.map(renderOffer)}
            </div>
          </div>
        ) : null}

        {summary ? (
          <p className={`contract-modal__choice ${summary.className}`}>
            {summary.body}
          </p>
        ) : null}

        <div className="contract-modal__actions">
          <button
            type="button"
            className="btn btn-primary"
            disabled={!selectedDecisionSeat}
            onClick={resolveDecision}
          >
            {ctaLabel(selected)}
          </button>
        </div>
      </div>
    </dialog>
  );
}
