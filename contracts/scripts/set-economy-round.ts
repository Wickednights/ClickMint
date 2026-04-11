/**
 * Owner-only: `setEconomy` on an existing ClickMintGame.
 *
 * Usage (example Base Sepolia):
 *   GAME_ADDRESS=0x... npx hardhat run scripts/set-economy-round.ts --network baseSepolia
 *
 * Presets (no manual wei math):
 *   ECONOMY=testnet — readable Click Credits (~100 clicks per 0.001 ETH); default
 *   ECONOMY=mainnet — ~1¢/click at $3.5k ETH (`MAINNET_ETH_USD` in scripts/config/economy.ts)
 *
 * Env overrides (optional, raw wei strings):
 *   CLICK_PER_ETH_WEI, CLICK_COST_CREDITS, BASE_CLICK_REWARD
 */
import { ethers } from "hardhat";
import { MAINNET_ECONOMY, TESTNET_ECONOMY } from "./config/economy";

async function main() {
  const gameAddr = process.env.GAME_ADDRESS?.trim();
  if (!gameAddr) {
    throw new Error("Set GAME_ADDRESS in contracts/.env (ClickMintGame address)");
  }

  const preset = process.env.ECONOMY?.toLowerCase() === "mainnet" ? "mainnet" : "testnet";
  const defaults = preset === "mainnet" ? MAINNET_ECONOMY : TESTNET_ECONOMY;

  const clickPerEthWei = process.env.CLICK_PER_ETH_WEI?.trim()
    ? ethers.toBigInt(process.env.CLICK_PER_ETH_WEI)
    : defaults.clickPerEthWei;

  const clickCostCredits = process.env.CLICK_COST_CREDITS?.trim()
    ? ethers.toBigInt(process.env.CLICK_COST_CREDITS)
    : defaults.clickCostCredits;

  const baseClickReward = process.env.BASE_CLICK_REWARD?.trim()
    ? ethers.toBigInt(process.env.BASE_CLICK_REWARD)
    : defaults.baseClickReward;

  console.log("Using preset:", preset);

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
