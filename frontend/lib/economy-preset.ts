/**
 * Mirrors **`DEPLOY_ECONOMY`** on the contracts side for UI copy only.
 * Set **`NEXT_PUBLIC_DEPLOY_ECONOMY=testnet`** or **`mainnet`** to match how contracts were deployed
 * (`contracts/scripts/deploy.ts`). If unset, **`getUiEconomyPreset()`** behaves like testnet for labels;
 * dangerous debug UI uses **`isExplicitTestnetDeployEconomy()`** (requires literal `testnet`). Does not read chain state.
 */
export type UiEconomyPreset = "testnet" | "mainnet";

export function getUiEconomyPreset(): UiEconomyPreset {
  const raw = process.env.NEXT_PUBLIC_DEPLOY_ECONOMY?.trim().toLowerCase();
  return raw === "mainnet" ? "mainnet" : "testnet";
}

/**
 * `true` only when **`NEXT_PUBLIC_DEPLOY_ECONOMY=testnet`** is set explicitly.
 * Use for dangerous debug surfaces (e.g. owner `mintForTesting`) so missing env does not enable them in production builds.
 */
export function isExplicitTestnetDeployEconomy(): boolean {
  return process.env.NEXT_PUBLIC_DEPLOY_ECONOMY?.trim().toLowerCase() === "testnet";
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
    ? "10B CLICK cap, 30d vest, ~$0.10/click scale — align NEXT_PUBLIC_DEPLOY_ECONOMY=mainnet with deploy."
    : "1M cap, 10m vest, readable credits — default; matches DEPLOY_ECONOMY=testnet or unset.";
}
