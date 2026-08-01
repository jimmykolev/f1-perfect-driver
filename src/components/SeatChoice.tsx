import data from "@/data/driverSeasons.json";
import { useGameStore } from "@/store/gameStore";
import type { DriverDataFile } from "@/types";

const dataset = data as DriverDataFile;

/** Who actually drove for this team in the debut year. */
function historicalLineup(year: number, team: string): string[] {
  return dataset.seasons
    .filter((s) => s.year === year && s.team === team)
    .sort((a, b) => a.position - b.position)
    .map((s) => s.name);
}

export function SeatChoice() {
  const driverName = useGameStore((s) => s.driverName);
  const startYear = useGameStore((s) => s.startYear);
  const seatOffers = useGameStore((s) => s.seatOffers);
  const selectedSeat = useGameStore((s) => s.selectedSeat);
  const selectSeat = useGameStore((s) => s.selectSeat);
  const simulate = useGameStore((s) => s.simulate);
  const traits = useGameStore((s) => s.traits);
  const goToEraChoice = useGameStore((s) => s.goToEraChoice);
  const reset = useGameStore((s) => s.reset);

  const selected = seatOffers.find((o) => o.team === selectedSeat) ?? null;
  const lineup = selected ? historicalLineup(startYear, selected.team) : [];

  return (
    <section className="seat-choice">
      <header className="seat-choice__hero">
        <p className="eyebrow">Contract talks · {startYear}</p>
        <h1 className="seat-choice__name">{driverName || "Your Driver"}</h1>
        <p className="seat-choice__lede">
          Three seats on the {startYear} grid. Reach for the faster car, take
          the market fit, or play it safe.
        </p>
        {traits.length ? (
          <ul className="trait-chips">
            {traits.map((trait) => (
              <li key={trait.id} title={trait.blurb}>
                {trait.name}
              </li>
            ))}
          </ul>
        ) : null}
      </header>

      <div className="seat-offers">
        {seatOffers.map((offer) => (
          <button
            key={offer.team}
            type="button"
            className={`seat-offer seat-offer--${offer.kind} ${
              selectedSeat === offer.team ? "is-selected" : ""
            }`}
            onClick={() => selectSeat(offer.team)}
            aria-pressed={selectedSeat === offer.team}
          >
            <span className="seat-offer__kind">{offer.label}</span>
            <strong>{offer.team}</strong>
            <p>{offer.blurb}</p>
          </button>
        ))}
      </div>

      {selected && lineup.length ? (
        <p className="seat-choice__displace">
          Signing for {selected.team} means taking a seat from the {startYear}{" "}
          pairing of {lineup.join(" and ")}. One of them loses the drive.
        </p>
      ) : null}

      <div className="seat-choice__actions">
        <button
          type="button"
          className="btn btn-primary"
          disabled={!selectedSeat}
          onClick={simulate}
        >
          Sign and start career
        </button>
        <button type="button" className="btn btn-ghost" onClick={goToEraChoice}>
          Change season
        </button>
        <button type="button" className="btn btn-ghost" onClick={reset}>
          New driver
        </button>
      </div>
    </section>
  );
}
