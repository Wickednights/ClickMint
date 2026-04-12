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

/**
 * On-chain `hourId` as the **round since launch** (1-based) when `genesisHour` is known; otherwise raw chain hour id string.
 */
export function hourIdForDisplay(hourId: bigint, genesisHour: bigint | null): string {
  if (genesisHour === null) return hourId.toString();
  if (hourId < genesisHour) return "1";
  return (hourId - genesisHour + 1n).toString();
}

/** Table column / labels: "Round" when genesis is set, else "Hour" (raw index). */
export function potRoundKind(genesisHour: bigint | null): "Round" | "Hour" {
  return genesisHour === null ? "Hour" : "Round";
}
