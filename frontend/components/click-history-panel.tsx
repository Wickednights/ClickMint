"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { decodeEventLog, type Address } from "viem";
import { usePublicClient, useWatchContractEvent } from "wagmi";
import { baseSepolia } from "wagmi/chains";
import { clickMintGameAbi } from "@/lib/abi";
import { cn } from "@/lib/utils";

/** Smaller range avoids `eth_getLogs` range limits on some RPCs (e.g. QuickNode). */
const LOOKBACK_BLOCKS = 8_000n;
const MAX_ROWS = 200;

/** Newest clicks: show up to this many with “live” styling (no inner scrollbar). */
const LIVE_FEED_MAX = 25;
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
  /** UTC minute 0–59 within the game hour. */
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

function formatMinuteUtc(m: number): string {
  return `:${String(Math.min(59, Math.max(0, m))).padStart(2, "0")}`;
}

function ClickCard({ r, animate }: { r: ClickLogRow; animate: boolean }) {
  return (
    <div
      className={cn(
        "border border-outline-variant/25 bg-surface-container-low/50 px-3 py-2 font-mono text-[11px] text-on-surface",
        animate && "clickmint-feed-item--enter"
      )}
    >
      <div className="flex justify-between gap-2 text-secondary">
        <span>#{r.blockNumber.toString()}</span>
        <span className="text-primary-fixed/90">{formatMinuteUtc(r.minute)} UTC</span>
      </div>
      <div className="mt-1 truncate text-[12px]" title={r.user}>
        {r.user.slice(0, 8)}…{r.user.slice(-6)}
      </div>
      <div className="mt-0.5 text-[11px] text-secondary">Round #{r.hourId.toString()}</div>
    </div>
  );
}

type ClickHistoryPanelProps = {
  gameAddr: Address;
  /** Narrow sidebar: hide heatmap, tighter spacing (desktop sidebar). */
  compact?: boolean;
};

export function ClickHistoryPanel({ gameAddr, compact = false }: ClickHistoryPanelProps) {
  const publicClient = usePublicClient({ chainId: baseSepolia.id });
  const [rows, setRows] = useState<ClickLogRow[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [archivePage, setArchivePage] = useState(0);
  const [enterKey, setEnterKey] = useState<string | null>(null);

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

  const liveRows = rows.slice(0, LIVE_FEED_MAX);
  const archiveTail = rows.length > LIVE_FEED_MAX ? rows.slice(LIVE_FEED_MAX) : [];
  const archivePageCount = Math.max(1, Math.ceil(archiveTail.length / ARCHIVE_PAGE_SIZE));

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
        ) : (
          <p className="font-body text-[11px] leading-snug text-secondary">Newest first · live</p>
        )}
      </div>

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
                  <span className="w-16 shrink-0 font-mono text-[10px] text-primary-fixed/90 md:w-20">#{hid}</span>
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
        <p className="mb-2 font-label text-[10px] uppercase tracking-widest text-secondary md:text-[11px]">Latest clicks</p>
        <div className="space-y-2">
          {liveRows.map((r) => (
            <ClickCard key={r.key} r={r} animate={enterKey === r.key} />
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
                  <th className="px-2 py-2">Min UTC</th>
                </tr>
              </thead>
              <tbody>
                {archiveSlice.map((r) => (
                  <tr key={r.key} className="border-t border-outline-variant/15">
                    <td className="px-2 py-1.5 text-secondary">{r.blockNumber.toString()}</td>
                    <td className="max-w-[8rem] truncate px-2 py-1.5" title={r.user}>
                      {r.user.slice(0, 6)}…{r.user.slice(-4)}
                    </td>
                    <td className="px-2 py-1.5 text-primary-fixed/90">#{r.hourId.toString()}</td>
                    <td className="px-2 py-1.5">{formatMinuteUtc(r.minute)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="space-y-2 md:hidden">
            {archiveSlice.map((r) => (
              <ClickCard key={r.key} r={r} animate={false} />
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
