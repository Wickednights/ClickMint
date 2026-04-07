import { ethers } from "hardhat";

/** Testnet-scaled: 10-minute vesting, sized CLICK rewards / POT rate. */
async function main() {
  const [deployer] = await ethers.getSigners();
  const owner = deployer.address;

  const Treasury = await ethers.getContractFactory("Treasury");
  const treasury = await Treasury.deploy(owner);
  await treasury.waitForDeployment();

  const SecretPrizeWallet = await ethers.getContractFactory("SecretPrizeWallet");
  const secret = await SecretPrizeWallet.deploy(owner);
  await secret.waitForDeployment();

  const tenMinutes = 10 * 60;
  const lpRecipient = owner;

  const CLICK = await ethers.getContractFactory("CLICK");
  const click = await CLICK.deploy(owner, await treasury.getAddress(), lpRecipient, tenMinutes);
  await click.waitForDeployment();

  const ClickMintGame = await ethers.getContractFactory("ClickMintGame");
  const clickPerEthWei = ethers.parseEther("1000");
  /// ~1 USD cent per click at ~$3.5k ETH — tune on mainnet via `setEconomy`.
  const clickCostCredits = ethers.parseEther("1") / 350_000n;
  const baseClickReward = ethers.parseEther("5");
  const game = await ClickMintGame.deploy(
    owner,
    await click.getAddress(),
    await treasury.getAddress(),
    await secret.getAddress(),
    clickPerEthWei,
    clickCostCredits,
    baseClickReward
  );
  await game.waitForDeployment();
  await (await click.setGame(await game.getAddress())).wait();

  const BinaryTrophyNFT = await ethers.getContractFactory("BinaryTrophyNFT");
  const trophy = await BinaryTrophyNFT.deploy(owner, owner);
  await trophy.waitForDeployment();

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
