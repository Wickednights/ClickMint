import type { PublicClient } from "viem";
import { parseAbiItem, type Address } from "viem";

/** Matches `ClickMintGame.PotWin` (third field is ETH wei paid to winner). */
const potWinEvent = parseAbiItem(
  "event PotWin(uint256 indexed roundId, address indexed winner, uint256 ethPayout, uint8 winSlot, bytes32 entropy)"
);

const LOG_CHUNK = 8_000n;

export type PotWinLogRow = {
  key: string;
  roundId: bigint;
  winner: Address;
  /** ETH wei from `PotWin`. */
  payout: bigint;
  winSlot: number;
  entropy?: `0x${string}`;
  blockNumber: bigint;
  logIndex: number;
  transactionHash: `0x${string}`;
};

/**
 * Fetch `PotWin` logs from `fromBlock` through `latest`, chunked for RPC limits.
 * Newest first.
 */
export async function fetchPotWinLogs(
  publicClient: PublicClient,
  gameAddr: Address,
  fromBlock: bigint
): Promise<PotWinLogRow[]> {
  const latest = await publicClient.getBlockNumber();
  if (fromBlock > latest) return [];

  const rows: PotWinLogRow[] = [];
  let start = fromBlock;

  while (start <= latest) {
    const end = start + LOG_CHUNK - 1n > latest ? latest : start + LOG_CHUNK - 1n;
    const logs = await publicClient.getLogs({
      address: gameAddr,
      event: potWinEvent,
      fromBlock: start,
      toBlock: end,
    });

    for (const log of logs) {
      const { roundId, winner, ethPayout, winSlot, entropy } = log.args as {
        roundId: bigint;
        winner: Address;
        ethPayout: bigint;
        winSlot: number;
        entropy: `0x${string}`;
      };
      rows.push({
        key: `${log.transactionHash}-${log.logIndex}`,
        roundId,
        winner,
        payout: ethPayout,
        winSlot: Number(winSlot),
        entropy,
        blockNumber: log.blockNumber,
        logIndex: log.logIndex,
        transactionHash: log.transactionHash,
      });
    }
    start = end + 1n;
  }

  rows.sort((a, b) => {
    if (a.blockNumber !== b.blockNumber) return a.blockNumber > b.blockNumber ? -1 : 1;
    if (a.logIndex !== b.logIndex) return a.logIndex > b.logIndex ? -1 : 1;
    return a.roundId > b.roundId ? -1 : 1;
  });

  return rows.slice(0, 96);
}

/**
 * Prefer `NEXT_PUBLIC_GAME_DEPLOY_BLOCK` (game contract creation block on Base Sepolia).
 * Otherwise a bounded lookback so public RPCs stay usable.
 */
export function potHistoryFromBlock(latest: bigint): bigint {
  const raw =
    typeof process !== "undefined" ? process.env.NEXT_PUBLIC_GAME_DEPLOY_BLOCK?.trim() : undefined;
  if (raw && /^\d+$/.test(raw)) {
    return BigInt(raw);
  }
  const lookback = 500_000n;
  return latest > lookback ? latest - lookback : 0n;
}
