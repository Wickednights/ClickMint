/**
 * Owner-only: set test-friendly economy so UI shows round CLICK rewards and meaningful click cost.
 *
 * Usage (example Base Sepolia):
 *   GAME_ADDRESS=0x... npx hardhat run scripts/set-economy-round.ts --network baseSepolia
 *
 * Env (optional overrides):
 *   GAME_ADDRESS — ClickMintGame proxy (required)
 *   CLICK_PER_ETH_WEI — default 1000e18 (POT mint rate numerator, same as deploy sample)
 *   CLICK_COST_CREDITS — default 0.001e18 wei deducted from credits per click (0 for free clicks)
 *   BASE_CLICK_REWARD — default 5e18 (5 whole CLICK per click into vesting vault)
 */
import { ethers } from "hardhat";

async function main() {
  const gameAddr = process.env.GAME_ADDRESS?.trim();
  if (!gameAddr) {
    throw new Error("Set GAME_ADDRESS in contracts/.env (ClickMintGame address)");
  }

  const clickPerEthWei = process.env.CLICK_PER_ETH_WEI?.trim()
    ? ethers.toBigInt(process.env.CLICK_PER_ETH_WEI)
    : ethers.parseEther("1000");

  const clickCostCredits = process.env.CLICK_COST_CREDITS?.trim()
    ? ethers.toBigInt(process.env.CLICK_COST_CREDITS)
    : ethers.parseEther("0.001");

  const baseClickReward = process.env.BASE_CLICK_REWARD?.trim()
    ? ethers.toBigInt(process.env.BASE_CLICK_REWARD)
    : ethers.parseEther("5");

  const game = await ethers.getContractAt("ClickMintGame", gameAddr);
  const owner = await game.owner();
  const [signer] = await ethers.getSigners();
  if (signer.address.toLowerCase() !== owner.toLowerCase()) {
    throw new Error(`Signer ${signer.address} is not game owner ${owner}`);
  }

  const tx = await game.setEconomy(clickPerEthWei, clickCostCredits, baseClickReward);
  await tx.wait();
  console.log("setEconomy", {
    game: gameAddr,
    clickPerEthWei: clickPerEthWei.toString(),
    clickCostCredits: clickCostCredits.toString(),
    baseClickReward: baseClickReward.toString(),
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
