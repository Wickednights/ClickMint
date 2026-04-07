import { ethers } from "hardhat";

/**
 * One-time fix if CLICK was deployed without setGame(game), or game was redeployed.
 *
 * Usage (Base Sepolia):
 *   CLICK_ADDRESS=0x... GAME_ADDRESS=0x... npx hardhat run scripts/set-game.ts --network baseSepolia
 *
 * Must be called from the CLICK owner (same as deployer by default).
 */
async function main() {
  const clickAddr = process.env.CLICK_ADDRESS?.trim();
  const gameAddr = process.env.GAME_ADDRESS?.trim();
  if (!clickAddr?.startsWith("0x") || clickAddr.length !== 42) {
    throw new Error("Set CLICK_ADDRESS to the CLICK token (0x…42 chars)");
  }
  if (!gameAddr?.startsWith("0x") || gameAddr.length !== 42) {
    throw new Error("Set GAME_ADDRESS to the ClickMintGame contract (0x…42 chars)");
  }

  const signers = await ethers.getSigners();
  if (signers.length === 0) {
    throw new Error(
      "No Hardhat signer. Set DEPLOYER_KEY to the CLICK owner private key (0x…, 32-byte hex). " +
        "PowerShell: $env:DEPLOYER_KEY='0xYourKeys'; $env:CLICK_ADDRESS='...'; $env:GAME_ADDRESS='...'; npm run set-game:base-sepolia. " +
        "RPC: QUICKNODE_RPC or BASE_SEPOLIA_RPC_URL, or default https://sepolia.base.org"
    );
  }
  const signer = signers[0]!;
  const click = await ethers.getContractAt("CLICK", clickAddr, signer);
  const current = await click.game();
  if (current.toLowerCase() === gameAddr.toLowerCase()) {
    console.log("CLICK.game already set to", gameAddr);
    return;
  }

  console.log("Owner:", signer.address);
  console.log("CLICK.game was:", current);
  const tx = await click.setGame(gameAddr);
  console.log("setGame tx:", tx.hash);
  const receipt = await tx.wait();
  if (receipt && Number(receipt.status) !== 1) {
    throw new Error(`setGame reverted (status ${receipt.status})`);
  }
  const after = await click.game();
  console.log("CLICK.game now:", String(after));
  if (after.toLowerCase() !== gameAddr.toLowerCase()) {
    console.warn(
      "Read-back mismatch — verify on explorer; RPC may lag. Expected:",
      gameAddr,
      " Got:",
      String(after)
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
