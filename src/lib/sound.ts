const SOUND_KEY = "perfect-driver-sound";

let audioContext: AudioContext | null = null;

function context() {
  audioContext ??= new AudioContext();
  if (audioContext.state === "suspended") void audioContext.resume();
  return audioContext;
}

function tone(
  ctx: AudioContext,
  start: number,
  frequency: number,
  duration: number,
  volume: number,
  type: OscillatorType = "square",
) {
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(volume, start);
  gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
  oscillator.connect(gain).connect(ctx.destination);
  oscillator.start(start);
  oscillator.stop(start + duration);
}

export function isSoundEnabled() {
  try {
    return localStorage.getItem(SOUND_KEY) !== "off";
  } catch {
    return true;
  }
}

export function setSoundEnabled(on: boolean) {
  try {
    localStorage.setItem(SOUND_KEY, on ? "on" : "off");
  } catch {
    /* ignore */
  }
}

/** Soft UI tick for button presses. */
export function playClickSound() {
  if (!isSoundEnabled()) return;
  const ctx = context();
  const now = ctx.currentTime;
  tone(ctx, now, 980, 0.02, 0.035, "triangle");
  tone(ctx, now + 0.012, 640, 0.035, 0.022, "triangle");
}

export function playSpinSound() {
  if (!isSoundEnabled()) return;
  const ctx = context();
  const now = ctx.currentTime;

  // Accelerating mechanical reel ticks.
  for (let i = 0; i < 15; i++) {
    const progress = i / 14;
    const start = now + i * (0.1 - progress * 0.025);
    tone(ctx, start, 155 + i * 7, 0.035, 0.035);
  }

  // Landing confirmation aligned with the 1.4 second reel animation.
  tone(ctx, now + 1.32, 440, 0.12, 0.055, "triangle");
  tone(ctx, now + 1.4, 660, 0.2, 0.045, "triangle");
}

const CLICK_SELECTOR =
  'button, [role="button"], input[type="submit"], input[type="button"]';

/** Play a click when the user activates a button-like control. */
export function installClickSounds() {
  const onPointer = (event: Event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const control = target.closest(CLICK_SELECTOR);
    if (!control) return;
    if (control.closest("[data-no-click-sound]")) return;
    if (
      control instanceof HTMLButtonElement ||
      control instanceof HTMLInputElement
    ) {
      if (control.disabled) return;
    }
    playClickSound();
  };

  document.addEventListener("pointerdown", onPointer, true);
  return () => document.removeEventListener("pointerdown", onPointer, true);
}
