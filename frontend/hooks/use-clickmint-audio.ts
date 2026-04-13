"use client";

import confetti from "canvas-confetti";
import { useCallback, useEffect, useRef, useState } from "react";

const MUSIC_PREF = "clickmint-pref-music";
const SFX_PREF = "clickmint-pref-sfx";

const SRC = {
  sfx: "/sounds/clickmint_crystal_chime.wav",
  ambient: "/sounds/cyberpunkbg.mp3",
  potWin: "/sounds/VICTORY_POT.mp3",
  nftWin: "/sounds/NFT_WIN.mp3",
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
 * Native Audio elements — fewer moving parts than use-sound/Howler with Next.js client bundles.
 */
export function useClickMintAudio() {
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const [musicOn, setMusicOnState] = useState(() => readBoolPref(MUSIC_PREF, false));
  const [sfxOn, setSfxOnState] = useState(() => readBoolPref(SFX_PREF, true));

  const clickBaseRef = useRef<HTMLAudioElement | null>(null);
  const ambientRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const clickEl = new Audio(SRC.sfx);
    clickEl.preload = "auto";
    clickBaseRef.current = clickEl;

    const amb = new Audio(SRC.ambient);
    amb.preload = "auto";
    amb.loop = true;
    ambientRef.current = amb;

    return () => {
      clickEl.pause();
      amb.pause();
      clickBaseRef.current = null;
      ambientRef.current = null;
    };
  }, []);

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

  useEffect(() => {
    const amb = ambientRef.current;
    if (!amb) return;
    if (musicOn && audioUnlocked) {
      amb.volume = 0.18;
      void amb.play().catch(() => {});
    } else {
      amb.pause();
    }
  }, [musicOn, audioUnlocked]);

  const setMusicOn = useCallback((value: boolean) => {
    setMusicOnState(value);
    writePref(MUSIC_PREF, value);
  }, []);

  const setSfxOn = useCallback((value: boolean) => {
    setSfxOnState(value);
    writePref(SFX_PREF, value);
  }, []);

  const playOneShot = useCallback(
    (volume: number) => {
      if (!sfxOn || !audioUnlocked) return;
      const base = clickBaseRef.current;
      if (!base) return;
      const el = base.cloneNode(true) as HTMLAudioElement;
      el.volume = volume;
      el.onended = () => el.remove();
      void el.play().catch(() => {});
    },
    [sfxOn, audioUnlocked]
  );

  const playClickSuccess = useCallback(() => playOneShot(0.48), [playOneShot]);

  const playMp3 = useCallback(
    (url: string, volume: number) => {
      if (!sfxOn || !audioUnlocked) return;
      const el = new Audio(url);
      el.preload = "auto";
      el.volume = volume;
      el.onended = () => el.remove();
      void el.play().catch(() => {});
    },
    [sfxOn, audioUnlocked]
  );

  const playWin = useCallback(() => playMp3(SRC.potWin, 0.55), [playMp3]);
  const playNft = useCallback(() => playMp3(SRC.nftWin, 0.52), [playMp3]);
  const playError = useCallback(() => playOneShot(0.2), [playOneShot]);

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
