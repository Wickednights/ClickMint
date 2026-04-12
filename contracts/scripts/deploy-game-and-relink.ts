import { ethers } from "hardhat";
import {
  deployPresetFromEnv,
  economyForDeploy,
  supplyCapsAndDifficulty,
  type EconomyPreset,
} from "./config/economy";

function reqAddr(env: string): string {
  const v = process.env[env]?.trim();
  if (!v?.startsWith("0x") || v.length !== 42) {
    throw new Error(`Set ${env} to a 0x-prefixed address (42 chars)`);
  }
  return v;
}

/**
 * Deploy a **new** `ClickMintGame` (e.g. after bytecode changes) and wire it to existing
 * **CLICK**, **BinaryTrophyNFT**, treasury, and secret wallet.
 *
 * **Important:** Credits, per-hour POT bookkeeping, and pot state live **on the game contract**.
 * A new game starts with **empty** `credits` / hour maps — testnet QA usually accepts this;
 * there is **no** migration script in-repo.
 *
 * Base Sepolia example (PowerShell):
 *
 *   $env:CLICK_ADDRESS="0x..."
 *   $env:TROPHY_ADDRESS="0x..."
 *   $env:TREASURY_ADDRESS="0x..."
 *   $env:SECRET_WALLET_ADDRESS="0x..."
 *   $env:DEPLOY_ECONOMY="testnet"   # optional; default from deploy preset
 *   npx hardhat run scripts/deploy-game-and-relink.ts --network baseSepolia
 *
 * Then update `frontend` `NEXT_PUBLIC_GAME_ADDRESS` (and run `verify:base-sepolia`).
 */
async function main() {
  const clickAddr = reqAddr("CLICK_ADDRESS");
  const trophyAddr = reqAddr("TROPHY_ADDRESS");
  const treasuryAddr = reqAddr("TREASURY_ADDRESS");
  const secretAddr = reqAddr("SECRET_WALLET_ADDRESS");

  const [deployer] = await ethers.getSigners();
  const owner = deployer.address;

  const preset = deployPresetFromEnv() as EconomyPreset;
  const { clickPerEthWei, clickCostCredits, baseClickReward } = economyForDeploy(preset);
  const caps = supplyCapsAndDifficulty(preset);

  console.log("Economy preset:", preset, {
    clickPerEthWei: clickPerEthWei.toString(),
    clickCostCredits: clickCostCredits.toString(),
    baseClickReward: baseClickReward.toString(),
    clicksPerHashTier: caps.clicksPerHashTier.toString(),
    trophyDropBps: caps.trophyDropBps.toString(),
    minPotClicks: caps.minPotClicks.toString(),
  });

  const ClickMintGame = await ethers.getContractFactory("ClickMintGame");
  const game = await ClickMintGame.deploy(
    owner,
    clickAddr,
    treasuryAddr,
    secretAddr,
    clickPerEthWei,
    clickCostCredits,
    baseClickReward,
    caps.clicksPerHashTier,
    caps.trophyDropBps,
    caps.minPotClicks
  );
  await game.waitForDeployment();
  const gameAddr = await game.getAddress();
  console.log("Deployed ClickMintGame:", gameAddr);

  const click = await ethers.getContractAt("CLICK", clickAddr, deployer);
  const trophy = await ethers.getContractAt("BinaryTrophyNFT", trophyAddr, deployer);
  const gameW = await ethers.getContractAt("ClickMintGame", gameAddr, deployer);

  const curGame = await click.game();
  if (curGame.toLowerCase() !== gameAddr.toLowerCase()) {
    console.log("CLICK.setGame … (was", curGame, ")");
    await (await click.setGame(gameAddr)).wait();
  } else {
    console.log("CLICK.game already", gameAddr);
  }

  const curCg = await trophy.clickMintGame();
  if (curCg.toLowerCase() !== gameAddr.toLowerCase()) {
    console.log("Trophy.setClickMintGame … (was", curCg, ")");
    await (await trophy.setClickMintGame(gameAddr)).wait();
  } else {
    console.log("trophy.clickMintGame already", gameAddr);
  }

  const tOn = await gameW.trophyNft();
  if (!tOn || tOn === ethers.ZeroAddress) {
    console.log("game.setTrophyNft …");
    await (await gameW.setTrophyNft(trophyAddr)).wait();
  } else if (tOn.toLowerCase() !== trophyAddr.toLowerCase()) {
    throw new Error(`Game already has trophy ${tOn} — refusing to overwrite. Use a fresh game deploy or setTrophyNft manually.`);
  } else {
    console.log("game.trophyNft already", trophyAddr);
  }

  console.log("\n--- Done ---");
  console.log("Set NEXT_PUBLIC_GAME_ADDRESS=", gameAddr);
  console.log("Run: npm run verify:base-sepolia (with GAME_ADDRESS=", gameAddr, ")");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
