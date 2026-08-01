import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  buildAlternateHistory,
  hasAlternateHistory,
  type AltHistoryReport,
  type AltHistoryYear,
  type LegendImpact,
  type YearStatus,
} from "@/lib/altHistory";
import type { CareerResult } from "@/types";

type Tab = "timeline" | "legends" | "ledger";

const STATUS_LABEL: Record<YearStatus, string> = {
  youTook: "You took the title",
  flipped: "Title changed hands",
  held: "History held",
};

const STATUS_SHORT: Record<YearStatus, string> = {
  youTook: "Taken",
  flipped: "Rewritten",
  held: "Held",
};

function ordinal(n: number) {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
}

function YearStrip({
  years,
  active,
  onPick,
}: {
  years: AltHistoryYear[];
  active: number;
  onPick: (year: number) => void;
}) {
  return (
    <div className="ah-strip-wrap">
      <div
        className="ah-strip"
        role="tablist"
        aria-label="Career years compared with history"
      >
        {years.map((row) => (
          <button
            key={row.year}
            type="button"
            role="tab"
            aria-selected={row.year === active}
            className={`ah-strip__year is-${row.status} ${
              row.year === active ? "is-active" : ""
            }`}
            onClick={() => onPick(row.year)}
            title={`${row.year} — ${STATUS_LABEL[row.status]}`}
          >
            <span className="ah-strip__full">{row.year}</span>
            <span className="ah-strip__short" aria-hidden>
              {`'${String(row.year).slice(2)}`}
            </span>
            <i aria-hidden />
          </button>
        ))}
      </div>
      <ul className="ah-key" aria-label="Year status key">
        <li className="is-youTook">You took it</li>
        <li className="is-flipped">Changed hands</li>
        <li className="is-held">History held</li>
      </ul>
    </div>
  );
}

function ChampionCard({
  eyebrow,
  name,
  detail,
  tone,
}: {
  eyebrow: string;
  name: string;
  detail: string;
  tone: "real" | "sim" | "you";
}) {
  return (
    <div className={`ah-champ ah-champ--${tone}`}>
      <em>{eyebrow}</em>
      <strong>{name}</strong>
      <span>{detail}</span>
    </div>
  );
}

function YearDiff({ row }: { row: AltHistoryYear }) {
  const realName = row.realChampion?.name ?? "Unknown";
  const realDetail = row.realChampion
    ? `${row.realChampion.team} · ${row.realChampion.points} pts · ${row.realChampion.wins}W`
    : "No historical record";

  const simName = row.playerIsChampion ? "You" : row.simChampion.name;
  const simDetail = row.playerIsChampion
    ? `${row.playerTeam} · ${row.playerPoints} pts · ${row.playerWins}W`
    : `${row.simChampion.team || "—"} · ${row.simChampion.points} pts · ${row.simChampion.wins}W`;

  const swapLine =
    row.status === "youTook" && row.realChampion
      ? `Taken from ${row.realChampion.name}`
      : row.status === "flipped" && row.realChampion
        ? `${row.realChampion.name} → ${row.simChampion.name}`
        : row.status === "held"
          ? "Champion unchanged"
          : null;

  return (
    <div className={`ah-year is-${row.status}`}>
      <header className="ah-year__head">
        <div>
          <p className="ah-year__status">{STATUS_LABEL[row.status]}</p>
          <h3>{row.year}</h3>
        </div>
        {swapLine ? <p className="ah-year__swap">{swapLine}</p> : null}
      </header>

      <div className="ah-year__compare" aria-label="Real history versus your timeline">
        <ChampionCard
          eyebrow="Real history"
          name={realName}
          detail={realDetail}
          tone="real"
        />
        <span className="ah-year__vs" aria-hidden>
          vs
        </span>
        <ChampionCard
          eyebrow="Your timeline"
          name={simName}
          detail={simDetail}
          tone={row.playerIsChampion ? "you" : "sim"}
        />
      </div>

      <div className="ah-year__meta">
        <p>
          <em>Your seat</em>
          <span>
            {row.playerIsChampion
              ? `Champion · ${row.playerTeam}`
              : `${ordinal(row.playerPosition)} · ${row.playerTeam} · ${row.playerPoints} pts`}
            {row.simTeammate ? ` · with ${row.simTeammate.name}` : ""}
          </span>
        </p>
        {row.realLineup.length ? (
          <p>
            <em>That garage in reality</em>
            <span>
              {row.realLineup
                .map((s) => `${s.name} (P${s.position})`)
                .join(", ")}
            </span>
          </p>
        ) : null}
      </div>

      <p className="ah-note">{row.note}</p>
    </div>
  );
}

function TimelineTab({ report }: { report: AltHistoryReport }) {
  const notable =
    report.years.find((y) => y.status === "youTook") ??
    report.years.find((y) => y.status === "flipped") ??
    report.years[0]!;
  const [active, setActive] = useState(notable.year);
  const row = report.years.find((y) => y.year === active) ?? notable;

  return (
    <div className="ah-timeline">
      {report.fork ? (
        <p className="ah-fork">
          <em>The fork · {report.fork.year}</em>
          {report.fork.line}
        </p>
      ) : null}

      <YearStrip years={report.years} active={active} onPick={setActive} />
      <YearDiff row={row} />
    </div>
  );
}

function legendSummary(legend: LegendImpact): string {
  if (legend.isPlayer) {
    return `${legend.simTitles.length} title${
      legend.simTitles.length === 1 ? "" : "s"
    } that never existed`;
  }

  const parts: string[] = [];
  if (legend.lost.length) {
    parts.push(
      legend.simTitles.length === 0 &&
        legend.lost.length === legend.realTitles.length
        ? "Lost all"
        : `Lost ${legend.lost.length}`,
    );
  }
  if (legend.kept.length) parts.push(`kept ${legend.kept.length}`);
  if (legend.gained.length) parts.push(`gained ${legend.gained.length}`);

  if (!parts.length) return "Unchanged";
  return parts
    .map((part, i) =>
      i === 0 ? part : part.charAt(0).toLowerCase() + part.slice(1),
    )
    .join(", ");
}

function LegendRow({ legend }: { legend: LegendImpact }) {
  return (
    <li className={`ah-legend ${legend.isPlayer ? "is-you" : ""}`}>
      <p className="ah-legend__head">
        <strong>{legend.isPlayer ? `${legend.name} (you)` : legend.name}</strong>
        <span>{legendSummary(legend)}</span>
      </p>
      <div className="ah-legend__rows">
        <p>
          <em>In history</em>
          {legend.realTitles.length ? (
            <span className="ah-pips">
              {legend.realTitles.map((year) => (
                <i
                  key={year}
                  className={legend.lost.includes(year) ? "is-lost" : "is-kept"}
                >
                  {year}
                </i>
              ))}
            </span>
          ) : (
            <span className="ah-pips ah-pips--empty">Never champion</span>
          )}
        </p>
        <p>
          <em>In yours</em>
          {legend.simTitles.length ? (
            <span className="ah-pips">
              {legend.simTitles.map((year) => (
                <i
                  key={year}
                  className={
                    legend.gained.includes(year) ? "is-gained" : "is-kept"
                  }
                >
                  {year}
                </i>
              ))}
            </span>
          ) : (
            <span className="ah-pips ah-pips--empty">Never champion</span>
          )}
        </p>
      </div>
    </li>
  );
}

function LegendsTab({ report }: { report: AltHistoryReport }) {
  const [showQuiet, setShowQuiet] = useState(false);

  const impacted = report.legends.filter(
    (l) => l.isPlayer || l.lost.length || l.gained.length,
  );
  const quiet = report.legends.filter(
    (l) => !l.isPlayer && !l.lost.length && !l.gained.length,
  );
  const shown = showQuiet ? report.legends : impacted;

  return (
    <div className="ah-legends-tab">
      <p className="ah-hint">
        Struck years are titles they won in reality but never got here. Gold
        years are titles that only exist in your timeline.
      </p>
      <ul className="ah-legends">
        {shown.map((legend) => (
          <LegendRow key={legend.name} legend={legend} />
        ))}
      </ul>
      {quiet.length ? (
        <button
          type="button"
          className="btn btn-ghost ah-show-all"
          onClick={() => setShowQuiet((v) => !v)}
        >
          {showQuiet
            ? "Hide unchanged legends"
            : `Show ${quiet.length} unchanged`}
        </button>
      ) : null}
    </div>
  );
}

function LedgerTab({ report }: { report: AltHistoryReport }) {
  const rewritten = report.years.filter((y) => y.status !== "held");

  return (
    <div className="ah-ledger">
      <ul className="ah-ledger__story">
        {report.ledger.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>

      {rewritten.length ? (
        <div className="ah-ledger__years">
          <h3>Every rewritten title</h3>
          <ul>
            {rewritten.map((row) => (
              <li key={row.year} className={`is-${row.status}`}>
                <strong>{row.year}</strong>
                <span>{STATUS_SHORT[row.status]}</span>
                <em>
                  {row.realChampion?.name ?? "—"}
                  <i aria-hidden>→</i>
                  {row.playerIsChampion ? "You" : row.simChampion.name}
                </em>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function AltHistoryPanel({
  report,
  titleId,
}: {
  report: AltHistoryReport;
  titleId: string;
}) {
  const [tab, setTab] = useState<Tab>("timeline");

  const tabs: { id: Tab; label: string }[] = [
    { id: "timeline", label: "Timeline" },
    { id: "legends", label: "Legends" },
    { id: "ledger", label: "Ledger" },
  ];

  return (
    <div className="alt-history__panel">
      <div className="alt-history__sticky">
        <header className="alt-history__bar">
          <p className="eyebrow">Alternate history</p>
          <form method="dialog">
            <button type="submit" className="btn btn-ghost alt-history__close">
              Close
            </button>
          </form>
        </header>
        <div
          className="ah-tabs"
          role="tablist"
          aria-label="Alternate history views"
        >
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              id={`ah-tab-${item.id}`}
              aria-selected={tab === item.id}
              aria-controls={`ah-panel-${item.id}`}
              className={`ah-tab ${tab === item.id ? "is-active" : ""}`}
              onClick={() => setTab(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div
        className="alt-history__body"
        role="tabpanel"
        id={`ah-panel-${tab}`}
        aria-labelledby={`ah-tab-${tab}`}
      >
        <header className="alt-history__head">
          <h2 id={titleId}>{report.headline}</h2>
          <p className="alt-history__lede">{report.lede}</p>
          <ul className="ah-impact">
            <li>
              <strong>{report.titlesRewritten}</strong>
              <span>Titles changed</span>
            </li>
            <li>
              <strong>{report.titlesTaken}</strong>
              <span>Taken by you</span>
            </li>
            <li>
              <strong>
                {report.fromYear}–{report.toYear}
              </strong>
              <span>{report.yearsCompared} years</span>
            </li>
          </ul>
        </header>

        {tab === "timeline" ? <TimelineTab report={report} /> : null}
        {tab === "legends" ? <LegendsTab report={report} /> : null}
        {tab === "ledger" ? <LedgerTab report={report} /> : null}
      </div>
    </div>
  );
}

export function AltHistoryButton({
  career,
  playerName,
}: {
  career: CareerResult;
  playerName: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [open, setOpen] = useState(false);

  const report = useMemo(
    () => buildAlternateHistory(career, playerName),
    [career, playerName],
  );

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

  if (!report || !hasAlternateHistory(career)) return null;

  const triggerLabel =
    report.titlesTaken > 0
      ? `See the ${report.titlesTaken} title${report.titlesTaken === 1 ? "" : "s"} you took`
      : report.titlesRewritten > 0
        ? `See ${report.titlesRewritten} rewritten title${report.titlesRewritten === 1 ? "" : "s"}`
        : "See how you changed history";

  return (
    <>
      <button
        type="button"
        className="btn btn-ghost alt-history-trigger"
        onClick={() => {
          setOpen(true);
          dialogRef.current?.showModal();
        }}
      >
        {triggerLabel}
      </button>

      <dialog ref={dialogRef} className="alt-history" aria-labelledby={titleId}>
        {open ? <AltHistoryPanel report={report} titleId={titleId} /> : null}
      </dialog>
    </>
  );
}
