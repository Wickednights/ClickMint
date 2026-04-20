import { ethers } from "hardhat";

/**
 * Single source of truth for **testnet** vs **mainnet** deploy presets.
 *
 * `deploy.ts` uses `DEPLOY_ECONOMY=testnet` (default) or `mainnet`.
 * `set-economy-round.ts` uses `ECONOMY=testnet|mainnet` for live `setEconomy` only (does not change caps or vesting).
 */

/** 1 ETH ~ this USD for mainnet pricing (edit before mainnet if market differs). */
export const MAINNET_ETH_USD = 3500n;

/** Must match `ClickMintGame.TROPHY_ROLL_DENOM` — probability per click = `weight / TROPHY_ROLL_DENOM`. */
export const TROPHY_ROLL_DENOM = 1_000_000_000n;

/** Mainnet: ~$0.10 per click in credit wei (10× one-cent at MAINNET_ETH_USD). */
export function mainnetClickCostCredits(): bigint {
  const weiPerCent = ethers.parseEther("1") / (MAINNET_ETH_USD * 100n);
  return weiPerCent * 10n;
}

/** CLICK minted per successful click: **1 CLICK** (1e18 wei). */
export const DEFAULT_BASE_CLICK_REWARD = ethers.parseEther("1");

export const DEFAULT_CLICK_PER_ETH_WEI = ethers.parseEther("1000");

/**
 * Trophy mint weight such that **expected** on-chain trophy mints reach **`trophyMaxSupply`**
 * when **`baseClickReward` wei of CLICK** has been minted **`75%` of `maxSupplyWei`** (i.e. at ~75% of max supply).
 * Uses ceiling division so the collection is expected to complete by that point (not after max CLICK).
 */
export function trophyDropWeightFor75PercentPacing(params: {
  trophyMaxSupply: bigint;
  maxSupplyWei: bigint;
  baseClickReward: bigint;
}): bigint {
  const { trophyMaxSupply, maxSupplyWei, baseClickReward } = params;
  if (trophyMaxSupply === 0n || baseClickReward === 0n) return 0n;
  const clicksAt75 = (75n * maxSupplyWei) / (100n * baseClickReward);
  if (clicksAt75 === 0n) return 0n;
  const num = trophyMaxSupply * TROPHY_ROLL_DENOM;
  return (num + clicksAt75 - 1n) / clicksAt75;
}

/** Minimum clicks per **minute round** to qualify for POT (mainnet-style). */
export const MAINNET_MIN_POT_CLICKS = 10n;
export const TESTNET_MIN_POT_CLICKS = 5n;

export const TESTNET_CLICK_COST_CREDITS = ethers.parseEther("0.0000001");

export type TokenBranding = {
  erc20Name: string;
  erc20Symbol: string;
  erc20PermitName: string;
  erc721Name: string;
  erc721Symbol: string;
};

export const TESTNET_PRESET = {
  name: "testnet" as const,
  branding: {
    erc20Name: "ClickMint Test",
    erc20Symbol: "tCLICK",
    erc20PermitName: "ClickMint Test",
    erc721Name: "ClickMint Test Binary Trophy",
    erc721Symbol: "tBTROPHY",
  } satisfies TokenBranding,
  maxSupplyWei: 1_000_000n * 10n ** 18n,
  trophyMaxSupply: 10n,
  vestingDurationSeconds: 600n,
  clicksPerHashTier: 50_000n,
  clickPerEthWei: DEFAULT_CLICK_PER_ETH_WEI,
  clickCostCredits: TESTNET_CLICK_COST_CREDITS,
  baseClickReward: ethers.parseEther("1"),
  minPotClicks: TESTNET_MIN_POT_CLICKS,
} as const;

/** Mainnet-style: **10B** cap, **30d** vesting, **~$0.10/click**, **1 CLICK/click**, tighter hash tier. */
export const MAINNET_PRESET = {
  name: "mainnet" as const,
  branding: {
    erc20Name: "ClickMint",
    erc20Symbol: "CLICK",
    erc20PermitName: "ClickMint",
    erc721Name: "ClickMint Binary Trophy",
    erc721Symbol: "BTROPHY",
  } satisfies TokenBranding,
  /** 10_000_000_000 * 1e18 */
  maxSupplyWei: 10_000_000_000n * 10n ** 18n,
  trophyMaxSupply: 10_000n,
  /** 2_592_000 s = 30 days */
  vestingDurationSeconds: 2_592_000n,
  clicksPerHashTier: 1_000n,
  clickPerEthWei: DEFAULT_CLICK_PER_ETH_WEI,
  clickCostCredits: mainnetClickCostCredits(),
  baseClickReward: DEFAULT_BASE_CLICK_REWARD,
  minPotClicks: MAINNET_MIN_POT_CLICKS,
} as const;

export type EconomyPreset = "testnet" | "mainnet";

export type GameEconomyParams = {
  clickPerEthWei: bigint;
  clickCostCredits: bigint;
  baseClickReward: bigint;
};

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
    trophyDropWeight: trophyDropWeightFor75PercentPacing({
      trophyMaxSupply: p.trophyMaxSupply,
      maxSupplyWei: p.maxSupplyWei,
      baseClickReward: p.baseClickReward,
    }),
    minPotClicks: p.minPotClicks,
  };
}

export function vestingSecondsForDeploy(preset: EconomyPreset): bigint {
  return (preset === "mainnet" ? MAINNET_PRESET : TESTNET_PRESET).vestingDurationSeconds;
}

export function tokenBrandingForDeploy(preset: EconomyPreset): TokenBranding {
  return preset === "mainnet" ? MAINNET_PRESET.branding : TESTNET_PRESET.branding;
}

export function deployPresetFromEnv(): EconomyPreset {
  const raw = process.env.DEPLOY_ECONOMY?.trim().toLowerCase();
  if (raw === "mainnet") return "mainnet";
  if (raw && raw !== "testnet") {
    console.warn(`DEPLOY_ECONOMY="${process.env.DEPLOY_ECONOMY}" is not testnet|mainnet — using testnet.`);
  }
  return "testnet";
}
