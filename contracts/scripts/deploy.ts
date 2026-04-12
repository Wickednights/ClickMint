import { ethers } from "hardhat";
import {
  deployPresetFromEnv,
  economyForDeploy,
  supplyCapsAndDifficulty,
  vestingSecondsForDeploy,
  type EconomyPreset,
} from "./config/economy";

/**
 * Deploy with **`DEPLOY_ECONOMY=testnet`** (default) or **`DEPLOY_ECONOMY=mainnet`**.
 *
 * - **testnet:** 1M CLICK cap, 10 trophy supply, 10m vesting, readable click costs.
 * - **mainnet:** 100B CLICK cap, 10k trophies, 7d vesting, ~1¢/click at `MAINNET_ETH_USD`.
 *
 * See `scripts/config/economy.ts` (`TESTNET_PRESET` / `MAINNET_PRESET`).
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  const owner = deployer.address;

  const preset = deployPresetFromEnv() as EconomyPreset;
  const { clickPerEthWei, clickCostCredits, baseClickReward } = economyForDeploy(preset);
  const caps = supplyCapsAndDifficulty(preset);
  const vestingSec = vestingSecondsForDeploy(preset);
  console.log("Economy preset:", preset, {
    clickPerEthWei: clickPerEthWei.toString(),
    clickCostCredits: clickCostCredits.toString(),
    baseClickReward: baseClickReward.toString(),
    maxSupplyWei: caps.maxSupplyWei.toString(),
    trophyMaxSupply: caps.trophyMaxSupply.toString(),
    clicksPerHashTier: caps.clicksPerHashTier.toString(),
    trophyDropBps: caps.trophyDropBps.toString(),
    vestingSeconds: vestingSec.toString(),
  });

  const Treasury = await ethers.getContractFactory("Treasury");
  const treasury = await Treasury.deploy(owner);
  await treasury.waitForDeployment();

  const SecretPrizeWallet = await ethers.getContractFactory("SecretPrizeWallet");
  const secret = await SecretPrizeWallet.deploy(owner);
  await secret.waitForDeployment();

  const lpRecipient = owner;

  const CLICK = await ethers.getContractFactory("CLICK");
  const click = await CLICK.deploy(
    owner,
    await treasury.getAddress(),
    lpRecipient,
    vestingSec,
    caps.maxSupplyWei
  );
  await click.waitForDeployment();
  const clickAddr = await click.getAddress();
  // Some RPCs briefly return empty `eth_call` right after create; wait for code + retry reads.
  for (let i = 0; i < 25; i++) {
    const code = await ethers.provider.getCode(clickAddr);
    if (code !== "0x") break;
    await new Promise((r) => setTimeout(r, 500));
  }
  if ((await ethers.provider.getCode(clickAddr)) === "0x") {
    throw new Error(`CLICK has no bytecode at ${clickAddr} — check RPC / tx receipt`);
  }
  let maxS: bigint | undefined;
  for (let i = 0; i < 15; i++) {
    try {
      maxS = await click.maxSupply();
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 400));
    }
  }
  if (maxS === undefined) throw new Error("Could not read CLICK.maxSupply() after deploy");
  console.log("CLICK.maxSupply (wei):", maxS.toString());

  const ClickMintGame = await ethers.getContractFactory("ClickMintGame");
  const game = await ClickMintGame.deploy(
    owner,
    await click.getAddress(),
    await treasury.getAddress(),
    await secret.getAddress(),
    clickPerEthWei,
    clickCostCredits,
    baseClickReward,
    caps.clicksPerHashTier,
    caps.trophyDropBps
  );
  await game.waitForDeployment();
  await (await click.setGame(await game.getAddress())).wait();

  const BinaryTrophyNFT = await ethers.getContractFactory("BinaryTrophyNFT");
  const trophy = await BinaryTrophyNFT.deploy(owner, owner, caps.trophyMaxSupply);
  await trophy.waitForDeployment();

  await (await trophy.setClickMintGame(await game.getAddress())).wait();
  await (await game.setTrophyNft(await trophy.getAddress())).wait();

  const Escrow = await ethers.getContractFactory("Escrow");
  const escrow = await Escrow.deploy(owner);
  await escrow.waitForDeployment();

  console.log("Treasury:", await treasury.getAddress());
  console.log("SecretPrizeWallet:", await secret.getAddress());
  console.log("CLICK:", await click.getAddress());
  console.log("ClickMintGame:", await game.getAddress());
  console.log("BinaryTrophyNFT:", await trophy.getAddress());
  console.log("Escrow:", await escrow.getAddress());
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
