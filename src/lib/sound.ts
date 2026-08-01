import type { CareerTier } from "@/types";

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

function rampTone(
  ctx: AudioContext,
  start: number,
  fromHz: number,
  toHz: number,
  duration: number,
  volume: number,
  type: OscillatorType = "triangle",
) {
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(fromHz, start);
  oscillator.frequency.exponentialRampToValueAtTime(
    Math.max(toHz, 1),
    start + duration,
  );
  gain.gain.setValueAtTime(volume, start);
  gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
  oscillator.connect(gain).connect(ctx.destination);
  oscillator.start(start);
  oscillator.stop(start + duration);
}

function playIfEnabled(play: (ctx: AudioContext, now: number) => void) {
  if (!isSoundEnabled()) return;
  const ctx = context();
  play(ctx, ctx.currentTime);
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
  playIfEnabled((ctx, now) => {
    tone(ctx, now, 980, 0.02, 0.035, "triangle");
    tone(ctx, now + 0.012, 640, 0.035, 0.022, "triangle");
  });
}

export function playSpinSound() {
  playIfEnabled((ctx, now) => {
    // Accelerating mechanical reel ticks.
    for (let i = 0; i < 15; i++) {
      const progress = i / 14;
      const start = now + i * (0.1 - progress * 0.025);
      tone(ctx, start, 155 + i * 7, 0.035, 0.035);
    }

    // Landing confirmation aligned with the 1.4 second reel animation.
    tone(ctx, now + 1.32, 440, 0.12, 0.055, "triangle");
    tone(ctx, now + 1.4, 660, 0.2, 0.045, "triangle");
  });
}

/** Attribute locked during draft. */
export function playLockSound() {
  playIfEnabled((ctx, now) => {
    tone(ctx, now, 520, 0.04, 0.028, "triangle");
    tone(ctx, now + 0.055, 780, 0.07, 0.034, "triangle");
  });
}

/** Build complete — reveal screen lands. */
export function playBuildCompleteSound() {
  playIfEnabled((ctx, now) => {
    tone(ctx, now, 220, 0.14, 0.032, "sawtooth");
    tone(ctx, now + 0.08, 440, 0.18, 0.042, "triangle");
    tone(ctx, now + 0.16, 660, 0.22, 0.036, "triangle");
    tone(ctx, now + 0.24, 880, 0.12, 0.022, "triangle");
  });
}

/** One season revealed during career replay drip. */
export function playSeasonTickSound() {
  playIfEnabled((ctx, now) => {
    tone(ctx, now, 380, 0.014, 0.016, "square");
  });
}

/** Championship season revealed — stronger than the drip tick. */
export function playTitleBeatSound() {
  playIfEnabled((ctx, now) => {
    tone(ctx, now, 110, 0.18, 0.038, "sawtooth");
    tone(ctx, now + 0.06, 220, 0.22, 0.044, "triangle");
    tone(ctx, now + 0.12, 330, 0.28, 0.036, "triangle");
    tone(ctx, now + 0.2, 440, 0.14, 0.024, "triangle");
  });
}

/** Career verdict screen opens. Louder for elite tiers. */
export function playVerdictSound(tier: CareerTier = "pointsRegular") {
  playIfEnabled((ctx, now) => {
    const strong =
      tier === "legend" || tier === "champion" || tier === "raceWinner";
    const baseVol = strong ? 0.048 : 0.034;

    tone(ctx, now, strong ? 165 : 185, 0.2, baseVol, "sawtooth");
    tone(ctx, now + 0.1, strong ? 330 : 370, 0.24, baseVol * 0.9, "triangle");
    tone(ctx, now + 0.2, strong ? 495 : 555, 0.18, baseVol * 0.7, "triangle");
    if (strong) {
      tone(ctx, now + 0.32, 660, 0.12, 0.022, "triangle");
    }
  });
}

/** Challenge objective cleared. */
export function playChallengeClearedSound() {
  playIfEnabled((ctx, now) => {
    rampTone(ctx, now, 440, 880, 0.14, 0.032, "triangle");
    tone(ctx, now + 0.12, 990, 0.1, 0.026, "triangle");
  });
}

/** Challenge objective failed. */
export function playChallengeFailedSound() {
  playIfEnabled((ctx, now) => {
    rampTone(ctx, now, 520, 280, 0.16, 0.028, "triangle");
    tone(ctx, now + 0.1, 220, 0.14, 0.022, "sawtooth");
  });
}

/** Legend slipped past the reels. */
export function playNearMissSound() {
  playIfEnabled((ctx, now) => {
    tone(ctx, now, 620, 0.05, 0.018, "triangle");
    tone(ctx, now + 0.04, 580, 0.06, 0.016, "triangle");
  });
}

/** Challenge spin armed for the next reel pull. */
export function playChallengeArmedSound() {
  playIfEnabled((ctx, now) => {
    rampTone(ctx, now, 280, 520, 0.08, 0.024, "square");
    tone(ctx, now + 0.06, 640, 0.04, 0.02, "triangle");
  });
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
