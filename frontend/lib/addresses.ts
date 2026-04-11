import type { Address } from "viem";

/** Base Sepolia — deployed ClickMint Phase 1. Override with `NEXT_PUBLIC_*` in `.env.local`. */
export const baseSepoliaDeployed = {
  click: "0x6CB127e069D98F6A0B1851585670495DA93cB5D5",
  treasury: "0x3B04A33D89F114185FF7194a1f8b13b086999471",
  secretPrizeWallet: "0xB4BD710d5691Dbb7BF02791ddAd9f818F4a47Af5",
  binaryTrophyNft: "0xE367E485fF1C2946d4435bab6649C576Ca526476",
  escrow: "0x2457623b777DE271CDC9d9D37E3a93f19fcc5960",
  game: "0xEA612843365Cc1B53f9FC6988d6edD54aeD84013",
} as const satisfies Record<string, Address>;

function readAddr(primary?: string, alternatives: Array<string | undefined> = []): Address | undefined {
  const candidates = [primary, ...alternatives].filter((x): x is string => typeof x === "string" && x.length > 0);
  for (const raw of candidates) {
    const v = raw.trim().replace(/^["']|["']$/g, "");
    if (v.startsWith("0x") && v.length === 42) return v as Address;
  }
  return undefined;
}

export function getGameAddress(): Address {
  return (
    readAddr(process.env.NEXT_PUBLIC_GAME_ADDRESS, [process.env.NEXT_PUBLIC_CLICKMINT_GAME_ADDRESS]) ??
    baseSepoliaDeployed.game
  );
}

export function getClickAddress(): Address {
  return readAddr(process.env.NEXT_PUBLIC_CLICK_ADDRESS) ?? baseSepoliaDeployed.click;
}

export function getTreasuryAddress(): Address {
  return readAddr(process.env.NEXT_PUBLIC_TREASURY_ADDRESS) ?? baseSepoliaDeployed.treasury;
}

export function getSecretWalletAddress(): Address {
  return readAddr(process.env.NEXT_PUBLIC_SECRET_WALLET_ADDRESS) ?? baseSepoliaDeployed.secretPrizeWallet;
}

export function getTrophyNftAddress(): Address {
  return readAddr(process.env.NEXT_PUBLIC_TROPHY_NFT_ADDRESS) ?? baseSepoliaDeployed.binaryTrophyNft;
}

export function getEscrowAddress(): Address {
  return readAddr(process.env.NEXT_PUBLIC_ESCROW_ADDRESS) ?? baseSepoliaDeployed.escrow;
}
