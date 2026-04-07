/**
 * Prints lengths only — never prints the private key.
 * Usage: node scripts/peek-deployer-key-meta.cjs
 */
const path = require("path");
const dotenv = require("dotenv");

// Same resolution as hardhat.config.ts (lives in contracts/, not scripts/)
dotenv.config({ path: path.resolve(__dirname, "../../.env") });
dotenv.config({ path: path.resolve(__dirname, "../.env"), override: true });

const raw = process.env.DEPLOYER_KEY || "";

console.log("Loads repo root .env then contracts/.env (override), matching hardhat.config.ts.");
console.log("frontend\\.env is NOT read by Hardhat.\n");

console.log("DEPLOYER_KEY defined:", Boolean(raw));
console.log("Raw string length:", raw.length);
if (!raw) process.exit(0);

let k = raw.replace(/^\uFEFF/, "").trim();
let q = 0;
while (
  (k.startsWith('"') && k.endsWith('"')) ||
  (k.startsWith("'") && k.endsWith("'"))
) {
  k = k.slice(1, -1).trim();
  q++;
}
console.log("Outer quote layers stripped:", q);
const beforeWs = k.length;
k = k.replace(/\s+/g, "");
console.log("Chars removed by inner whitespace merge:", beforeWs - k.length);
if (k.startsWith("0x") || k.startsWith("0X")) k = k.slice(2);
console.log("Hex body length (need exactly 64):", k.length);

const bad = [...k].filter((c) => !/^[0-9a-fA-F]$/.test(c));
console.log("Non-hex glyphs count:", bad.length, bad.length ? "(check for unicode lookalikes)" : "");
console.log("Matches /^[0-9a-fA-F]{64}$/:", /^[0-9a-fA-F]{64}$/.test(k));
