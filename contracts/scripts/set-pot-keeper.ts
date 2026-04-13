/**
 * Owner-only: `setPotKeeper` on ClickMintGame (automation wallet for `finalizeHour`).
 *
 * Usage (Base Sepolia):
 *   GAME_ADDRESS=0x... POT_KEEPER_ADDRESS=0x... npx hardhat run scripts/set-pot-keeper.ts --network baseSepolia
 *
 * `GAME_ADDRESS` may be omitted if `NEXT_PUBLIC_GAME_ADDRESS` is set in root `.env`.
 */
import { ethers } from "hardhat";

async function main() {
  const gameAddr =
    process.env.GAME_ADDRESS?.trim() || process.env.NEXT_PUBLIC_GAME_ADDRESS?.trim();
  if (!gameAddr) {
    throw new Error("Set GAME_ADDRESS or NEXT_PUBLIC_GAME_ADDRESS (ClickMintGame address)");
  }

  const keeper = process.env.POT_KEEPER_ADDRESS?.trim();
  if (!keeper || !ethers.isAddress(keeper)) {
    throw new Error("Set POT_KEEPER_ADDRESS to a valid EVM address (the cron / finalize wallet)");
  }

  const game = await ethers.getContractAt("ClickMintGame", gameAddr);
  const owner = await game.owner();
  const [signer] = await ethers.getSigners();
  if (signer.address.toLowerCase() !== owner.toLowerCase()) {
    throw new Error(`Signer ${signer.address} is not game owner ${owner}`);
  }

  const tx = await game.setPotKeeper(keeper);
  const receipt = await tx.wait();
  console.log("setPotKeeper ok", {
    game: gameAddr,
    potKeeper: keeper,
    txHash: receipt?.hash,
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
