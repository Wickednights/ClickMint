/**
 * Post-deploy sanity checks (read-only). Set addresses in contracts/.env or pass via environment.
 *
 * Usage (Base Sepolia):
 *   CLICK_ADDRESS=0x... GAME_ADDRESS=0x... TROPHY_ADDRESS=0x... npx hardhat run scripts/verify-deployment.ts --network baseSepolia
 *
 * Optional:
 *   EXPECTED_MAX_SUPPLY_WEI — if set, must equal CLICK.maxSupply() (e.g. mainnet 100B cap).
 */
import { ethers } from "hardhat";

function reqAddr(env: string): string {
  const v = process.env[env]?.trim();
  if (!v?.startsWith("0x") || v.length !== 42) {
    throw new Error(`Set ${env} to a checksummable address (0x + 40 hex)`);
  }
  return v;
}

async function main() {
  const clickAddr = process.env.CLICK_ADDRESS?.trim() ? reqAddr("CLICK_ADDRESS") : null;
  const gameAddr = process.env.GAME_ADDRESS?.trim() ? reqAddr("GAME_ADDRESS") : null;
  const trophyAddr = process.env.TROPHY_ADDRESS?.trim() ? reqAddr("TROPHY_ADDRESS") : undefined;

  if (!clickAddr || !gameAddr) {
    throw new Error("Required: CLICK_ADDRESS and GAME_ADDRESS");
  }

  const click = await ethers.getContractAt("CLICK", clickAddr);
  const game = await ethers.getContractAt("ClickMintGame", gameAddr);

  const maxSupply = await click.maxSupply();
  const gameOnClick = await click.game();
  const owner = await game.owner();
  const paused = await game.paused();
  const isPausedAlias = await game.isPaused();
  const clickTok = await game.clickToken();
  const trophyOnGame = await game.trophyNft();
  const trophyDropBps = await game.trophyDropBps();

  console.log("--- ClickMint post-deploy verification ---");
  console.log("CLICK.address:", clickAddr);
  console.log("CLICK.maxSupply (wei):", maxSupply.toString());
  console.log("CLICK.game:", gameOnClick);
  console.log("CLICK.game matches GAME_ADDRESS:", gameOnClick.toLowerCase() === gameAddr.toLowerCase());

  const expected = process.env.EXPECTED_MAX_SUPPLY_WEI?.trim();
  if (expected) {
    const exp = BigInt(expected);
    console.log("EXPECTED_MAX_SUPPLY_WEI:", expected);
    console.log("maxSupply matches expected:", maxSupply === exp);
    if (maxSupply !== exp) {
      throw new Error("CLICK.maxSupply does not match EXPECTED_MAX_SUPPLY_WEI");
    }
  }

  console.log("\nClickMintGame.address:", gameAddr);
  console.log("game.owner():", owner);
  console.log("game.paused():", paused);
  console.log("game.isPaused():", isPausedAlias);
  console.log("game.clickToken matches CLICK:", clickTok.toLowerCase() === clickAddr.toLowerCase());
  console.log("game.trophyNft():", trophyOnGame);
  console.log("game.trophyDropBps():", trophyDropBps.toString());

  if (trophyAddr) {
    const trophy = await ethers.getContractAt("BinaryTrophyNFT", trophyAddr);
    const cg = await trophy.clickMintGame();
    console.log("\nBinaryTrophyNFT:", trophyAddr);
    console.log("trophy.clickMintGame:", cg);
    console.log("trophy.clickMintGame matches game:", cg.toLowerCase() === gameAddr.toLowerCase());
    console.log("game.trophyNft matches trophy:", trophyOnGame.toLowerCase() === trophyAddr.toLowerCase());
  }

  console.log("\n--- OK (read-only checks complete) ---");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
