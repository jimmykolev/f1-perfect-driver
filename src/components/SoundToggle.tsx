import { useState } from "react";
import { isSoundEnabled, setSoundEnabled } from "@/lib/sound";

export function SoundToggle({ className = "" }: { className?: string }) {
  const [enabled, setEnabled] = useState(isSoundEnabled);

  return (
    <button
      type="button"
      className={`sound-toggle ${className}`.trim()}
      onClick={() => {
        const next = !enabled;
        setSoundEnabled(next);
        setEnabled(next);
      }}
      aria-pressed={enabled}
      aria-label={enabled ? "Mute sound" : "Enable sound"}
      title={enabled ? "Mute sound" : "Enable sound"}
    >
      {enabled ? "Sound on" : "Sound off"}
    </button>
  );
}
