import type { Address } from "viem";

/** Base Sepolia — deployed ClickMint Phase 1. Override with `NEXT_PUBLIC_*` in `.env.local`. */
export const baseSepoliaDeployed = {
  click: "0xeB4928cf96D10F47d76d5997Ef1179c242C95Dc1",
  treasury: "0x9869d1e0e4416b7e3B246D9C444a6355cA19344c",
  secretPrizeWallet: "0xeCB7132cc27e177f7028475f58Ee8b3D43F074E2",
  binaryTrophyNft: "0xd190828F946659a1ff338AD6bC6BAF7C59f9eefD",
  escrow: "0x3F71C068aaC3359332E5c464E91F0c8b23dF590a",
  game: "0x1EFf9a6c3F3C438a2929301d1AEeD9D048f04D6B",
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
