import { formatEther, parseEther } from "viem";

/** Deposit grid step — “credit steps” UX, not on-chain click cost. */
export const DISPLAY_PLAY_ETH = 0.001;
const WEI_PER_BUDGET_STEP = parseEther("0.001");

/** If per-click cost is below this (in wei), UI shows ETH-backed credits instead of credits÷cost (avoids trillion-scale counts). */
export const DUST_CLICK_COST_WEI = parseEther("0.00001");

export function isDustClickCost(clickCostWei: bigint | undefined): boolean {
  return clickCostWei !== undefined && clickCostWei > 0n && clickCostWei < DUST_CLICK_COST_WEI;
}

/**
 * On-chain clicks still available: credits / clickCost. Use when showing raw counter and cost is not dust.
 */
export function onChainPlaysRemaining(creditsWei: bigint | undefined, clickCostWei: bigint | undefined): bigint {
  if (creditsWei === undefined || creditsWei === 0n) return 0n;
  if (clickCostWei === undefined || clickCostWei === 0n) return 0n;
  return creditsWei / clickCostWei;
}

/** How many 0.001 ETH “budget steps” credits equal (deposit UX only). */
export function budgetStepsFromCredits(creditsWei: bigint | undefined): bigint {
  if (creditsWei === undefined || creditsWei === 0n) return 0n;
  return creditsWei / WEI_PER_BUDGET_STEP;
}

/** Abbreviate large integer counts for UI (no scientific notation). */
export function formatPlayCountBigint(n: bigint): string {
  if (n < 0n) return "0";
  if (n >= 1_000_000_000_000n) return `${(n / 1_000_000_000_000n).toLocaleString()}T+`;
  if (n >= 1_000_000_000n) return `${(n / 1_000_000_000n).toLocaleString()}B+`;
  if (n >= 1_000_000n) return `${(n / 1_000_000n).toLocaleString()}M+`;
  if (n >= 10_000n) return `${(n / 1000n).toLocaleString()}K+`;
  return n.toLocaleString("en-US");
}

export function trimEtherString(s: string): string {
  if (!s.includes(".")) return s;
  const t = s.replace(/\.?0+$/, "");
  return t === "" ? "0" : t;
}

/**
 * Human-readable vesting vault slice: whole number = count of per-click grants when baseReward fits,
 * never “×” (reads as multiply). Subcaption is always exact CLICK (trimmed ether).
 */
export function vestingVaultDisplay(wei: bigint, baseRewardWei?: bigint): {
  headline: string;
  caption: string;
  exactClick: string;
} {
  const exactClick = `${trimEtherString(formatEther(wei))} CLICK`;
  if (wei === 0n) {
    return { headline: "0", caption: "CLICK in vesting", exactClick };
  }
  if (baseRewardWei !== undefined && baseRewardWei > 0n) {
    const grants = wei / baseRewardWei;
    if (grants > 0n) {
      return {
        headline: grants.toLocaleString(),
        caption: grants === 1n ? "per-click grant vesting" : "per-click grants vesting",
        exactClick,
      };
    }
  }
  return {
    headline: trimEtherString(formatEther(wei)),
    caption: "CLICK unvested",
    exactClick,
  };
}

export function claimableVaultDisplay(wei: bigint, baseRewardWei?: bigint): {
  headline: string;
  caption: string;
  exactClick: string;
} {
  const exactClick = `${trimEtherString(formatEther(wei))} CLICK`;
  if (wei === 0n) {
    return { headline: "0", caption: "ready to claim", exactClick };
  }
  if (baseRewardWei !== undefined && baseRewardWei > 0n) {
    const grants = wei / baseRewardWei;
    if (grants > 0n) {
      return {
        headline: grants.toLocaleString(),
        caption: grants === 1n ? "vested grant claimable" : "vested grants claimable",
        exactClick,
      };
    }
  }
  return {
    headline: trimEtherString(formatEther(wei)),
    caption: "CLICK claimable",
    exactClick,
  };
}

/** @deprecated Use `onChainPlaysRemaining` + bigint; kept for any stray imports. */
export function estimatedPlaysFromCreditsWei(creditsWei: bigint | undefined): number {
  if (creditsWei === undefined || creditsWei === 0n) return 0;
  return Number(budgetStepsFromCredits(creditsWei));
}

/** @deprecated Prefer `formatPlayCountBigint`. */
export function formatPlayCount(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "0";
  return formatPlayCountBigint(BigInt(Math.floor(n)));
}
