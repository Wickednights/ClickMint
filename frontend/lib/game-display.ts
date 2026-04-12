import { formatEther, parseEther } from "viem";

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

/**
 * Human-readable **$CLICK** from wei for UI. **Truncates** (floors) to `maxFractionDigits` — never rounds up, so users never see
 * more than they can spend. If balance is positive but below one display step, shows `<0.01` (or `<0.001` for 3 decimals, etc.).
 */
export function formatClickDisplayWei(wei: bigint, maxFractionDigits = 2): string {
  if (wei === 0n) return "0";
  if (wei < 0n) return "—";
  const d = Math.min(18, Math.max(0, maxFractionDigits));
  const scale = 10n ** BigInt(18 - d);
  const truncWei = (wei / scale) * scale;
  if (wei > 0n && truncWei === 0n) {
    if (d === 0) return "<1";
    return `<0.${"0".repeat(d - 1)}1`;
  }
  const s = formatEther(truncWei);
  const [wholeRaw, fracRaw = ""] = s.split(".");
  const wholeWithSep = wholeRaw.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  if (d === 0) return wholeWithSep;
  const fracTrunc = fracRaw.slice(0, d).replace(/0+$/, "");
  if (fracTrunc === "") return wholeWithSep;
  return `${wholeWithSep}.${fracTrunc}`;
}

/**
 * Vault balances are **wei**; linear vesting means amounts are usually **not** whole multiples of
 * `baseClickReward`. Showing `wei / baseReward` as a “grant count” mislabels balances (e.g. “1 grant”
 * when the real claimable amount is fractional in grant units).
 */
function vaultAmountHeadline(wei: bigint): string {
  if (wei === 0n) return "0";
  return formatClickDisplayWei(wei, 2);
}

function grantHint(wei: bigint, baseRewardWei?: bigint): string | null {
  if (baseRewardWei === undefined || baseRewardWei === 0n || wei === 0n) return null;
  if (wei % baseRewardWei !== 0n) return null;
  const n = wei / baseRewardWei;
  return n === 1n ? "equals 1 base click reward" : `equals ${n.toLocaleString()} base click rewards`;
}

/**
 * `pendingVested` / unvested slice from CLICK (still locking in the vault).
 */
export function vestingVaultDisplay(wei: bigint, baseRewardWei?: bigint): {
  headline: string;
  caption: string;
} {
  const headline = vaultAmountHeadline(wei);
  const hint = grantHint(wei, baseRewardWei);
  const caption = hint ? `$CLICK unvested (${hint})` : "$CLICK unvested (linear vesting)";
  if (wei === 0n) return { headline: "0", caption: "$CLICK unvested (none)" };
  return { headline, caption };
}

/** `claimable` from CLICK — vested but not yet minted to wallet (`claimVested`). */
export function claimableVaultDisplay(wei: bigint, baseRewardWei?: bigint): {
  headline: string;
  caption: string;
} {
  const headline = vaultAmountHeadline(wei);
  const hint = grantHint(wei, baseRewardWei);
  const caption = hint ? `$CLICK claimable (${hint})` : "$CLICK vested — use Claim vested";
  if (wei === 0n) return { headline: "0", caption: "nothing to claim yet" };
  return { headline, caption };
}
