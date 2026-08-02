import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { offerRelative, TeamMove } from "@/components/careerUi";
import { teamStandingLabel } from "@/lib/careerOffers";
import {
  domainLabel,
  type DecisionDomain,
  type DecisionOption,
} from "@/lib/decisionEngine";
import type { CareerSeatOffer, DecisionSnapshot } from "@/lib/careerSession";
import { useGameStore } from "@/store/gameStore";

const DOMAIN_ORDER: DecisionDomain[] = [
  "seat",
  "orders",
  "rival",
  "contract",
  "paddock",
];

function optionToSeatOffer(option: DecisionOption): CareerSeatOffer | null {
  const seat = option.effects.find((e) => e.seatOffer)?.seatOffer;
  if (seat) return seat;
  if (!option.team || !option.kind) return null;
  return {
    id: option.id,
    team: option.team,
    tier: option.tier ?? 0,
    rank: option.rank ?? 0,
    label: option.label,
    blurb: option.blurb,
    kind: option.kind,
  };
}

function choiceSummary(
  selected: DecisionOption,
  decision: DecisionSnapshot,
): { className: string; body: ReactNode } {
  const seat = optionToSeatOffer(selected);
  if (selected.effects.some((e) => e.kind === "retire")) {
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
  if (selected.effects.some((e) => e.kind === "sabbatical")) {
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
  if (seat?.kind === "number2") {
    return {
      className: "is-transfer",
      body: (
        <>
          <span>Number two</span>
          <TeamMove
            from={decision.currentTeam}
            to={seat.team}
            showTag={false}
          />
          Better car, smaller voice — signing for {decision.year}.
        </>
      ),
    };
  }

  if (seat && seat.kind !== "stay" && seat.team !== decision.currentTeam) {
    return {
      className: "is-transfer",
      body: (
        <>
          <span>Team move</span>
          <TeamMove
            from={decision.currentTeam}
            to={seat.team}
            showTag={false}
          />
          Signing for {decision.year}.
        </>
      ),
    };
  }

  if (seat) {
    return {
      className: "is-stay",
      body: (
        <>
          <span>{decision.marketMove ? "Accept" : "Re-sign"}</span>
          {decision.marketMove
            ? `Racing for ${seat.team} in ${decision.year}.`
            : `Staying at ${seat.team} for ${decision.year}.`}
        </>
      ),
    };
  }

  return {
    className: "is-stay",
    body: (
      <>
        <span>{domainLabel(selected.domain)}</span>
        {selected.blurb}
      </>
    ),
  };
}

function ctaLabel(selected: DecisionOption | null): string {
  if (!selected) return "Confirm and continue";
  const seat = optionToSeatOffer(selected);
  if (selected.effects.some((e) => e.kind === "retire")) return "Retire from F1";
  if (selected.effects.some((e) => e.kind === "sabbatical")) return "Sit out a year";
  if (seat?.kind === "number2") return `Sign as #2 at ${seat.team}`;
  if (seat && seat.kind !== "stay" && seat.team) {
    return `Move to ${seat.team}`;
  }
  return "Confirm and continue";
}

function defaultActiveDomain(
  grouped: { domain: DecisionDomain; options: DecisionOption[] }[],
  selectedId: string | null,
  options: DecisionOption[],
): DecisionDomain {
  if (selectedId) {
    const selectedDomain = options.find((o) => o.id === selectedId)?.domain;
    if (selectedDomain) return selectedDomain;
  }
  return grouped[0]?.domain ?? "seat";
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
  const domainTabsId = useId();

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

  const grouped = useMemo(() => {
    if (!decision) return [];
    const map = new Map<DecisionDomain, DecisionOption[]>();
    for (const domain of DOMAIN_ORDER) map.set(domain, []);
    for (const option of decision.pack.options) {
      const list = map.get(option.domain) ?? [];
      list.push(option);
      map.set(option.domain, list);
    }
    return DOMAIN_ORDER.filter((d) => (map.get(d)?.length ?? 0) > 0).map(
      (domain) => ({ domain, options: map.get(domain)! }),
    );
  }, [decision]);

  const [activeDomain, setActiveDomain] = useState<DecisionDomain>("seat");

  useEffect(() => {
    if (!open || !decision) return;
    setActiveDomain(
      defaultActiveDomain(
        grouped,
        selectedDecisionSeat,
        decision.pack.options,
      ),
    );
  }, [open, decision, grouped, selectedDecisionSeat]);

  if (!decision) return null;

  const lastSeason = decision.lastSeason;
  const currentOffer =
    decision.offers.find((o) => o.kind === "stay") ?? decision.offers[0];
  const selected =
    decision.pack.options.find((o) => o.id === selectedDecisionSeat) ?? null;
  const summary = selected ? choiceSummary(selected, decision) : null;
  const activeGroup =
    grouped.find((g) => g.domain === activeDomain) ?? grouped[0];
  const showDomainTabs = grouped.length > 1;
  const gridSize =
    Math.max(decision.currentRank, ...decision.offers.map((o) => o.rank), 0) + 1;

  const renderSeatOption = (option: DecisionOption) => {
    const seat = optionToSeatOffer(option);
    const isMove =
      seat &&
      seat.kind !== "stay" &&
      seat.kind !== "retire" &&
      seat.kind !== "sabbatical" &&
      seat.team !== decision.currentTeam;
    const careerPath =
      option.effects.some((e) => e.kind === "retire" || e.kind === "sabbatical");
    const relative =
      seat && currentOffer && seat.kind !== "stay"
        ? offerRelative(seat.rank, currentOffer.rank, seat.kind)
        : null;

    return (
      <button
        key={option.id}
        type="button"
        className={`seat-offer seat-offer--${seat?.kind ?? option.domain} ${
          isMove ? "seat-offer--transfer" : ""
        } ${careerPath ? "seat-offer--career" : ""} ${
          selectedDecisionSeat === option.id ? "is-selected" : ""
        }`}
        onClick={() => selectDecisionSeat(option.id)}
        aria-pressed={selectedDecisionSeat === option.id}
      >
        <span className="seat-offer__kind">{option.label}</span>
        {careerPath ? (
          <strong>{option.label}</strong>
        ) : isMove && seat ? (
          <TeamMove
            from={decision.currentTeam}
            to={seat.team}
            showTag={false}
            className="seat-offer__route"
          />
        ) : seat ? (
          <strong>{seat.team}</strong>
        ) : (
          <strong>{option.label}</strong>
        )}
        {seat && !careerPath ? (
          <ul className="seat-offer__meta">
            {relative ? (
              <li className={`seat-offer__tag is-${relative.tone}`}>
                {relative.label}
              </li>
            ) : null}
            <li>{teamStandingLabel(seat.rank, gridSize)}</li>
            {seat.kind === "number2" ? <li>Support role</li> : null}
          </ul>
        ) : null}
        <p>{option.blurb}</p>
      </button>
    );
  };

  const renderStoryOption = (option: DecisionOption) => (
    <button
      key={option.id}
      type="button"
      className={`decision-story-option decision-story-option--${option.domain} ${
        selectedDecisionSeat === option.id ? "is-selected" : ""
      }`}
      onClick={() => selectDecisionSeat(option.id)}
      aria-pressed={selectedDecisionSeat === option.id}
    >
      <span className="decision-story-option__label">{option.label}</span>
      <span className="decision-story-option__blurb">{option.blurb}</span>
    </button>
  );

  const renderOption = (option: DecisionOption) =>
    option.domain === "seat"
      ? renderSeatOption(option)
      : renderStoryOption(option);

  return (
    <dialog ref={dialogRef} className="contract-modal" aria-labelledby={titleId}>
      <div className="contract-modal__panel">
        <header className="contract-modal__head">
          <div>
            <p className="eyebrow">{decision.pack.eyebrow}</p>
            <h2 id={titleId}>{decision.pack.headline}</h2>
            <p className="contract-modal__lede">{decision.pack.lede}</p>
          </div>
          <form method="dialog">
            <button type="submit" className="btn btn-ghost contract-modal__close">
              Review seasons
            </button>
          </form>
        </header>

        <div className="contract-modal__body">
          <aside className="contract-modal__context">
            <p className="contract-modal__driver">
              {driverName || "Your Driver"} · age {decision.age}
            </p>

            {!decision.midSeason && decision.marketMove ? (
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
            ) : !decision.midSeason ? (
              <div className="contract-modal__current">
                <span>Current seat</span>
                <strong>{decision.currentTeam}</strong>
              </div>
            ) : (
              <div className="contract-modal__current">
                <span>Mid-season</span>
                <strong>
                  Round {decision.pack.afterRound ?? "—"} · {decision.currentTeam}
                </strong>
              </div>
            )}

            {lastSeason ? (
              <p className="contract-modal__last">
                {decision.midSeason ? "Standings so far" : "Last year"} · P
                {lastSeason.position}
                {lastSeason.champion ? " champion" : ""} · {lastSeason.points} pts
                {lastSeason.wins > 0 ? ` · ${lastSeason.wins}W` : ""}
              </p>
            ) : null}
          </aside>

          <section
            className="contract-modal__choices"
            aria-labelledby={showDomainTabs ? domainTabsId : undefined}
          >
            {showDomainTabs ? (
              <div
                id={domainTabsId}
                className="contract-modal__domains season-tabs"
                role="tablist"
                aria-label="Decision categories"
              >
                {grouped.map(({ domain, options }) => (
                  <button
                    key={domain}
                    type="button"
                    role="tab"
                    id={`${domainTabsId}-${domain}`}
                    aria-selected={activeDomain === domain}
                    aria-controls={`${domainTabsId}-panel-${domain}`}
                    className={activeDomain === domain ? "is-active" : ""}
                    onClick={() => setActiveDomain(domain)}
                  >
                    {domainLabel(domain)}
                    <span className="contract-modal__domain-count">
                      {options.length}
                    </span>
                  </button>
                ))}
              </div>
            ) : activeGroup ? (
              <p className="contract-modal__group-label">
                {domainLabel(activeGroup.domain)}
              </p>
            ) : null}

            {activeGroup ? (
              <div
                id={`${domainTabsId}-panel-${activeGroup.domain}`}
                role={showDomainTabs ? "tabpanel" : undefined}
                aria-labelledby={
                  showDomainTabs ? `${domainTabsId}-${activeGroup.domain}` : undefined
                }
                className={`contract-modal__options ${
                  activeGroup.domain === "seat"
                    ? "seat-offers contract-modal__offers"
                    : "decision-story-list"
                }`}
              >
                {activeGroup.options.map(renderOption)}
              </div>
            ) : null}
          </section>
        </div>

        <footer className="contract-modal__footer">
          {summary ? (
            <p className={`contract-modal__choice ${summary.className}`}>
              {summary.body}
            </p>
          ) : (
            <p className="contract-modal__choice contract-modal__choice--hint">
              <span>Pick one</span>
              Choose an option above, then confirm to continue your career.
            </p>
          )}

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
        </footer>
      </div>
    </dialog>
  );
}
