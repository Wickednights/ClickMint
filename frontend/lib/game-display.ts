import { parseEther } from "viem";

/** Deposit grid step — used only for “~N deposit steps” hint, not on-chain click cost. */
export const DISPLAY_PLAY_ETH = 0.001;
const WEI_PER_BUDGET_STEP = parseEther("0.001");

/**
 * On-chain clicks still available: credits / clickCost. Use when `clickCostCredits > 0`.
 * Integer math — avoids float drift (e.g. 0.021 ETH credits showing 20 instead of 21 steps).
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

/**
 * Whole-number style for tiny CLICK balances: prefer “≈ N × base rewards”, then milli-CLICK, then raw wei.
 */
export function formatClickWhole(wei: bigint, baseRewardWei?: bigint): string {
  if (wei === 0n) return "0";
  if (baseRewardWei !== undefined && baseRewardWei > 0n) {
    const multiples = wei / baseRewardWei;
    const rem = wei % baseRewardWei;
    if (multiples > 0n) {
      return rem === 0n ? `${multiples.toLocaleString()}× reward` : `≈ ${multiples.toLocaleString()}× reward`;
    }
  }
  const milli = 10n ** 15n; // 0.001 CLICK
  const m = wei / milli;
  if (m > 0n) return `${m.toLocaleString()} mCLICK`;
  const micro = 10n ** 12n;
  const u = wei / micro;
  if (u > 0n) return `${u.toLocaleString()} µCLICK`;
  return `${wei.toLocaleString()} wei`;
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
