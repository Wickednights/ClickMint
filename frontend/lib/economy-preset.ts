/**
 * Mirrors **`DEPLOY_ECONOMY`** on the contracts side for UI copy only.
 * Set **`NEXT_PUBLIC_DEPLOY_ECONOMY=testnet`** (default if unset) or **`mainnet`** to match how the
 * deployed contracts were created (`contracts/scripts/deploy.ts`). This does not read chain state.
 */
export type UiEconomyPreset = "testnet" | "mainnet";

export function getUiEconomyPreset(): UiEconomyPreset {
  const raw = process.env.NEXT_PUBLIC_DEPLOY_ECONOMY?.trim().toLowerCase();
  return raw === "mainnet" ? "mainnet" : "testnet";
}

/** Short header label. */
export function economyPresetShortLabel(): string {
  return getUiEconomyPreset() === "mainnet" ? "Mainnet preset" : "Testnet preset";
}

/**
 * One-line hint: caps / vesting / click-cost intent. Keep in sync with `contracts/scripts/config/economy.ts`.
 */
export function economyPresetHint(): string {
  return getUiEconomyPreset() === "mainnet"
    ? "100B CLICK cap, 7d vest, ~1¢/click scale — align NEXT_PUBLIC_DEPLOY_ECONOMY=mainnet with deploy."
    : "1M cap, 10m vest, readable credits — default; matches DEPLOY_ECONOMY=testnet or unset.";
}
