import { decodeErrorResult, parseAbi } from "viem";

/** Custom errors from ClickMintGame + CLICK (must match Solidity). */
export const revertErrorsAbi = parseAbi([
  "error GameBadAddr()",
  "error GameBadExecutor()",
  "error GameZeroTrophyAddr()",
  "error TrophyNotGame()",
  "error GameCooldown()",
  "error GameCredits()",
  "error GameFinalizeEarly()",
  "error GameAlreadyFinalized()",
  "error CLICKUnauthorized()",
  "error CLICKBadSupply()",
  "error CLICKZeroAddr()",
]);

const errorStringAbi = parseAbi(["error Error(string message)"]);

/**
 * Best-effort human-readable revert from RPC/simulation error `data` (hex).
 * Note: some wallets surface the tx function selector (e.g. click() = 0x7d55923d) instead of revert data —
 * when `data` is exactly 4 bytes and matches a known function, we label that case.
 */
export function explainRevertData(data: `0x${string}` | undefined): string {
  if (!data || data === "0x") {
    return "Reverted with no return data (empty revert). Run a local simulation or check contract configuration.";
  }

  if (data.startsWith("0x08c379a0")) {
    try {
      const decoded = decodeErrorResult({ abi: errorStringAbi, data });
      return decoded.args[0] as string;
    } catch {
      return "Revert string (could not decode)";
    }
  }

  if (data.startsWith("0x4e487b71")) {
    const code = data.length >= 66 ? BigInt(`0x${data.slice(66, 130)}`) : 0n;
    return `Panic(${code.toString()}) — see Solidity panic codes`;
  }

  try {
    const decoded = decodeErrorResult({ abi: revertErrorsAbi, data });
    switch (decoded.errorName) {
      case "CLICKUnauthorized":
        return "CLICK token rejected the game: CLICK.game is not set to this ClickMintGame (fix: owner calls CLICK.setGame(gameAddress)).";
      case "CLICKBadSupply":
        return "CLICK supply constraint: zero cap at deploy, or any mint would exceed maxSupply (CLICKBadSupply).";
      case "GameCredits":
        return "Not enough credits for this click (GameCredits).";
      case "GameCooldown":
        return "Block click limit reached — max ~2 clicks per block (GameCooldown).";
      case "GameBadAddr":
        return "Game misconfigured address (GameBadAddr).";
      case "GameBadExecutor":
        return "This wallet is not your linked gasless executor — run Enable gasless again or call setClickExecutor(smartAccount) from your EOA (GameBadExecutor).";
      case "TrophyNotGame":
        return "Binary Trophy mint from game only — set clickMintGame on the NFT and call from ClickMintGame (TrophyNotGame).";
      case "GameZeroTrophyAddr":
        return "Trophy NFT not linked — owner must setTrophyNft on the game (GameZeroTrophyAddr).";
      case "GameFinalizeEarly":
        return "Too early to finalize this hour (GameFinalizeEarly).";
      case "GameAlreadyFinalized":
        return "Hour already finalized (GameAlreadyFinalized).";
      default:
        return decoded.errorName;
    }
  } catch {
    /* fall through */
  }

  const clickSelector = "0x7d55923d";
  if (data.length === 10 && data.toLowerCase() === clickSelector) {
    return `Some wallets show only ${data} (the click() function selector) when the real revert reason was not surfaced — use devtools / in-app simulation; common fix: CLICK.setGame(game) for CLICKUnauthorized.`;
  }

  if (data.length === 10) {
    return `Unknown custom error ${data}. If this matches a function you called, the client may have echoed calldata instead of revert data.`;
  }

  return `Unknown revert data: ${data.slice(0, 42)}${data.length > 42 ? "…" : ""}`;
}

export function extractRevertData(err: unknown): `0x${string}` | undefined {
  if (!err || typeof err !== "object") return undefined;
  const walk = (x: unknown): `0x${string}` | undefined => {
    if (!x || typeof x !== "object") return undefined;
    const o = x as Record<string, unknown>;
    const d = o.data;
    if (typeof d === "string" && d.startsWith("0x")) return d as `0x${string}`;
    if (o.cause) return walk(o.cause);
    return undefined;
  };
  return walk(err);
}
