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
  if (!gameAddr || !ethers.isAddress(gameAddr)) {
    throw new Error(
      "Set GAME_ADDRESS or NEXT_PUBLIC_GAME_ADDRESS to a valid EVM address (ClickMintGame address)"
    );
  }

  const keeper = process.env.POT_KEEPER_ADDRESS?.trim();
  if (!keeper || !ethers.isAddress(keeper)) {
    throw new Error("Set POT_KEEPER_ADDRESS to a valid EVM address (the cron / finalize wallet)");
  }

  const game = await ethers.getContractAt("ClickMintGame", gameAddr);
  const owner = await game.owner();
  const signers = await ethers.getSigners();
  if (signers.length === 0) {
    throw new Error(
      "No signer configured for this network. Set DEPLOYER_KEY in your environment so Hardhat can load the deployer account."
    );
  }
  const [signer] = signers;
  if (signer.address.toLowerCase() !== owner.toLowerCase()) {
    throw new Error(`Signer ${signer.address} is not game owner ${owner}`);
  }

  const currentPotKeeper = await game.potKeeper();
  if (currentPotKeeper.toLowerCase() === keeper.toLowerCase()) {
    console.log("setPotKeeper skipped", {
      game: gameAddr,
      potKeeper: keeper,
      reason: "potKeeper already set",
    });
    return;
  }

  const tx = await game.setPotKeeper(keeper);
  const receipt = await tx.wait();
  if (!receipt) {
    throw new Error(`setPotKeeper: no receipt for tx ${tx.hash}`);
  }
  if (Number(receipt.status) !== 1) {
    throw new Error(`setPotKeeper reverted (status ${receipt.status}) — tx ${receipt.hash}`);
  }

  console.log("setPotKeeper ok", {
    game: gameAddr,
    potKeeper: keeper,
    txHash: receipt.hash,
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
