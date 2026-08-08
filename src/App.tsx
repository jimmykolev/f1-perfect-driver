import { useEffect } from "react";
import { Career } from "@/components/Career";
import { CareerSimulation } from "@/components/CareerSimulation";
import { Draft } from "@/components/Draft";
import { EraSelect } from "@/components/EraSelect";
import { Landing } from "@/components/Landing";
import { Reveal } from "@/components/Reveal";
import { SeatChoice } from "@/components/SeatChoice";
import { TeamCarDraft } from "@/components/TeamCarDraft";
import { TeamPrincipalDraft } from "@/components/TeamPrincipalDraft";
import { TeamSeasonResult } from "@/components/TeamSeasonResult";
import { TeamSeasonRun } from "@/components/TeamSeasonRun";
import { TeamSeatDraft } from "@/components/TeamSeatDraft";
import { TeamSheet } from "@/components/TeamSheet";
import { TeamYearSelect } from "@/components/TeamYearSelect";
import { installClickSounds } from "@/lib/sound";
import {
  decisionsProgressActive,
  tryRestoreDecisions,
  useGameStore,
} from "@/store/gameStore";
import {
  teamSessionActive,
  tryRestoreTeam,
  useTeamStore,
} from "@/store/teamStore";

export default function App() {
  const phase = useGameStore((s) => s.phase);
  const teamPhase = useTeamStore((s) => s.phase);

  useEffect(() => installClickSounds(), []);

  useEffect(() => {
    tryRestoreTeam();
    tryRestoreDecisions();
  }, []);

  useEffect(() => {
    const onLeave = (event: BeforeUnloadEvent) => {
      if (!decisionsProgressActive() && !teamSessionActive()) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [phase, teamPhase]);

  if (teamPhase !== "idle") {
    return (
      <div className="app-shell">
        {teamPhase === "carDraft" && <TeamCarDraft />}
        {teamPhase === "seatDraft" && <TeamSeatDraft />}
        {teamPhase === "principalDraft" && <TeamPrincipalDraft />}
        {teamPhase === "sheet" && <TeamSheet />}
        {teamPhase === "yearSelect" && <TeamYearSelect />}
        {teamPhase === "seasonRun" && <TeamSeasonRun />}
        {teamPhase === "seasonResult" && <TeamSeasonResult />}
      </div>
    );
  }

  return (
    <div className="app-shell">
      {phase === "landing" && <Landing />}
      {phase === "draft" && <Draft />}
      {phase === "reveal" && <Reveal />}
      {phase === "era" && <EraSelect />}
      {phase === "seat" && <SeatChoice />}
      {phase === "simulate" && <CareerSimulation />}
      {phase === "career" && <Career />}
    </div>
  );
}
