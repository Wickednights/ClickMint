"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { decodeEventLog, type Address } from "viem";
import { usePublicClient, useWatchContractEvent } from "wagmi";
import { baseSepolia } from "wagmi/chains";
import { clickMintGameAbi } from "@/lib/abi";
import { cn } from "@/lib/utils";

const LOOKBACK_BLOCKS = 25_000n;
const MAX_ROWS = 200;

export type ClickLogRow = {
  key: string;
  blockNumber: bigint;
  user: Address;
  hourId: bigint;
  totalForUserHour: bigint;
  window: number;
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

function decodeClickedLogs(logs: readonly { data: `0x${string}`; topics: [] | [`0x${string}`, ...`0x${string}`[]]; blockNumber: bigint; transactionHash: `0x${string}`; logIndex: number }[]): ClickLogRow[] {
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
        window: number;
      };
      out.push({
        key: `${log.transactionHash}-${log.logIndex}`,
        blockNumber: log.blockNumber,
        user: args.user,
        hourId: args.hourId,
        totalForUserHour: args.totalForUserHour,
        window: Number(args.window),
      });
    } catch {
      /* skip malformed */
    }
  }
  return out;
}

export function ClickHistoryPanel({ gameAddr }: { gameAddr: Address }) {
  const publicClient = usePublicClient({ chainId: baseSepolia.id });
  const [rows, setRows] = useState<ClickLogRow[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

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
      setErrorMsg(null);
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
              { type: "uint8", name: "window", indexed: false },
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
          setErrorMsg((e as Error).message?.slice(0, 200) ?? "Log fetch failed");
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

  const heatmap = useMemo(() => {
    const byHour = new Map<string, [number, number, number, number]>();
    for (const r of rows) {
      const k = r.hourId.toString();
      const b = byHour.get(k) ?? [0, 0, 0, 0];
      const w = Math.min(3, Math.max(0, r.window));
      b[w] += 1;
      byHour.set(k, b);
    }
    const hourKeys = [...byHour.keys()].sort((a, b) => (BigInt(b) > BigInt(a) ? 1 : BigInt(b) < BigInt(a) ? -1 : 0)).slice(0, 8);
    let maxC = 1;
    for (const h of hourKeys) {
      const b = byHour.get(h)!;
      maxC = Math.max(maxC, ...b);
    }
    return { byHour, hourKeys, maxC };
  }, [rows]);

  const windowLabels = [":00–:14", ":15–:29", ":30–:44", ":45–:59"];

  return (
    <section className="w-full max-w-2xl space-y-6 pt-4">
      <div>
        <h2 className="mb-1 font-headline text-xs font-bold uppercase tracking-[0.2em] text-primary-fixed">Click history</h2>
        <p className="font-body text-[10px] leading-relaxed text-secondary opacity-85">
          Recent <span className="font-mono text-primary-fixed/80">Clicked</span> events from this game (last ~{LOOKBACK_BLOCKS.toLocaleString()} blocks + live). Eligibility
          windows are <span className="font-semibold">UTC quarters</span> of each on-chain hour index.
        </p>
      </div>

      {status === "loading" && rows.length === 0 ? (
        <p className="font-body text-[11px] text-secondary">Loading on-chain click logs…</p>
      ) : null}
      {status === "error" && errorMsg ? (
        <p className="border border-amber-500/40 bg-amber-500/10 px-3 py-2 font-body text-[10px] text-amber-200">
          Could not load full history ({errorMsg}). Live clicks still append if your RPC allows subscriptions.
        </p>
      ) : null}

      {heatmap.hourKeys.length > 0 ? (
        <div className="space-y-2">
          <p className="font-label text-[9px] uppercase tracking-widest text-secondary">Heatmap (clicks per 15m UTC window)</p>
          <div className="space-y-2">
            {heatmap.hourKeys.map((hid) => {
              const counts = heatmap.byHour.get(hid)!;
              return (
                <div key={hid} className="flex flex-wrap items-center gap-2">
                  <span className="w-24 shrink-0 font-mono text-[10px] text-primary-fixed/90">Hr #{hid}</span>
                  <div className="flex flex-1 gap-1">
                    {counts.map((c, wi) => (
                      <div
                        key={wi}
                        title={`${windowLabels[wi]} UTC — ${c} click(s)`}
                        className={cn(
                          "flex h-8 min-w-0 flex-1 items-center justify-center rounded-sm border border-outline-variant/30 font-mono text-[9px] text-on-surface",
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
          <p className="text-[9px] text-secondary opacity-70">Darker cyan = more clicks in that quarter (per scanned window).</p>
        </div>
      ) : status !== "loading" ? (
        <p className="font-body text-[10px] text-secondary opacity-70">No clicks in the scanned block range yet.</p>
      ) : null}

      <div>
        <p className="mb-2 font-label text-[9px] uppercase tracking-widest text-secondary">Recent clicks</p>
        <div className="max-h-[min(50vh,24rem)] overflow-auto border border-outline-variant/25">
          <table className="w-full text-left font-mono text-[9px] text-on-surface">
            <thead className="sticky top-0 bg-surface-container-low/95 font-label uppercase tracking-wider text-secondary">
              <tr>
                <th className="px-2 py-2">Block</th>
                <th className="px-2 py-2">Player</th>
                <th className="px-2 py-2">Hour</th>
                <th className="px-2 py-2">Win</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className="border-t border-outline-variant/15">
                  <td className="px-2 py-1.5 text-secondary">{r.blockNumber.toString()}</td>
                  <td className="max-w-[8rem] truncate px-2 py-1.5" title={r.user}>
                    {r.user.slice(0, 6)}…{r.user.slice(-4)}
                  </td>
                  <td className="px-2 py-1.5 text-primary-fixed/90">#{r.hourId.toString()}</td>
                  <td className="px-2 py-1.5">{windowLabels[r.window] ?? r.window}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
