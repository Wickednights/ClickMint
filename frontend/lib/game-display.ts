import { formatEther } from "viem";

/** One “play” in the UI = this much ETH worth of credits (matches quick-buy steps). */
export const DISPLAY_PLAY_ETH = 0.001;

/**
 * How many 0.001-ETH “plays” credits represent (floored). Uses float — fine for UI up to ~1e15 wei.
 */
export function estimatedPlaysFromCreditsWei(creditsWei: bigint | undefined): number {
  if (creditsWei === undefined || creditsWei === 0n) return 0;
  const eth = Number(formatEther(creditsWei));
  if (!Number.isFinite(eth)) return 0;
  return Math.max(0, Math.floor(eth / DISPLAY_PLAY_ETH));
}

/** Compact label for play counts without giant digit strings. */
export function formatPlayCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 100_000) return `${Math.round(n / 1000)}K`;
  if (n >= 10_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}K`;
  return n.toLocaleString("en-US");
}
