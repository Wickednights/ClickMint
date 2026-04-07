"use client";

import confetti from "canvas-confetti";
import { useCallback, useEffect, useState } from "react";
import useSound from "use-sound";

const MUSIC_PREF = "clickmint-pref-music";
const SFX_PREF = "clickmint-pref-sfx";

export const SOUND_PATHS = {
  click: "/sounds/click.mp3",
  win: "/sounds/win.mp3",
  nftDrop: "/sounds/nft-drop.mp3",
  error: "/sounds/error.mp3",
  ambient: "/sounds/ambient.mp3",
} as const;

function readBoolPref(key: string, defaultValue: boolean) {
  if (typeof window === "undefined") return defaultValue;
  try {
    const v = window.localStorage.getItem(key);
    if (v === null) return defaultValue;
    return v === "1";
  } catch {
    return defaultValue;
  }
}

function writePref(key: string, value: boolean) {
  try {
    window.localStorage.setItem(key, value ? "1" : "0");
  } catch {
    /* noop */
  }
}

export function celebratePotWin() {
  void confetti({
    particleCount: 140,
    spread: 68,
    origin: { y: 0.72 },
    scalar: 0.95,
    ticks: 220,
    gravity: 0.9,
    colors: ["#00fbfb", "#a78bfa", "#f0fdfa", "#22d3ee"],
  });
}

/**
 * Game audio via use-sound (Howler). SFX respect SFX toggle + user gesture.
 * Background loop respects music toggle + gesture; starts/stops via Howlers when prefs change.
 */
export function useClickMintAudio() {
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const [musicOn, setMusicOnState] = useState(() => readBoolPref(MUSIC_PREF, false));
  const [sfxOn, setSfxOnState] = useState(() => readBoolPref(SFX_PREF, true));

  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") return;
    const mark = () => setAudioUnlocked(true);
    document.addEventListener("pointerdown", mark, { capture: true, passive: true });
    document.addEventListener("keydown", mark, { capture: true, passive: true });
    return () => {
      document.removeEventListener("pointerdown", mark, { capture: true });
      document.removeEventListener("keydown", mark, { capture: true });
    };
  }, []);

  const sfxActive = sfxOn && audioUnlocked;
  const musicActive = musicOn && audioUnlocked;

  const [playClickSfx] = useSound(SOUND_PATHS.click, {
    volume: 0.42,
    interrupt: true,
    soundEnabled: sfxActive,
  });
  const [playWinSfx] = useSound(SOUND_PATHS.win, {
    volume: 0.5,
    interrupt: false,
    soundEnabled: sfxActive,
  });
  const [playNftSfx] = useSound(SOUND_PATHS.nftDrop, {
    volume: 0.48,
    interrupt: false,
    soundEnabled: sfxActive,
  });
  const [playErrorSfx] = useSound(SOUND_PATHS.error, {
    volume: 0.38,
    interrupt: true,
    soundEnabled: sfxActive,
  });
  const [playAmbient, { stop: stopAmbient }] = useSound(SOUND_PATHS.ambient, {
    volume: 0.16,
    loop: true,
    soundEnabled: musicActive,
  });

  useEffect(() => {
    if (musicActive) playAmbient();
    else stopAmbient();
  }, [musicActive, playAmbient, stopAmbient]);

  const setMusicOn = useCallback((value: boolean) => {
    setMusicOnState(value);
    writePref(MUSIC_PREF, value);
  }, []);

  const setSfxOn = useCallback((value: boolean) => {
    setSfxOnState(value);
    writePref(SFX_PREF, value);
  }, []);

  const playClickSuccess = useCallback(() => {
    playClickSfx();
  }, [playClickSfx]);

  const playWin = useCallback(() => {
    playWinSfx();
  }, [playWinSfx]);

  const playNft = useCallback(() => {
    playNftSfx();
  }, [playNftSfx]);

  const playError = useCallback(() => {
    playErrorSfx();
  }, [playErrorSfx]);

  const celebrateWin = useCallback(() => {
    celebratePotWin();
  }, []);

  return {
    audioUnlocked,
    musicOn,
    setMusicOn,
    sfxOn,
    setSfxOn,
    playClickSuccess,
    playWin,
    playNft,
    playError,
    celebrateWin,
  };
}
