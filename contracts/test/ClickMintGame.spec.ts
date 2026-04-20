import { expect } from "chai";
import { ethers } from "hardhat";
import { mine, time } from "@nomicfoundation/hardhat-network-helpers";

const ROUND_BUFFER = 5n;

/** Deploy minimal stack (testnet-style economy numbers). */
async function deployGameFixture() {
  const [owner, alice] = await ethers.getSigners();
  const Treasury = await ethers.getContractFactory("Treasury");
  const treasury = await Treasury.deploy(owner.address);
  await treasury.waitForDeployment();

  const CLICK = await ethers.getContractFactory("CLICK");
  const click = await CLICK.deploy(
    "Test CLICK",
    "tCLICK",
    "Test CLICK",
    owner.address,
    await treasury.getAddress(),
    owner.address,
    600n,
    ethers.parseEther("1000000"),
    0n,
    true
  );
  await click.waitForDeployment();

  const ClickMintGame = await ethers.getContractFactory("ClickMintGame");
  const game = await ClickMintGame.deploy(
    owner.address,
    await click.getAddress(),
    await treasury.getAddress(),
    ethers.parseEther("0.001"),
    0n,
    ethers.parseEther("1"),
    10_000n,
    1000n,
    1n
  );
  await game.waitForDeployment();
  await (await click.setGame(await game.getAddress())).wait();

  const BinaryTrophyNFT = await ethers.getContractFactory("BinaryTrophyNFT");
  const trophy = await BinaryTrophyNFT.deploy(owner.address, owner.address, 100n, "Trophy", "TRPH");
  await trophy.waitForDeployment();
  await (await trophy.setClickMintGame(await game.getAddress())).wait();
  await (await game.setTrophyNft(await trophy.getAddress())).wait();

  return { owner, alice, treasury, click, game, trophy };
}

describe("ClickMintGame", () => {
  it("credits plain ETH receive to potCarry", async () => {
    const { game, alice } = await deployGameFixture();
    await alice.sendTransaction({ to: await game.getAddress(), value: 12345n });
    expect(await game.potCarry()).to.equal(12345n);
  });

  it("forwards trophy revenue to owner when no NFT minted yet", async () => {
    const { owner, trophy, alice } = await deployGameFixture();
    const before = await ethers.provider.getBalance(owner.address);
    await alice.sendTransaction({ to: await trophy.getAddress(), value: ethers.parseEther("0.02") });
    const after = await ethers.provider.getBalance(owner.address);
    expect(await ethers.provider.getBalance(await trophy.getAddress())).to.equal(0n);
    expect(after - before).to.equal(ethers.parseEther("0.02"));
  });

  it("finalizeRound records potClaimableEth when winner rejects push, then claimPotEth pays", async () => {
    const { owner, game, trophy } = await deployGameFixture();
    const gameAddr = await game.getAddress();

    const RW = await ethers.getContractFactory("RejectingWallet");
    const wallet = await RW.deploy(gameAddr);
    await wallet.waitForDeployment();
    const wAddr = await wallet.getAddress();

    await owner.sendTransaction({
      to: wAddr,
      value: ethers.parseEther("2"),
    });

    let t = BigInt(await time.latest());
    const curR = (t - ROUND_BUFFER) / 60n;
    const roundStart = (curR + 1n) * 60n + ROUND_BUFFER;
    await time.setNextBlockTimestamp(roundStart + 1n);
    await mine();

    await wallet.seedCredits({ value: ethers.parseEther("1") });

    const roundId = (BigInt(await time.latest()) - ROUND_BUFFER) / 60n;

    await time.increase(1);
    await mine();
    await wallet.doClick();
    for (let i = 1; i < 4; i++) {
      await time.increase(16);
      await mine();
      await wallet.doClick();
    }

    const finalizeAfter = (roundId + 1n) * 60n + ROUND_BUFFER + 1n;
    let now = BigInt(await time.latest());
    if (now < finalizeAfter) {
      await time.setNextBlockTimestamp(finalizeAfter);
    }
    await mine();

    await game.connect(owner).finalizeRound(roundId);

    const pending = await game.potClaimableEth(wAddr);
    expect(pending).to.be.gt(0n);

    const balBefore = await ethers.provider.getBalance(wAddr);
    await wallet.setRejectPush(false);
    await wallet.claimPot();
    const balAfter = await ethers.provider.getBalance(wAddr);
    expect(balAfter).to.be.gt(balBefore);
    expect(await game.potClaimableEth(wAddr)).to.equal(0n);
  });
});

describe("Escrow", () => {
  it("rejects non-ERC721 token address", async () => {
    const [owner] = await ethers.getSigners();
    const NotNft = await ethers.getContractFactory("NotNft");
    const notNft = await NotNft.deploy();
    await notNft.waitForDeployment();
    const Escrow = await ethers.getContractFactory("Escrow");
    const escrow = await Escrow.deploy(owner.address);
    await escrow.waitForDeployment();
    await expect(escrow.deposit(await notNft.getAddress(), 1n, owner.address)).to.be.revertedWith("escrow: erc721");
  });
});
