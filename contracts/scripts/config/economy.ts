import { ethers } from "hardhat";

/**
 * Single source of truth for **testnet** vs **mainnet** deploy presets.
 *
 * `deploy.ts` uses `DEPLOY_ECONOMY=testnet` (default) or `mainnet`.
 * `set-economy-round.ts` uses `ECONOMY=testnet|mainnet` for live `setEconomy` only (does not change caps or vesting — those are immutable from deploy).
 *
 * On-chain economy (ClickMintGame constructor / `setEconomy`):
 * - `credits` are wei-sized; each `click()` burns `clickCostCredits` wei.
 * - Mainnet target (~1 cent per click): when 1 ETH is ~ $3,500, one cent = 1/350,000 ETH in credit wei.
 * - Testnet uses a larger `clickCostCredits` so the UI shows human-scale Click Credits.
 */

/** 1 ETH ~ this USD for mainnet cent pricing (edit before mainnet if market differs). */
export const MAINNET_ETH_USD = 3500n;

/** Mainnet: ~1 US cent worth of credit wei per click at MAINNET_ETH_USD. */
export function mainnetClickCostCredits(): bigint {
  const weiPerCent = ethers.parseEther("1") / (MAINNET_ETH_USD * 100n);
  return weiPerCent > 0n ? weiPerCent : 1n;
}

/** CLICK minted into vesting per successful click (wei, 18 decimals). */
export const DEFAULT_BASE_CLICK_REWARD = ethers.parseEther("10");

/** Pot: CLICK wei minted per 1 ETH of pot (shared; tune per product if needed). */
export const DEFAULT_CLICK_PER_ETH_WEI = ethers.parseEther("1000");

/**
 * Testnet: **0.00001 ETH** of credits per click → ~100 clicks from **0.001 ETH** (before bonuses).
 */
export const TESTNET_CLICK_COST_CREDITS = ethers.parseEther("0.00001");

// ---------------------------------------------------------------------------
// Full deploy presets (caps, vesting, game economy, hash tier)
// ---------------------------------------------------------------------------

/** Base Sepolia / QA — small cap, short vesting, readable credits, fast trophy season. */
export const TESTNET_PRESET = {
  name: "testnet" as const,
  /** 1_000_000 * 1e18 — exercise `CLICKBadSupply` and endgame paths quickly. */
  maxSupplyWei: 1_000_000n * 10n ** 18n,
  /** 10 trophies max on testnet. */
  trophyMaxSupply: 10n,
  /** 600 seconds (10 minutes) — full vesting cycle in one session. */
  vestingDurationSeconds: 600n,
  /** Looser clickhash ramp for manual E2E. */
  clicksPerHashTier: 50_000n,
  clickPerEthWei: DEFAULT_CLICK_PER_ETH_WEI,
  clickCostCredits: TESTNET_CLICK_COST_CREDITS,
  baseClickReward: DEFAULT_BASE_CLICK_REWARD,
} as const;

/** Production-style: 100B cap, 7d vesting, ~1 cent/click, 10k trophies, tighter hash tier. */
export const MAINNET_PRESET = {
  name: "mainnet" as const,
  /** 100_000_000_000 * 1e18 */
  maxSupplyWei: 100_000_000_000n * 10n ** 18n,
  trophyMaxSupply: 10_000n,
  /** 604_800 seconds (7 days). */
  vestingDurationSeconds: 604_800n,
  clicksPerHashTier: 2_500n,
  clickPerEthWei: DEFAULT_CLICK_PER_ETH_WEI,
  clickCostCredits: mainnetClickCostCredits(),
  baseClickReward: DEFAULT_BASE_CLICK_REWARD,
} as const;

export type EconomyPreset = "testnet" | "mainnet";

export type GameEconomyParams = {
  clickPerEthWei: bigint;
  clickCostCredits: bigint;
  baseClickReward: bigint;
};

/** Game-only params (also used by `set-economy-round.ts`). */
export const TESTNET_ECONOMY: GameEconomyParams = {
  clickPerEthWei: TESTNET_PRESET.clickPerEthWei,
  clickCostCredits: TESTNET_PRESET.clickCostCredits,
  baseClickReward: TESTNET_PRESET.baseClickReward,
};

export const MAINNET_ECONOMY: GameEconomyParams = {
  clickPerEthWei: MAINNET_PRESET.clickPerEthWei,
  clickCostCredits: MAINNET_PRESET.clickCostCredits,
  baseClickReward: MAINNET_PRESET.baseClickReward,
};

export function economyForDeploy(preset: EconomyPreset): GameEconomyParams {
  return preset === "mainnet" ? MAINNET_ECONOMY : TESTNET_ECONOMY;
}

export function supplyCapsAndDifficulty(preset: EconomyPreset) {
  const p = preset === "mainnet" ? MAINNET_PRESET : TESTNET_PRESET;
  return {
    maxSupplyWei: p.maxSupplyWei,
    trophyMaxSupply: p.trophyMaxSupply,
    clicksPerHashTier: p.clicksPerHashTier,
  };
}

export function vestingSecondsForDeploy(preset: EconomyPreset): bigint {
  return (preset === "mainnet" ? MAINNET_PRESET : TESTNET_PRESET).vestingDurationSeconds;
}

/** Resolve `DEPLOY_ECONOMY` env; default **testnet**. Unknown values log a warning and fall back to testnet. */
export function deployPresetFromEnv(): EconomyPreset {
  const raw = process.env.DEPLOY_ECONOMY?.trim().toLowerCase();
  if (raw === "mainnet") return "mainnet";
  if (raw && raw !== "testnet") {
    console.warn(`DEPLOY_ECONOMY="${process.env.DEPLOY_ECONOMY}" is not testnet|mainnet — using testnet.`);
  }
  return "testnet";
}
