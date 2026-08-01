import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  isSoundEnabled,
  playBuildCompleteSound,
  playClickSound,
  playLockSound,
  playSeasonTickSound,
  playSpinSound,
  playVerdictSound,
  setSoundEnabled,
} from "./sound";

describe("sound", () => {
  const storage = new Map<string, string>();

  beforeEach(() => {
    storage.clear();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
    });
    vi.stubGlobal(
      "AudioContext",
      vi.fn(function MockAudioContext(this: {
        state: string;
        currentTime: number;
        createOscillator: () => object;
        createGain: () => object;
        destination: object;
      }) {
        this.state = "running";
        this.currentTime = 0;
        this.destination = {};
        this.createOscillator = vi.fn(() => ({
          type: "square",
          frequency: {
            setValueAtTime: vi.fn(),
            exponentialRampToValueAtTime: vi.fn(),
          },
          connect: vi.fn().mockReturnThis(),
          start: vi.fn(),
          stop: vi.fn(),
        }));
        this.createGain = vi.fn(() => ({
          gain: {
            setValueAtTime: vi.fn(),
            exponentialRampToValueAtTime: vi.fn(),
          },
          connect: vi.fn().mockReturnThis(),
        }));
      }),
    );
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("defaults to sound enabled", () => {
    expect(isSoundEnabled()).toBe(true);
  });

  it("persists mute state", () => {
    setSoundEnabled(false);
    expect(isSoundEnabled()).toBe(false);
    setSoundEnabled(true);
    expect(isSoundEnabled()).toBe(true);
  });

  it("does not create audio when muted", () => {
    setSoundEnabled(false);
    playClickSound();
    playSpinSound();
    playLockSound();
    playBuildCompleteSound();
    playSeasonTickSound();
    playVerdictSound("champion");
    expect(AudioContext).not.toHaveBeenCalled();
  });

  it("creates audio when enabled", () => {
    playClickSound();
    expect(AudioContext).toHaveBeenCalled();
  });
});
