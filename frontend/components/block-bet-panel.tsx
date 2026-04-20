"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { formatEther, parseEther } from "viem";
import {
  useAccount,
  usePublicClient,
  useReadContract,
  useWatchContractEvent,
  useWriteContract,
} from "wagmi";
import { toast } from "sonner";
import { clickMintGameAbi } from "@/lib/abi";
import { clickmintChainId } from "@/lib/clickmint-chain";
import { cn } from "@/lib/utils";
import { GAME_ROUND_BUFFER_SEC } from "@/lib/game-genesis";

/** Hollow frame: 12×13 grid → 46 perimeter cells; each cell is on-chain slot 0..45 (15s window [slot, slot+14]). */
const GRID_ROWS = 13;
const GRID_COLS = 12;
const PERIMETER_COUNT = 46;

function formatCountdownShort(totalSec: number): string {
  if (totalSec <= 0) return "0:00";
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Human label: window start `s` covers seconds s..s+14 in the minute. */
function windowLabel(s: number): string {
  if (s < 0 || s > 45) return "—";
  return `${s}–${s + 14}s`;
}

/** Clockwise from top-left; slot index matches traversal order (0..45). */
function buildPerimeterMeta(): { r: number; c: number; slot: number }[] {
  const list: { r: number; c: number; slot: number }[] = [];
  let slot = 0;
  for (let c = 0; c < GRID_COLS; c++) {
    list.push({ r: 0, c, slot: slot++ });
  }
  for (let r = 1; r < GRID_ROWS - 1; r++) {
    list.push({ r, c: GRID_COLS - 1, slot: slot++ });
  }
  for (let c = GRID_COLS - 1; c >= 0; c--) {
    list.push({ r: GRID_ROWS - 1, c, slot: slot++ });
  }
  for (let r = GRID_ROWS - 2; r >= 1; r--) {
    list.push({ r, c: 0, slot: slot++ });
  }
  if (list.length !== PERIMETER_COUNT) {
    console.warn("block-bet perimeter count", list.length, "expected", PERIMETER_COUNT);
  }
  return list;
}

const PERIMETER = buildPerimeterMeta();

function hueForSlot(slot: number): { h: number; h2: number } {
  const t = slot / PERIMETER_COUNT;
  const h = (t * 300 + 160) % 360;
  const h2 = (h + 22) % 360;
  return { h, h2 };
}

function secondInMinute(epochSec: number): number {
  return epochSec % 60;
}

/** Window `slot` covers this second-of-minute? */
function windowCoversSecond(slot: number, sec: number): boolean {
  return sec >= slot && sec <= slot + 14;
}

/** Tile size — smaller cells = larger inner hole for the CLICK control. */
const TILE_REM = 1.5;

export type BlockBetPanelProps = {
  gameAddr: `0x${string}`;
  tickSec: number;
  wrongChain: boolean;
  canAct: boolean;
  /** e.g. round / “since launch” — sits above the tile ring, not inside the hole. */
  aboveRing?: ReactNode;
  /** Main CLICK control only — centered inside the hollow frame. */
  center?: ReactNode;
  /** READY, add credits, etc. — below the full perimeter for a balanced layout. */
  belowRing?: ReactNode;
};

export function BlockBetPanel({
  gameAddr,
  tickSec,
  wrongChain,
  canAct,
  aboveRing,
  center,
  belowRing,
}: BlockBetPanelProps) {
  const { address } = useAccount();
  const publicClient = usePublicClient({ chainId: clickmintChainId() });
  const { writeContractAsync, isPending } = useWriteContract();
  const [betEth, setBetEth] = useState("0.001");

  const ts = BigInt(tickSec);
  const sec = secondInMinute(tickSec);

  const { data: gameRoundNow } = useReadContract({
    address: gameAddr,
    abi: clickMintGameAbi,
    functionName: "gameRound",
    args: [ts],
    query: { enabled: !!gameAddr },
  });

  const { data: carryWei } = useReadContract({
    address: gameAddr,
    abi: clickMintGameAbi,
    functionName: "blockBetCarry",
    query: { enabled: !!gameAddr, refetchInterval: 8_000 },
  });

  const { data: depWei } = useReadContract({
    address: gameAddr,
    abi: clickMintGameAbi,
    functionName: "blockBetDepositEthByRound",
    args: gameRoundNow !== undefined ? [gameRoundNow] : undefined,
    query: { enabled: !!gameAddr && gameRoundNow !== undefined, refetchInterval: 8_000 },
  });

  const { data: totals } = useReadContract({
    address: gameAddr,
    abi: clickMintGameAbi,
    functionName: "totalBetsAllSlots",
    args: gameRoundNow !== undefined ? [gameRoundNow] : undefined,
    query: { enabled: !!gameAddr && gameRoundNow !== undefined, refetchInterval: 6_000 },
  });

  const { data: userTotals } = useReadContract({
    address: gameAddr,
    abi: clickMintGameAbi,
    functionName: "userBetsAllSlots",
    args:
      gameRoundNow !== undefined && address ? [gameRoundNow, address] : undefined,
    query: { enabled: !!gameAddr && !!address && gameRoundNow !== undefined, refetchInterval: 6_000 },
  });

  const sumStakes = useMemo(() => {
    if (!totals?.length) return 0n;
    let s = 0n;
    for (const x of totals) s += x;
    return s;
  }, [totals]);

  const totalPotWei = useMemo(() => {
    return (carryWei ?? 0n) + (depWei ?? 0n) + sumStakes;
  }, [carryWei, depWei, sumStakes]);

  const secToRoundEnd = useMemo(() => {
    if (gameRoundNow === undefined) return 0;
    const nextBoundary = (gameRoundNow + 1n) * 60n + BigInt(GAME_ROUND_BUFFER_SEC);
    return Math.max(0, Number(nextBoundary - ts));
  }, [gameRoundNow, ts]);

  useWatchContractEvent({
    address: gameAddr,
    abi: clickMintGameAbi,
    eventName: "BlockBetPaid",
    enabled: !!gameAddr,
    onLogs(logs) {
      for (const log of logs) {
        const a = log.args as { roundId?: bigint; winSlot?: number; totalPot?: bigint; winnersPaid?: bigint };
        if (a.totalPot !== undefined && a.winnersPaid !== undefined && a.winSlot !== undefined) {
          toast.message("Block bet settled", {
            description: `Window ${windowLabel(a.winSlot)} · ${formatEther(a.winnersPaid)} ETH paid (pot ${formatEther(a.totalPot)} ETH)`,
          });
        }
      }
    },
  });

  const onBet = async (slot: number) => {
    if (!address || wrongChain || !publicClient || !canAct) return;
    let v: bigint;
    try {
      v = parseEther(betEth.trim() || "0");
    } catch {
      toast.error("Invalid bet amount");
      return;
    }
    if (v === 0n) {
      toast.message("Enter ETH amount");
      return;
    }
    try {
      const hash = await writeContractAsync({
        chainId: clickmintChainId(),
        address: gameAddr,
        abi: clickMintGameAbi,
        functionName: "placeBet",
        args: [slot],
        value: v,
      });
      await publicClient.waitForTransactionReceipt({ hash });
      toast.success(`Bet window ${windowLabel(slot)}`);
    } catch (e) {
      console.error("placeBet failed", e);
      toast.error("Bet failed", { description: (e as Error).message.slice(0, 200) });
    }
  };

  const ring = (
    <div
      className="relative mx-auto inline-grid gap-1 p-1"
      style={{
        gridTemplateColumns: `repeat(${GRID_COLS}, minmax(0, ${TILE_REM}rem))`,
        gridTemplateRows: `repeat(${GRID_ROWS}, minmax(0, ${TILE_REM}rem))`,
      }}
    >
      {PERIMETER.map(({ r, c, slot }) => {
        const { h, h2 } = hueForSlot(slot);
        const live = windowCoversSecond(slot, sec);
        const mine = userTotals?.[slot];
        return (
          <button
            key={`${r}-${c}`}
            type="button"
            disabled={!canAct || !address || wrongChain || isPending}
            title={`Window ${windowLabel(slot)} · on-chain slot ${slot}`}
            aria-label={`Stake block bet on window ${windowLabel(slot)}`}
            onClick={() => void onBet(slot)}
            className={cn(
              "relative z-20 min-h-0 min-w-0 rounded-sm border text-[0.5rem] font-bold leading-none shadow-md transition-transform active:scale-90 disabled:opacity-35 md:text-[0.55rem]",
              live
                ? "z-30 border-white/80 ring-2 ring-white/90 ring-offset-1 ring-offset-black"
                : "border-white/20"
            )}
            style={{
              gridRow: r + 1,
              gridColumn: c + 1,
              background: `linear-gradient(145deg, hsl(${h}, 92%, 52%) 0%, hsl(${h2}, 88%, 38%) 100%)`,
              color: "rgba(0,0,0,0.88)",
              boxShadow: live
                ? `0 0 14px hsl(${h}, 100%, 55%), 0 0 28px hsl(${h}, 90%, 45%)`
                : `0 0 6px hsl(${h}, 85%, 40%)`,
            }}
          >
            <span className="flex h-full w-full flex-col items-center justify-center gap-0 font-mono tabular-nums leading-none">
              <span className="opacity-95">{slot}</span>
            </span>
            {mine !== undefined && mine > 0n ? (
              <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-black/80 ring-1 ring-white/60" />
            ) : null}
          </button>
        );
      })}
      {center ? (
        <div
          className="pointer-events-none z-10 flex min-h-0 items-center justify-center"
          style={{
            gridRow: `2 / ${GRID_ROWS}`,
            gridColumn: `2 / ${GRID_COLS}`,
          }}
        >
          <div className="pointer-events-auto flex h-full min-h-0 w-full max-w-full items-center justify-center overflow-visible p-2">
            {center}
          </div>
        </div>
      ) : null}
    </div>
  );

  return (
    <section
      className={cn(
        "w-full max-w-3xl rounded-xl border border-cyan-500/20 bg-black/60 px-3 py-3 shadow-[0_0_32px_rgba(34,211,238,0.06)] md:px-4 md:py-4"
      )}
    >
      <div className="flex flex-col gap-3 border-b border-white/10 pb-3 md:flex-row md:flex-wrap md:items-center md:justify-between">
        <div>
          <h3 className="font-label text-[10px] uppercase tracking-[0.28em] text-cyan-200/95">Block bet</h3>
          <p className="mt-1 max-w-xl font-body text-[11px] leading-snug text-cyan-100/75 md:text-xs">
            <span className="font-semibold text-cyan-50">46 pools</span> — slot <span className="font-mono">k</span> is
            the 15s window <span className="font-mono">k–(k+14)</span> in the current minute. One random winning window
            each round.{" "}
            <Link href="/documentation#block-bet" className="text-cyan-300 underline-offset-2 hover:underline">
              Rules
            </Link>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-[11px] md:justify-end md:text-xs">
          <label className="flex items-center gap-1.5 rounded border border-cyan-500/30 bg-black/50 px-2 py-1">
            <span className="text-cyan-400/90">Stake</span>
            <input
              value={betEth}
              onChange={(e) => setBetEth(e.target.value)}
              className="w-20 border-0 bg-transparent text-right font-mono text-cyan-50 tabular-nums outline-none"
            />
            <span className="text-cyan-500/80">ETH</span>
          </label>
          <div className="tabular-nums text-cyan-100/90">
            Pot <span className="font-mono font-semibold text-white">{formatEther(totalPotWei)}</span> Ξ
          </div>
          <div className="tabular-nums text-cyan-200/85">
            Ends <span className="font-semibold text-white">{formatCountdownShort(secToRoundEnd)}</span>
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-col items-center gap-3">
        {aboveRing ? (
          <div className="flex w-full flex-col items-center justify-center px-1">{aboveRing}</div>
        ) : null}
        {ring}
        <p className="text-center font-mono text-[10px] text-cyan-300/85 md:text-[11px]">
          Second <span className="font-semibold text-cyan-100">{sec}</span> in minute — tiles whose window includes it
          glow · <span className="text-cyan-400/90">{PERIMETER_COUNT} pools</span> (not 4×12: corners count once)
        </p>
        {belowRing ? (
          <div className="flex w-full max-w-md flex-col items-center justify-center gap-2 px-2">{belowRing}</div>
        ) : null}
      </div>

      <p className="mt-3 text-center font-body text-[10px] leading-relaxed text-cyan-700/95 md:text-[11px]">
        Randomness is on-chain (pseudo). High stakes → plan VRF.
      </p>
    </section>
  );
}
