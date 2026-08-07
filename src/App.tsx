import { useEffect } from "react";
import { Career } from "@/components/Career";
import { CareerSimulation } from "@/components/CareerSimulation";
import { Draft } from "@/components/Draft";
import { EraSelect } from "@/components/EraSelect";
import { Landing } from "@/components/Landing";
import { Reveal } from "@/components/Reveal";
import { SeatChoice } from "@/components/SeatChoice";
import { installClickSounds } from "@/lib/sound";
import {
  decisionsProgressActive,
  tryRestoreDecisions,
  useGameStore,
} from "@/store/gameStore";

export default function App() {
  const phase = useGameStore((s) => s.phase);

  useEffect(() => installClickSounds(), []);

  useEffect(() => {
    tryRestoreDecisions();
  }, []);

  useEffect(() => {
    const onLeave = (event: BeforeUnloadEvent) => {
      if (!decisionsProgressActive()) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [phase]);

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
