import { parseEther } from "viem";

/**
 * Display helpers for on-chain wei-sized credits and $CLICK vaults.
 * **Testnet** deploys use larger `clickCostCredits` (see `contracts/scripts/config/economy.ts` TESTNET_PRESET)
 * so "plays left" stays readable. **Mainnet** preset uses ~1 cent/click scale; set `NEXT_PUBLIC_DEPLOY_ECONOMY`
 * in the frontend to match your deploy for header copy only.
 */
const BPS = 10_000n;

/**
 * Mirrors `ClickMintGame._depositBonusWei` — bonus added to `credits` on each `deposit()`.
 */
export function depositBonusWei(depositWei: bigint): bigint {
  if (depositWei >= parseEther("1")) return (depositWei * 1000n) / BPS;
  if (depositWei >= parseEther("0.5")) return (depositWei * 700n) / BPS;
  if (depositWei >= parseEther("0.25")) return (depositWei * 500n) / BPS;
  if (depositWei >= parseEther("0.1")) return (depositWei * 300n) / BPS;
  if (depositWei >= parseEther("0.01")) return (depositWei * 100n) / BPS;
  return 0n;
}

/** Total credit wei granted for a deposit (principal + tier bonus). */
export function creditsGrantedOnDeposit(depositWei: bigint): bigint {
  return depositWei + depositBonusWei(depositWei);
}

/** Human label for deposit tier bonus, e.g. "+1% bonus credits". */
export function depositBonusLabel(depositWei: bigint): string | null {
  const b = depositBonusWei(depositWei);
  if (b === 0n) return null;
  const pct = (b * BPS) / depositWei;
  return `+${(Number(pct) / 100).toFixed(pct % 100n === 0n ? 0 : 1)}% bonus credits`;
}

/**
 * On-chain clicks available: credit balance / per-click cost.
 */
export function onChainPlaysRemaining(creditsWei: bigint | undefined, clickCostWei: bigint | undefined): bigint {
  if (creditsWei === undefined || creditsWei === 0n) return 0n;
  if (clickCostWei === undefined || clickCostWei === 0n) return 0n;
  return creditsWei / clickCostWei;
}

/** Click credits preview for a deposit amount (whole number). */
export function clickCreditsFromDeposit(depositWei: bigint, clickCostWei: bigint | undefined): bigint {
  return onChainPlaysRemaining(creditsGrantedOnDeposit(depositWei), clickCostWei);
}

/**
 * Click Credits and other “count” displays that must stay human-readable — **no** T+/B+ rounding.
 * (Abbreviated `formatPlayCountBigint` made 1-wei click costs look like “30,999T+”.)
 */
export function formatWholeCredits(n: bigint): string {
  if (n < 0n) return "0";
  return n.toLocaleString("en-US");
}

/** Abbreviate for compact UI where huge numbers are unexpected (e.g. leaderboards). */
export function formatPlayCountBigint(n: bigint): string {
  if (n < 0n) return "0";
  if (n >= 1_000_000_000_000n) return `${(n / 1_000_000_000_000n).toLocaleString()}T+`;
  if (n >= 1_000_000_000n) return `${(n / 1_000_000_000n).toLocaleString()}B+`;
  if (n >= 1_000_000n) return `${(n / 1_000_000n).toLocaleString()}M+`;
  if (n >= 10_000n) return `${(n / 1000n).toLocaleString()}K+`;
  return n.toLocaleString("en-US");
}

/**
 * True when `clickCostCredits` is positive but far below the designed ~cent-scale cost.
 * Usually means test `setEconomy` left cost at **1 wei** — not a contract bug; fix via owner script.
 */
export function isTinyClickCostWei(clickCostWei: bigint | undefined): boolean {
  if (clickCostWei === undefined || clickCostWei === 0n) return false;
  return clickCostWei < parseEther("0.000001");
}

export function trimEtherString(s: string): string {
  if (!s.includes(".")) return s;
  const t = s.replace(/\.?0+$/, "");
  return t === "" ? "0" : t;
}

const ONE_CLICK = parseEther("1");

/**
 * Whole-number $CLICK vesting vault display (no wei decimals in UI).
 */
export function vestingVaultDisplay(wei: bigint, baseRewardWei?: bigint): {
  headline: string;
  caption: string;
} {
  if (wei === 0n) {
    return { headline: "0", caption: "$CLICK in vesting" };
  }
  if (baseRewardWei !== undefined && baseRewardWei > 0n) {
    const grants = wei / baseRewardWei;
    if (grants > 0n) {
      return {
        headline: grants.toLocaleString(),
        caption: grants === 1n ? "$CLICK grant vesting" : "$CLICK grants vesting",
      };
    }
  }
  const whole = wei / ONE_CLICK;
  if (whole > 0n) {
    return { headline: whole.toLocaleString(), caption: "whole $CLICK unvested" };
  }
  return { headline: "0", caption: "$CLICK in vesting" };
}

export function claimableVaultDisplay(wei: bigint, baseRewardWei?: bigint): {
  headline: string;
  caption: string;
} {
  if (wei === 0n) {
    return { headline: "0", caption: "$CLICK ready to claim" };
  }
  if (baseRewardWei !== undefined && baseRewardWei > 0n) {
    const grants = wei / baseRewardWei;
    if (grants > 0n) {
      return {
        headline: grants.toLocaleString(),
        caption: grants === 1n ? "vested $CLICK grant" : "vested $CLICK grants",
      };
    }
  }
  const whole = wei / ONE_CLICK;
  if (whole > 0n) {
    return { headline: whole.toLocaleString(), caption: "whole $CLICK claimable" };
  }
  return { headline: "0", caption: "$CLICK ready to claim" };
}
