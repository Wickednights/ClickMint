import type { Address } from "viem";
import { isClickmintBaseMainnet } from "@/lib/clickmint-chain";

const ZERO = "0x0000000000000000000000000000000000000000" as Address;

/** Base Sepolia — last known test deploy. Override with `NEXT_PUBLIC_*` in `.env.local`. */
export const baseSepoliaDeployed = {
  click: "0xeB4928cf96D10F47d76d5997Ef1179c242C95Dc1",
  treasury: "0x9869d1e0e4416b7e3B246D9C444a6355cA19344c",
  secretPrizeWallet: "0xeCB7132cc27e177f7028475f58Ee8b3D43F074E2",
  binaryTrophyNft: "0xd190828F946659a1ff338AD6bC6BAF7C59f9eefD",
  escrow: "0x3F71C068aaC3359332E5c464E91F0c8b23dF590a",
  game: "0x1EFf9a6c3F3C438a2929301d1AEeD9D048f04D6B",
} as const satisfies Record<string, Address>;

/**
 * Base mainnet — fill after deploy in **`docs/DEPLOYMENT_ADDRESSES.md`** and set `NEXT_PUBLIC_*`.
 * Until then, all contract reads must use env vars (`NEXT_PUBLIC_CHAIN_ID=8453`).
 */
export const baseMainnetDeployed = {
  click: ZERO,
  treasury: ZERO,
  secretPrizeWallet: ZERO,
  binaryTrophyNft: ZERO,
  escrow: ZERO,
  game: ZERO,
} as const satisfies Record<keyof typeof baseSepoliaDeployed, Address>;

function readAddr(primary?: string, alternatives: Array<string | undefined> = []): Address | undefined {
  const candidates = [primary, ...alternatives].filter((x): x is string => typeof x === "string" && x.length > 0);
  for (const raw of candidates) {
    const v = raw.trim().replace(/^["']|["']$/g, "");
    if (v.startsWith("0x") && v.length === 42) return v as Address;
  }
  return undefined;
}

function resolve(env: Address | undefined, fallback: Address, envHint: string): Address {
  if (env) return env;
  if (isClickmintBaseMainnet() && fallback === ZERO) {
    throw new Error(
      `Base mainnet (${envHint}): set the variable in .env / Vercel. See docs/HOWTO.md and docs/DEPLOYMENT_ADDRESSES.md.`
    );
  }
  return fallback;
}

export function getGameAddress(): Address {
  return resolve(
    readAddr(process.env.NEXT_PUBLIC_GAME_ADDRESS, [process.env.NEXT_PUBLIC_CLICKMINT_GAME_ADDRESS]),
    isClickmintBaseMainnet() ? baseMainnetDeployed.game : baseSepoliaDeployed.game,
    "NEXT_PUBLIC_GAME_ADDRESS"
  );
}

export function getClickAddress(): Address {
  return resolve(
    readAddr(process.env.NEXT_PUBLIC_CLICK_ADDRESS),
    isClickmintBaseMainnet() ? baseMainnetDeployed.click : baseSepoliaDeployed.click,
    "NEXT_PUBLIC_CLICK_ADDRESS"
  );
}

export function getTreasuryAddress(): Address {
  return resolve(
    readAddr(process.env.NEXT_PUBLIC_TREASURY_ADDRESS),
    isClickmintBaseMainnet() ? baseMainnetDeployed.treasury : baseSepoliaDeployed.treasury,
    "NEXT_PUBLIC_TREASURY_ADDRESS"
  );
}

export function getSecretWalletAddress(): Address {
  return resolve(
    readAddr(process.env.NEXT_PUBLIC_SECRET_WALLET_ADDRESS),
    isClickmintBaseMainnet() ? baseMainnetDeployed.secretPrizeWallet : baseSepoliaDeployed.secretPrizeWallet,
    "NEXT_PUBLIC_SECRET_WALLET_ADDRESS"
  );
}

export function getTrophyNftAddress(): Address {
  return resolve(
    readAddr(process.env.NEXT_PUBLIC_TROPHY_NFT_ADDRESS),
    isClickmintBaseMainnet() ? baseMainnetDeployed.binaryTrophyNft : baseSepoliaDeployed.binaryTrophyNft,
    "NEXT_PUBLIC_TROPHY_NFT_ADDRESS"
  );
}

export function getEscrowAddress(): Address {
  return resolve(
    readAddr(process.env.NEXT_PUBLIC_ESCROW_ADDRESS),
    isClickmintBaseMainnet() ? baseMainnetDeployed.escrow : baseSepoliaDeployed.escrow,
    "NEXT_PUBLIC_ESCROW_ADDRESS"
  );
}
