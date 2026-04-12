/** Must match `ClickMintGame.RESET_BUFFER` (20). */
export const GAME_RESET_BUFFER_SEC = 20;

/**
 * Same as on-chain `gameHour(ts)`: hour bucket used for POT / rounds.
 * @param unixSec Unix timestamp in seconds (e.g. contract deployment time).
 */
export function gameHourIndexFromUnixSec(unixSec: number): bigint {
  const ts = Math.floor(unixSec);
  if (ts <= GAME_RESET_BUFFER_SEC) return 0n;
  return BigInt(Math.floor((ts - GAME_RESET_BUFFER_SEC) / 3600));
}

/**
 * First game hour index after deploy — from env (no RPC).
 * Set `NEXT_PUBLIC_GAME_GENESIS_UNIX` to the game contract deployment time (seconds, Basescan).
 */
export function readGenesisGameHourFromEnv(): bigint | null {
  const raw =
    typeof process !== "undefined" ? process.env.NEXT_PUBLIC_GAME_GENESIS_UNIX?.trim() : undefined;
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  return gameHourIndexFromUnixSec(n);
}
