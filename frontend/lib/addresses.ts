import type { Address } from "viem";

/** Base Sepolia — deployed ClickMint Phase 1. Override with `NEXT_PUBLIC_*` in `.env.local`. */
export const baseSepoliaDeployed = {
  click: "0xFf29E7fF7f72b155C49269Dc256eA691f79Ccb8B",
  treasury: "0xC85658f98dF53A560877909b847e1FcE0fD50f99",
  secretPrizeWallet: "0x136CAb0687A76614Ae1A9F9c33984C35168C082",
  binaryTrophyNft: "0x74577adb4666C56f235bf5da3Dd85911C71F477f",
  escrow: "0xF4d426E12b7a9E14CbDEba66d574EEc5835A2363",
  game: "0x780EFFaf88111bDEEFF9052DdD85aC86c20b35b3",
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
