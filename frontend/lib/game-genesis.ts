/** Must match `ClickMintGame.ROUND_BUFFER` (5). */
export const GAME_ROUND_BUFFER_SEC = 5;

/** @deprecated Use `GAME_ROUND_BUFFER_SEC`. */
export const GAME_RESET_BUFFER_SEC = GAME_ROUND_BUFFER_SEC;

/**
 * Same as on-chain `gameRound(ts)`: minute bucket for POT / Block Bet / rounds.
 * @param unixSec Unix timestamp in seconds (e.g. contract deployment time).
 */
export function gameRoundIndexFromUnixSec(unixSec: number): bigint {
  const ts = Math.floor(unixSec);
  if (ts <= GAME_ROUND_BUFFER_SEC) return 0n;
  return BigInt(Math.floor((ts - GAME_ROUND_BUFFER_SEC) / 60));
}

/** @deprecated Use `gameRoundIndexFromUnixSec`. */
export const gameHourIndexFromUnixSec = gameRoundIndexFromUnixSec;

/**
 * First game round index after deploy — from env (no RPC).
 * Set `NEXT_PUBLIC_GAME_GENESIS_UNIX` to the game contract deployment time (seconds, Basescan).
 */
export function readGenesisGameRoundFromEnv(): bigint | null {
  const raw =
    typeof process !== "undefined" ? process.env.NEXT_PUBLIC_GAME_GENESIS_UNIX?.trim() : undefined;
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  return gameRoundIndexFromUnixSec(n);
}

/** @deprecated Use `readGenesisGameRoundFromEnv`. */
export const readGenesisGameHourFromEnv = readGenesisGameRoundFromEnv;

/**
 * On-chain `roundId` as the **round since launch** (1-based) when `genesisRound` is known; otherwise raw chain round id string.
 */
export function roundIdForDisplay(roundId: bigint, genesisRound: bigint | null): string {
  if (genesisRound === null) return roundId.toString();
  if (roundId < genesisRound) return "1";
  return (roundId - genesisRound + 1n).toString();
}

/** @deprecated Use `roundIdForDisplay`. */
export const hourIdForDisplay = roundIdForDisplay;

/** Table column / labels: "Round" when genesis is set, else raw index label. */
export function potRoundKind(genesisRound: bigint | null): "Round" | "Index" {
  return genesisRound === null ? "Index" : "Round";
}
