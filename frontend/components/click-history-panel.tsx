"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { decodeEventLog, type Address } from "viem";
import { useAccount, usePublicClient, useWatchContractEvent } from "wagmi";
import { baseSepolia } from "wagmi/chains";
import { clickMintGameAbi } from "@/lib/abi";
import { hourIdForDisplay } from "@/lib/game-genesis";
import { cn } from "@/lib/utils";

/** Smaller range avoids `eth_getLogs` range limits on some RPCs (e.g. QuickNode). */
const LOOKBACK_BLOCKS = 8_000n;
const MAX_ROWS = 200;
/** Cap parallel `getBlock` calls so initial history hydration does not hammer RPC limits. */
const BLOCK_TS_FETCH_CONCURRENCY = 6;

/** Default newest-click count before “Older” archive (full page). Sidebar passes a smaller value. */
const DEFAULT_LIVE_FEED_MAX = 25;
/** Paginate clicks older than the live window. */
const ARCHIVE_PAGE_SIZE = 20;

/** Aggregate heatmap into 5-minute buckets (12 per hour). */
const MINUTES_PER_BUCKET = 5;
const BUCKETS_PER_HOUR = 60 / MINUTES_PER_BUCKET;

export type ClickLogRow = {
  key: string;
  blockNumber: bigint;
  user: Address;
  hourId: bigint;
  totalForUserHour: bigint;
  /** UTC minute 0–59 within the UTC wall-clock hour when the block was mined (same as on-chain `minuteOfUtcHour`). */
  minute: number;
};

function pushUnique(prev: ClickLogRow[], next: ClickLogRow[]): ClickLogRow[] {
  const seen = new Set(prev.map((r) => r.key));
  const out = [...prev];
  for (const r of next) {
    if (seen.has(r.key)) continue;
    seen.add(r.key);
    out.unshift(r);
  }
  return out.slice(0, MAX_ROWS);
}

function decodeClickedLogs(
  logs: readonly {
    data: `0x${string}`;
    topics: [] | [`0x${string}`, ...`0x${string}`[]];
    blockNumber: bigint;
    transactionHash: `0x${string}`;
    logIndex: number;
  }[]
): ClickLogRow[] {
  const out: ClickLogRow[] = [];
  for (const log of logs) {
    try {
      const ev = decodeEventLog({
        abi: clickMintGameAbi,
        data: log.data,
        topics: log.topics,
        eventName: "Clicked",
      });
      const args = ev.args as unknown as {
        user: Address;
        hourId: bigint;
        totalForUserHour: bigint;
        minute: number;
      };
      out.push({
        key: `${log.transactionHash}-${log.logIndex}`,
        blockNumber: log.blockNumber,
        user: args.user,
        hourId: args.hourId,
        totalForUserHour: args.totalForUserHour,
        minute: Number(args.minute),
      });
    } catch {
      /* skip malformed */
    }
  }
  return out;
}

/** On-chain field: minute 0–59 of the UTC hour at block time (not your local timezone). */
function formatClickMinuteUtc(m: number): string {
  const mm = Math.min(59, Math.max(0, m));
  return `:${String(mm).padStart(2, "0")} UTC`;
}

/** Local wall-clock minute when the block was mined (viewer timezone). */
function formatClickedAtLocalMin(blockTimestampSec: number | undefined): string {
  if (blockTimestampSec === undefined) return "…";
  const m = new Date(blockTimestampSec * 1000).getMinutes();
  return `Clicked at: Min ${m}`;
}

/** Same minute, for compact “your last click” copy. */
function localWallMinuteOnly(blockTimestampSec: number | undefined): string {
  if (blockTimestampSec === undefined) return "…";
  return `Min ${new Date(blockTimestampSec * 1000).getMinutes()}`;
}

const MINUTE_UTC_HELP =
  "On-chain minute is UTC at block time. “Clicked at” uses your device clock from the block timestamp.";

function ClickCard({
  r,
  animate,
  genesisGameHour,
  blockTs,
}: {
  r: ClickLogRow;
  animate: boolean;
  genesisGameHour: bigint | null;
  blockTs: Record<string, number>;
}) {
  const ts = blockTs[r.blockNumber.toString()];
  const roundLine =
    genesisGameHour !== null
      ? `Round ${hourIdForDisplay(r.hourId, genesisGameHour)}`
      : `Hour #${hourIdForDisplay(r.hourId, null)}`;
  return (
    <div
      className={cn(
        "border border-outline-variant/25 bg-surface-container-low/50 px-3 py-2 text-center font-mono text-[11px] text-on-surface",
        animate && "clickmint-feed-item--enter"
      )}
    >
      <div className="flex justify-between gap-2 text-secondary">
        <span className="truncate">#{r.blockNumber.toString()}</span>
        <span
          className="shrink-0 text-right text-[10px] text-primary-fixed/90 md:text-[11px]"
          title={`${formatClickedAtLocalMin(ts)} · chain ${formatClickMinuteUtc(r.minute)}`}
        >
          {formatClickedAtLocalMin(ts)}
        </span>
      </div>
      <div className="mt-1 truncate text-[12px]" title={r.user}>
        {r.user.slice(0, 8)}…{r.user.slice(-6)}
      </div>
      <div
        className="mt-1 font-headline text-base font-bold tracking-tight text-[#ff2ee8] drop-shadow-[0_0_10px_rgba(255,46,232,0.45)]"
        title={genesisGameHour !== null ? "Round index since contract deployment" : "On-chain game hour bucket"}
      >
        {roundLine}
      </div>
    </div>
  );
}

type ClickHistoryPanelProps = {
  gameAddr: Address;
  /** Narrow sidebar: hide heatmap, tighter spacing (desktop sidebar). */
  compact?: boolean;
  /** When set, hour cards show “Round N” as N = hourId − genesis + 1 (since deploy). */
  genesisGameHour?: bigint | null;
  /** Max rows in the live feed (default 25; sidebar uses 5). */
  liveFeedMax?: number;
};

export function ClickHistoryPanel({
  gameAddr,
  compact = false,
  genesisGameHour = null,
  liveFeedMax: liveFeedMaxProp,
}: ClickHistoryPanelProps) {
  const liveCap = liveFeedMaxProp ?? DEFAULT_LIVE_FEED_MAX;
  const { address: viewerAddress } = useAccount();
  const publicClient = usePublicClient({ chainId: baseSepolia.id });
  const [rows, setRows] = useState<ClickLogRow[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [archivePage, setArchivePage] = useState(0);
  const [enterKey, setEnterKey] = useState<string | null>(null);
  const [blockTs, setBlockTs] = useState<Record<string, number>>({});
  const blockTsInFlightRef = useRef(new Set<string>());
  const blockTsMountedRef = useRef(true);
  useEffect(() => {
    blockTsMountedRef.current = true;
    return () => {
      blockTsMountedRef.current = false;
    };
  }, []);

  const ingestLogs = useCallback((logs: Parameters<typeof decodeClickedLogs>[0]) => {
    const decoded = decodeClickedLogs(logs);
    if (decoded.length === 0) return;
    setRows((p) => pushUnique(p, decoded));
  }, []);

  useEffect(() => {
    if (!publicClient || !gameAddr) return;
    let cancelled = false;
    (async () => {
      setStatus("loading");
      try {
        const latest = await publicClient.getBlockNumber();
        const fromBlock = latest > LOOKBACK_BLOCKS ? latest - LOOKBACK_BLOCKS : 0n;
        const logs = await publicClient.getLogs({
          address: gameAddr,
          event: {
            type: "event",
            name: "Clicked",
            inputs: [
              { type: "address", name: "user", indexed: true },
              { type: "uint256", name: "hourId", indexed: false },
              { type: "uint256", name: "totalForUserHour", indexed: false },
              { type: "uint8", name: "minute", indexed: false },
            ],
          },
          fromBlock,
          toBlock: latest,
        });
        if (!cancelled) {
          ingestLogs(logs);
          setStatus("idle");
        }
      } catch (e) {
        if (!cancelled) {
          setStatus("error");
          if (typeof console !== "undefined" && console.debug) {
            console.debug("Click history getLogs failed", e);
          }
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [publicClient, gameAddr, ingestLogs]);

  useWatchContractEvent({
    address: gameAddr,
    abi: clickMintGameAbi,
    eventName: "Clicked",
    enabled: !!gameAddr,
    onLogs(logs) {
      ingestLogs(logs as Parameters<typeof decodeClickedLogs>[0]);
    },
  });

  const topKey = rows[0]?.key;
  useEffect(() => {
    if (!topKey) return;
    setEnterKey(topKey);
    const t = setTimeout(() => setEnterKey(null), 420);
    return () => clearTimeout(t);
  }, [topKey]);

  useEffect(() => {
    if (!publicClient) return;
    const ids = [...new Set(rows.map((r) => r.blockNumber.toString()))];
    const toFetch = ids.filter((id) => blockTs[id] === undefined && !blockTsInFlightRef.current.has(id));
    if (toFetch.length === 0) return;
    toFetch.forEach((id) => blockTsInFlightRef.current.add(id));

    const run = async () => {
      const next: Record<string, number> = {};
      try {
        for (let i = 0; i < toFetch.length; i += BLOCK_TS_FETCH_CONCURRENCY) {
          const chunk = toFetch.slice(i, i + BLOCK_TS_FETCH_CONCURRENCY);
          const chunkResults = await Promise.all(
            chunk.map(async (id) => {
              try {
                const b = await publicClient.getBlock({ blockNumber: BigInt(id) });
                return [id, Number(b.timestamp)] as const;
              } catch {
                return null;
              }
            })
          );
          for (const pair of chunkResults) {
            if (pair) next[pair[0]] = pair[1];
          }
        }
      } finally {
        for (const id of toFetch) {
          blockTsInFlightRef.current.delete(id);
        }
      }
      if (Object.keys(next).length > 0 && blockTsMountedRef.current) {
        setBlockTs((p) => ({ ...p, ...next }));
      }
    };

    void run();
  }, [publicClient, rows, blockTs]);

  const liveRows = useMemo(() => rows.slice(0, liveCap), [rows, liveCap]);

  const archiveTail = useMemo(() => {
    return rows.length > liveCap ? rows.slice(liveCap) : [];
  }, [rows, liveCap]);

  const archivePageCount = useMemo(
    () => Math.max(1, Math.ceil(archiveTail.length / ARCHIVE_PAGE_SIZE)),
    [archiveTail]
  );

  useEffect(() => {
    setArchivePage((p) => Math.min(p, Math.max(0, archivePageCount - 1)));
  }, [archivePageCount]);

  const archiveSlice = useMemo(() => {
    const start = archivePage * ARCHIVE_PAGE_SIZE;
    return archiveTail.slice(start, start + ARCHIVE_PAGE_SIZE);
  }, [archiveTail, archivePage]);

  const heatmap = useMemo(() => {
    const byHour = new Map<string, number[]>();
    for (const r of rows) {
      const k = r.hourId.toString();
      const b = byHour.get(k) ?? Array.from({ length: BUCKETS_PER_HOUR }, () => 0);
      const bucket = Math.min(BUCKETS_PER_HOUR - 1, Math.floor(r.minute / MINUTES_PER_BUCKET));
      b[bucket] += 1;
      byHour.set(k, b);
    }
    const hourKeys = [...byHour.keys()].sort((a, b) => (BigInt(b) > BigInt(a) ? 1 : BigInt(b) < BigInt(a) ? -1 : 0)).slice(0, 6);
    let maxC = 1;
    for (const h of hourKeys) {
      const b = byHour.get(h)!;
      maxC = Math.max(maxC, ...b);
    }
    return { byHour, hourKeys, maxC };
  }, [rows]);

  const bucketLabels = Array.from({ length: BUCKETS_PER_HOUR }, (_, i) => {
    const a = i * MINUTES_PER_BUCKET;
    const b = a + MINUTES_PER_BUCKET - 1;
    return `:${String(a).padStart(2, "0")}–:${String(b).padStart(2, "0")}`;
  });

  /** Page buttons: current + up to 3 forward, with prev/next arrows. */
  const pageWindow = useMemo(() => {
    const out: number[] = [];
    for (let i = 0; i < 4; i++) {
      const p = archivePage + i;
      if (p < archivePageCount) out.push(p);
    }
    return out;
  }, [archivePage, archivePageCount]);

  const yourLastClickRow = useMemo(() => {
    if (!viewerAddress) return undefined;
    const a = viewerAddress.toLowerCase();
    return rows.find((r) => r.user.toLowerCase() === a);
  }, [rows, viewerAddress]);

  const yourLastClickTs =
    yourLastClickRow !== undefined ? blockTs[yourLastClickRow.blockNumber.toString()] : undefined;

  return (
    <section className={cn("w-full space-y-4", compact ? "max-w-none space-y-3 pt-0" : "max-w-2xl pt-4")}>
      <div className={cn(compact && "text-center")}>
        <h2 className="mb-1 font-headline text-xs font-bold uppercase tracking-[0.2em] text-primary-fixed">
          {compact ? "Recent clicks" : "Click history"}
        </h2>
        {!compact ? (
          <p className="font-body text-[12px] leading-snug text-secondary md:text-sm">
            Live feed (newest first). Heatmap: 5-minute UTC buckets. Settlement uses exact minutes for POT overlap.
          </p>
        ) : null}
      </div>

      {viewerAddress ? (
        <p
          className={cn("font-mono text-[11px] tabular-nums text-primary-fixed/95 md:text-xs", compact && "text-center")}
          title="Most recent CLICK from your wallet in the history loaded here (local minute when the block was mined)."
        >
          <span className="font-label font-bold uppercase tracking-wider text-secondary">Your last click: </span>
          {yourLastClickRow ? (
            <span className="text-on-surface/95">{localWallMinuteOnly(yourLastClickTs)}</span>
          ) : status === "loading" && rows.length === 0 ? (
            <span className="text-secondary">…</span>
          ) : (
            <span className="font-body normal-case tracking-normal text-secondary">
              none in loaded window (~{LOOKBACK_BLOCKS.toLocaleString()} blocks)
            </span>
          )}
        </p>
      ) : (
        <p className={cn("font-body text-[11px] text-secondary opacity-90 md:text-xs", compact && "text-center")}>
          Connect a wallet to see your last click here.
        </p>
      )}

      {status === "loading" && rows.length === 0 ? (
        <p className="font-body text-[12px] text-secondary">Loading…</p>
      ) : null}
      {status === "error" ? (
        <p className="rounded border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-center font-body text-[12px] text-amber-100/95">
          Older history could not be loaded. New clicks may still show up below.
        </p>
      ) : null}

      {!compact && heatmap.hourKeys.length > 0 ? (
        <div className="space-y-2">
          <p className="font-label text-[9px] uppercase tracking-widest text-secondary">5-min UTC buckets</p>
          <div className="space-y-2">
            {heatmap.hourKeys.map((hid) => {
              const counts = heatmap.byHour.get(hid)!;
              return (
                <div key={hid} className="flex flex-wrap items-center gap-2">
                  <span className="w-16 shrink-0 font-mono text-[10px] text-primary-fixed/90 md:w-20">
                    {genesisGameHour !== null ? `${hourIdForDisplay(BigInt(hid), genesisGameHour)}` : `#${hid}`}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-wrap gap-0.5">
                    {counts.map((c, wi) => (
                      <div
                        key={wi}
                        title={`${bucketLabels[wi]} UTC — ${c} click(s)`}
                        className={cn(
                          "flex h-8 w-7 shrink-0 items-center justify-center rounded-sm border border-outline-variant/30 font-mono text-[8px] text-on-surface md:w-8 md:text-[9px]",
                          c === 0 && "bg-surface-container/40 opacity-50"
                        )}
                        style={
                          c > 0
                            ? { backgroundColor: `rgba(0, 251, 251, ${0.12 + (c / heatmap.maxC) * 0.55})` }
                            : undefined
                        }
                      >
                        {c}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : !compact && status !== "loading" ? (
        <p className="font-body text-[12px] text-secondary opacity-80">No clicks in the recent window yet.</p>
      ) : null}

      <div>
        {!compact ? (
          <p className="mb-2 font-label text-[10px] uppercase tracking-widest text-secondary md:text-[11px]">
            Latest clicks
          </p>
        ) : null}
        <div className="space-y-2">
          {liveRows.map((r) => (
            <ClickCard
              key={r.key}
              r={r}
              animate={enterKey === r.key}
              genesisGameHour={genesisGameHour}
              blockTs={blockTs}
            />
          ))}
        </div>
      </div>

      {!compact && archiveTail.length > 0 ? (
        <div className="space-y-2 border-t border-outline-variant/20 pt-4">
          <p className="font-label text-[9px] uppercase tracking-widest text-secondary">Older</p>
          <div className="hidden max-h-none overflow-visible border border-outline-variant/25 md:block">
            <table className="w-full text-left font-mono text-[9px] text-on-surface">
              <thead className="bg-surface-container-low/95 font-label uppercase tracking-wider text-secondary">
                <tr>
                  <th className="px-2 py-2">Block</th>
                  <th className="px-2 py-2">Player</th>
                  <th className="px-2 py-2">Round</th>
                  <th className="px-2 py-2" title={MINUTE_UTC_HELP}>
                    Clicked at
                  </th>
                </tr>
              </thead>
              <tbody>
                {archiveSlice.map((r) => (
                  <tr key={r.key} className="border-t border-outline-variant/15">
                    <td className="px-2 py-1.5 text-secondary">{r.blockNumber.toString()}</td>
                    <td className="max-w-[8rem] truncate px-2 py-1.5" title={r.user}>
                      {r.user.slice(0, 6)}…{r.user.slice(-4)}
                    </td>
                    <td className="px-2 py-1.5 text-[#ff2ee8]">
                      {genesisGameHour !== null
                        ? hourIdForDisplay(r.hourId, genesisGameHour)
                        : `#${hourIdForDisplay(r.hourId, null)}`}
                    </td>
                    <td className="px-2 py-1.5" title={`${formatClickedAtLocalMin(blockTs[r.blockNumber.toString()])} · ${formatClickMinuteUtc(r.minute)}`}>
                      {formatClickedAtLocalMin(blockTs[r.blockNumber.toString()])}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="space-y-2 md:hidden">
            {archiveSlice.map((r) => (
              <ClickCard key={r.key} r={r} animate={false} genesisGameHour={genesisGameHour} blockTs={blockTs} />
            ))}
          </div>

          {archivePageCount > 1 ? (
            <div className="flex flex-wrap items-center justify-center gap-1.5 pt-2 font-label text-[10px] uppercase tracking-widest">
              <button
                type="button"
                disabled={archivePage <= 0}
                onClick={() => setArchivePage((p) => Math.max(0, p - 1))}
                className="border border-outline-variant/40 px-2 py-1 text-secondary disabled:opacity-30 hover:border-primary-fixed hover:text-primary-fixed"
                aria-label="Previous page"
              >
                ←
              </button>
              {pageWindow.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setArchivePage(p)}
                  className={cn(
                    "min-w-[2rem] border px-2 py-1",
                    p === archivePage
                      ? "border-primary-fixed bg-primary-fixed/15 text-primary-fixed"
                      : "border-outline-variant/40 text-secondary hover:border-primary-fixed/50"
                  )}
                >
                  {p + 1}
                </button>
              ))}
              <button
                type="button"
                disabled={archivePage >= archivePageCount - 1}
                onClick={() => setArchivePage((p) => Math.min(archivePageCount - 1, p + 1))}
                className="border border-outline-variant/40 px-2 py-1 text-secondary disabled:opacity-30 hover:border-primary-fixed hover:text-primary-fixed"
                aria-label="Next page"
              >
                →
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
