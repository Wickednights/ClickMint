import type { Chain } from "wagmi/chains";
import { base, baseSepolia } from "wagmi/chains";

/**
 * Target chain for this deployment (wagmi, viem, address fallbacks).
 * Set **`NEXT_PUBLIC_CHAIN_ID=8453`** for Base mainnet QA / production.
 * Omit or **`84532`** for Base Sepolia (default).
 */
export function clickmintChainId(): number {
  const raw = process.env.NEXT_PUBLIC_CHAIN_ID?.trim();
  if (raw === String(base.id)) return base.id;
  return baseSepolia.id;
}

export function clickmintChain(): Chain {
  return clickmintChainId() === base.id ? base : baseSepolia;
}

export function isClickmintBaseMainnet(): boolean {
  return clickmintChainId() === base.id;
}

/** Human-readable network label for toasts and UI copy. */
export function clickmintChainLabel(): string {
  return isClickmintBaseMainnet() ? "Base" : "Base Sepolia";
}
