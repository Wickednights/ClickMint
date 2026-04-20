/**
 * Find the first block where `address` has non-empty code (binary search).
 * Usage: ADDRESS=0x... npx hardhat run scripts/first-code-block.ts --network baseSepolia
 */
import { ethers } from "hardhat";

async function main() {
  const raw = process.env.ADDRESS?.trim();
  if (!raw?.startsWith("0x") || raw.length !== 42) {
    throw new Error("Set ADDRESS=0x… (42 chars)");
  }
  const address = raw;
  const provider = ethers.provider;
  const latest = await provider.getBlockNumber();
  let lo = 0;
  let hi = latest;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    const code = await provider.getCode(address, mid);
    if (code !== "0x") {
      hi = mid;
    } else {
      lo = mid + 1;
    }
  }
  const block = await provider.getBlock(lo);
  console.log("firstCodeBlock:", lo);
  console.log("timestamp (unix):", block?.timestamp);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
