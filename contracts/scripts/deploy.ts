import { ethers } from "hardhat";
import {
  deployPresetFromEnv,
  economyForDeploy,
  supplyCapsAndDifficulty,
  tokenBrandingForDeploy,
  vestingSecondsForDeploy,
  type EconomyPreset,
} from "./config/economy";

/**
 * Deploy with **`DEPLOY_ECONOMY=testnet`** (default) or **`DEPLOY_ECONOMY=mainnet`**.
 *
 * - **testnet:** 1M CLICK cap, 10 trophy supply, 10m vesting, readable click costs.
 * - **mainnet:** 10B CLICK cap, 10k trophies, 30d vesting, ~$0.10/click at `MAINNET_ETH_USD`.
 *
 * See `scripts/config/economy.ts` (`TESTNET_PRESET` / `MAINNET_PRESET`).
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  const owner = deployer.address;

  const preset = deployPresetFromEnv() as EconomyPreset;
  const branding = tokenBrandingForDeploy(preset);
  const { clickPerEthWei, clickCostCredits, baseClickReward } = economyForDeploy(preset);
  const caps = supplyCapsAndDifficulty(preset);
  const vestingSec = vestingSecondsForDeploy(preset);
  console.log("Token branding:", branding);
  console.log("Economy preset:", preset, {
    clickPerEthWei: clickPerEthWei.toString(),
    clickCostCredits: clickCostCredits.toString(),
    baseClickReward: baseClickReward.toString(),
    maxSupplyWei: caps.maxSupplyWei.toString(),
    trophyMaxSupply: caps.trophyMaxSupply.toString(),
    clicksPerHashTier: caps.clicksPerHashTier.toString(),
    trophyDropWeight: caps.trophyDropWeight.toString(),
    minPotClicks: caps.minPotClicks.toString(),
    vestingSeconds: vestingSec.toString(),
  });

  const Treasury = await ethers.getContractFactory("Treasury");
  const treasury = await Treasury.deploy(owner);
  await treasury.waitForDeployment();
  console.log("Treasury (deployed):", await treasury.getAddress());

  /** Legacy sink — **not** wired into `ClickMintGame` deposit splits (v2 routes per BPS to treasury / pot / block bet / trophy). */
  const SecretPrizeWallet = await ethers.getContractFactory("SecretPrizeWallet");
  const secret = await SecretPrizeWallet.deploy(owner);
  await secret.waitForDeployment();
  const secretAddr = await secret.getAddress();
  console.log("SecretPrizeWallet (deployed, optional/legacy):", secretAddr);

  /** Until you call `CLICK.setLpRecipient`, early-claim LP share mints here — default is owner for bootstrap. */
  const lpRecipient = owner;

  /** Mainnet: 10% of cap minted to `owner` at deploy for LP seed; testnet: 0 (use `mintForTesting` / debug UI). */
  const lpBootstrapWei = preset === "mainnet" ? caps.maxSupplyWei / 10n : 0n;
  if (lpBootstrapWei > 0n) {
    console.log("CLICK initial LP bootstrap to owner (wei):", lpBootstrapWei.toString());
  }

  const CLICK = await ethers.getContractFactory("CLICK");
  const enableMintForTesting = preset === "testnet";
  if (!enableMintForTesting) {
    console.log("CLICK mintForTesting: disabled (mainnet preset)");
  }
  const click = await CLICK.deploy(
    branding.erc20Name,
    branding.erc20Symbol,
    branding.erc20PermitName,
    owner,
    await treasury.getAddress(),
    lpRecipient,
    vestingSec,
    caps.maxSupplyWei,
    lpBootstrapWei,
    enableMintForTesting
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
  console.log("CLICK (deployed):", clickAddr);
  console.log("CLICK.maxSupply (wei):", maxS.toString());

  const ClickMintGame = await ethers.getContractFactory("ClickMintGame");
  const game = await ClickMintGame.deploy(
    owner,
    await click.getAddress(),
    await treasury.getAddress(),
    clickPerEthWei,
    clickCostCredits,
    baseClickReward,
    caps.clicksPerHashTier,
    caps.trophyDropWeight,
    caps.minPotClicks
  );
  await game.waitForDeployment();
  console.log("ClickMintGame (deployed):", await game.getAddress());
  await (await click.setGame(await game.getAddress())).wait();

  const BinaryTrophyNFT = await ethers.getContractFactory("BinaryTrophyNFT");
  const trophy = await BinaryTrophyNFT.deploy(
    owner,
    owner,
    caps.trophyMaxSupply,
    branding.erc721Name,
    branding.erc721Symbol
  );
  await trophy.waitForDeployment();
  console.log("BinaryTrophyNFT (deployed):", await trophy.getAddress());

  await (await trophy.setClickMintGame(await game.getAddress())).wait();
  await (await game.setTrophyNft(await trophy.getAddress())).wait();

  const Escrow = await ethers.getContractFactory("Escrow");
  const escrow = await Escrow.deploy(owner);
  await escrow.waitForDeployment();
  console.log("Escrow (deployed):", await escrow.getAddress());

  console.log("\n--- Deploy summary ---");
  console.log("Treasury:", await treasury.getAddress());
  console.log("SecretPrizeWallet:", secretAddr);
  console.log("CLICK:", await click.getAddress());
  console.log("ClickMintGame:", await game.getAddress());
  console.log("BinaryTrophyNFT:", await trophy.getAddress());
  console.log("Escrow:", await escrow.getAddress());
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
