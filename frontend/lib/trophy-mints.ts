import type { PublicClient } from "viem";
import { parseAbiItem, type Address } from "viem";

const trophyMintedEvent = parseAbiItem(
  "event TrophyMinted(address indexed to, uint256 indexed tokenId, uint64 totalClicks, uint8 fragmentSlot, bool viaGame)"
);

/** Smaller chunks avoid `eth_getLogs` range limits on some RPCs. */
const LOG_CHUNK = 8_000n;

export type TrophyMintLogRow = {
  key: string;
  tokenId: bigint;
  to: Address;
  totalClicks: bigint;
  fragmentSlot: number;
  viaGame: boolean;
  blockNumber: bigint;
  logIndex: number;
  transactionHash: `0x${string}`;
};

/**
 * Fetch all `TrophyMinted` logs from `fromBlock` through `latest`, chunked.
 */
export async function fetchTrophyMintLogs(
  publicClient: PublicClient,
  trophyAddr: Address,
  fromBlock: bigint
): Promise<TrophyMintLogRow[]> {
  const latest = await publicClient.getBlockNumber();
  if (fromBlock > latest) return [];

  const rows: TrophyMintLogRow[] = [];
  let start = fromBlock;

  while (start <= latest) {
    const end = start + LOG_CHUNK > latest ? latest : start + LOG_CHUNK;
    const logs = await publicClient.getLogs({
      address: trophyAddr,
      event: trophyMintedEvent,
      fromBlock: start,
      toBlock: end,
    });

    for (const log of logs) {
      const { to, tokenId, totalClicks, fragmentSlot, viaGame } = log.args as {
        to: Address;
        tokenId: bigint;
        totalClicks: bigint;
        fragmentSlot: number;
        viaGame: boolean;
      };
      rows.push({
        key: `${log.transactionHash}-${log.logIndex}`,
        tokenId,
        to,
        totalClicks,
        fragmentSlot,
        viaGame,
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
    return a.tokenId > b.tokenId ? -1 : 1;
  });

  return rows;
}

/** Parse `NEXT_PUBLIC_TROPHY_DEPLOY_BLOCK` or fall back to a recent lookback from latest. */
export function trophyHistoryFromBlock(latest: bigint): bigint {
  const raw = typeof process !== "undefined" ? process.env.NEXT_PUBLIC_TROPHY_DEPLOY_BLOCK?.trim() : undefined;
  if (raw && /^\d+$/.test(raw)) {
    return BigInt(raw);
  }
  const lookback = 200_000n;
  return latest > lookback ? latest - lookback : 0n;
}
