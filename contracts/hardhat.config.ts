import path from "node:path";
import type { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, "../.env") });
dotenv.config({ path: path.resolve(__dirname, ".env"), override: true });

/**
 * Hardhat expects a 32-byte hex key. .env mistakes (smart quotes, stray spaces,
 * BOM, `0x...` wrapped in extra quotes) often yield HH8 "private key too short".
 */
function deployerAccountsFromEnv(): string[] {
  const raw = process.env.DEPLOYER_KEY;
  if (!raw?.trim()) return [];

  let k = raw.replace(/^\uFEFF/, "").trim();
  // Outer ASCII quotes from copy-paste
  while (
    (k.startsWith('"') && k.endsWith('"')) ||
    (k.startsWith("'") && k.endsWith("'"))
  ) {
    k = k.slice(1, -1).trim();
  }
  // Join accidental line breaks / spaces inside the key (common .env paste issue)
  k = k.replace(/\s+/g, "");
  if (k.startsWith("0x") || k.startsWith("0X")) k = k.slice(2);

  if (k.length !== 64 || !/^[0-9a-fA-F]{64}$/.test(k)) {
    let hint = "";
    if (k.length === 63) {
      hint =
        " (Whitespace was already stripped.) Length 63 = still one hex digit missing — re-copy the full private key from your wallet (64 hex after 0x).";
    } else if (k.length === 65 || k.length === 66) {
      hint = " Too long: remove duplicate 0x or trailing junk; you need exactly 64 hex digits after optional single 0x.";
    } else if (k.length > 0 && /^[0-9a-fA-F]+$/.test(k) && k.length < 64) {
      hint = ` Too short by ${64 - k.length} hex character(s).`;
    }
    throw new Error(
      `[hardhat] DEPLOYER_KEY must be exactly 64 hex characters (32 bytes), optional 0x prefix only once. ` +
        `After cleaning, length is ${k.length}.${hint} ` +
        `Fix ..\\.env: one line, ASCII only, no smart quotes, no spaces inside the key.`
    );
  }

  return [`0x${k.toLowerCase()}`];
}

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      // `viaIR: true` + optimizer enabled can hit solc CodeGenerationError on large `ClickMintGame`; revisit after splitting Block Bet logic or solc bump.
      optimizer: { enabled: false },
      viaIR: true,
      evmVersion: "cancun"
    }
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts"
  },
  networks: {
    hardhat: { chainId: 31337 },
    baseSepolia: {
      url:
        process.env.QUICKNODE_RPC ||
        process.env.BASE_SEPOLIA_RPC_URL ||
        "https://sepolia.base.org",
      accounts: deployerAccountsFromEnv(),
    },
    /** Base mainnet — chain id 8453. Use for production QA / go-live deploys. */
    base: {
      url:
        process.env.BASE_MAINNET_RPC_URL ||
        process.env.QUICKNODE_BASE_RPC ||
        "https://mainnet.base.org",
      accounts: deployerAccountsFromEnv(),
      chainId: 8453,
    },
  }
};

export default config;
