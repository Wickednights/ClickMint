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

/** Hollow frame: 12×13 grid → 12+12+11+11 = 46 perimeter cells. Each full side maps to one on-chain 15s slot. */
const GRID_ROWS = 13;
const GRID_COLS = 12;
const PERIMETER_COUNT = 46;

const SLOT_HINTS = [
  "0–14s",
  "15–29s",
  "30–44s",
  "45–59s",
] as const;

/** Slot hue anchors for neon gradient (quarters of the minute). */
const SLOT_HUE = [188, 312, 88, 268] as const;

function formatCountdownShort(totalSec: number): string {
  if (totalSec <= 0) return "0:00";
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Clockwise step index 0..45 from top-left, for smooth hue sweep. */
function buildPerimeterMeta(): { r: number; c: number; slot: number; step: number }[] {
  const list: { r: number; c: number; slot: number; step: number }[] = [];
  let step = 0;
  for (let c = 0; c < GRID_COLS; c++) {
    list.push({ r: 0, c, slot: 0, step: step++ });
  }
  for (let r = 1; r < GRID_ROWS - 1; r++) {
    list.push({ r, c: GRID_COLS - 1, slot: 1, step: step++ });
  }
  for (let c = GRID_COLS - 1; c >= 0; c--) {
    list.push({ r: GRID_ROWS - 1, c, slot: 2, step: step++ });
  }
  for (let r = GRID_ROWS - 2; r >= 1; r--) {
    list.push({ r, c: 0, slot: 3, step: step++ });
  }
  if (list.length !== PERIMETER_COUNT) {
    console.warn("block-bet perimeter count", list.length, "expected", PERIMETER_COUNT);
  }
  return list;
}

const PERIMETER = buildPerimeterMeta();

function hueForStep(step: number, slot: number): number {
  const base = SLOT_HUE[slot];
  const sweep = (step / PERIMETER_COUNT) * 28 - 14;
  return (base + sweep + 360) % 360;
}

export type BlockBetPanelProps = {
  gameAddr: `0x${string}`;
  tickSec: number;
  wrongChain: boolean;
  canAct: boolean;
  /** When set, renders the ring around this node (e.g. main CLICK button). */
  center?: ReactNode;
};

export function BlockBetPanel({ gameAddr, tickSec, wrongChain, canAct, center }: BlockBetPanelProps) {
  const { address } = useAccount();
  const publicClient = usePublicClient({ chainId: clickmintChainId() });
  const { writeContractAsync, isPending } = useWriteContract();
  const [betEth, setBetEth] = useState("0.001");

  const ts = BigInt(tickSec);

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

  const q0 = useReadContract({
    address: gameAddr,
    abi: clickMintGameAbi,
    functionName: "totalBetOnSlot",
    args: gameRoundNow !== undefined ? [gameRoundNow, 0] : undefined,
    query: { enabled: !!gameAddr && gameRoundNow !== undefined, refetchInterval: 6_000 },
  });
  const q1 = useReadContract({
    address: gameAddr,
    abi: clickMintGameAbi,
    functionName: "totalBetOnSlot",
    args: gameRoundNow !== undefined ? [gameRoundNow, 1] : undefined,
    query: { enabled: !!gameAddr && gameRoundNow !== undefined, refetchInterval: 6_000 },
  });
  const q2 = useReadContract({
    address: gameAddr,
    abi: clickMintGameAbi,
    functionName: "totalBetOnSlot",
    args: gameRoundNow !== undefined ? [gameRoundNow, 2] : undefined,
    query: { enabled: !!gameAddr && gameRoundNow !== undefined, refetchInterval: 6_000 },
  });
  const q3 = useReadContract({
    address: gameAddr,
    abi: clickMintGameAbi,
    functionName: "totalBetOnSlot",
    args: gameRoundNow !== undefined ? [gameRoundNow, 3] : undefined,
    query: { enabled: !!gameAddr && gameRoundNow !== undefined, refetchInterval: 6_000 },
  });

  const { data: slotNow } = useReadContract({
    address: gameAddr,
    abi: clickMintGameAbi,
    functionName: "slotInRound",
    args: [ts],
    query: { enabled: !!gameAddr },
  });

  const user0 = useReadContract({
    address: gameAddr,
    abi: clickMintGameAbi,
    functionName: "userBetOnSlot",
    args:
      gameRoundNow !== undefined && address
        ? [gameRoundNow, address, 0]
        : undefined,
    query: { enabled: !!gameAddr && !!address && gameRoundNow !== undefined, refetchInterval: 6_000 },
  });
  const user1 = useReadContract({
    address: gameAddr,
    abi: clickMintGameAbi,
    functionName: "userBetOnSlot",
    args:
      gameRoundNow !== undefined && address
        ? [gameRoundNow, address, 1]
        : undefined,
    query: { enabled: !!gameAddr && !!address && gameRoundNow !== undefined, refetchInterval: 6_000 },
  });
  const user2 = useReadContract({
    address: gameAddr,
    abi: clickMintGameAbi,
    functionName: "userBetOnSlot",
    args:
      gameRoundNow !== undefined && address
        ? [gameRoundNow, address, 2]
        : undefined,
    query: { enabled: !!gameAddr && !!address && gameRoundNow !== undefined, refetchInterval: 6_000 },
  });
  const user3 = useReadContract({
    address: gameAddr,
    abi: clickMintGameAbi,
    functionName: "userBetOnSlot",
    args:
      gameRoundNow !== undefined && address
        ? [gameRoundNow, address, 3]
        : undefined,
    query: { enabled: !!gameAddr && !!address && gameRoundNow !== undefined, refetchInterval: 6_000 },
  });

  const totalPotWei = useMemo(() => {
    const c = carryWei ?? 0n;
    const d = depWei ?? 0n;
    const s =
      (q0.data ?? 0n) + (q1.data ?? 0n) + (q2.data ?? 0n) + (q3.data ?? 0n);
    return c + d + s;
  }, [carryWei, depWei, q0.data, q1.data, q2.data, q3.data]);

  const secToRoundEnd = useMemo(() => {
    if (gameRoundNow === undefined) return 0;
    const nextBoundary = (gameRoundNow + 1n) * 60n + BigInt(GAME_ROUND_BUFFER_SEC);
    return Math.max(0, Number(nextBoundary - ts));
  }, [gameRoundNow, ts]);

  const userBySlot = [user0.data, user1.data, user2.data, user3.data];

  useWatchContractEvent({
    address: gameAddr,
    abi: clickMintGameAbi,
    eventName: "BlockBetPaid",
    enabled: !!gameAddr,
    onLogs(logs) {
      for (const log of logs) {
        const a = log.args as { roundId?: bigint; winSlot?: number; totalPot?: bigint; winnersPaid?: bigint };
        if (a.totalPot !== undefined && a.winnersPaid !== undefined) {
          toast.message("Block bet settled", {
            description:
              `Slot ${a.winSlot ?? "?"}` +
              ` · ${formatEther(a.winnersPaid)} ETH paid (pot ${formatEther(a.totalPot)} ETH)`,
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
      toast.success(`Bet on ${SLOT_HINTS[slot]}`);
    } catch (e) {
      console.error("placeBet failed", e);
      toast.error("Bet failed", { description: (e as Error).message.slice(0, 200) });
    }
  };

  const ring = (
    <div
      className="relative mx-auto inline-grid gap-1 p-1"
      style={{
        gridTemplateColumns: `repeat(${GRID_COLS}, minmax(0, 1.65rem))`,
        gridTemplateRows: `repeat(${GRID_ROWS}, minmax(0, 1.65rem))`,
      }}
    >
      {PERIMETER.map(({ r, c, slot, step }) => {
        const h = hueForStep(step, slot);
        const h2 = (h + 18) % 360;
        const active = slotNow === slot;
        const mine = userBySlot[slot];
        return (
          <button
            key={`${r}-${c}`}
            type="button"
            disabled={!canAct || !address || wrongChain || isPending}
            title={`${SLOT_HINTS[slot]} · on-chain slot ${slot}`}
            aria-label={`Place block bet on ${SLOT_HINTS[slot]}, slot ${slot}`}
            onClick={() => void onBet(slot)}
            className={cn(
              "relative z-20 min-h-0 min-w-0 rounded-sm border text-[0.5rem] font-bold uppercase leading-none shadow-md transition-transform active:scale-90 disabled:opacity-35 md:text-[0.55rem]",
              active
                ? "z-30 border-white/80 ring-2 ring-white/90 ring-offset-1 ring-offset-black"
                : "border-white/20"
            )}
            style={{
              gridRow: r + 1,
              gridColumn: c + 1,
              background: `linear-gradient(145deg, hsl(${h}, 92%, 52%) 0%, hsl(${h2}, 88%, 38%) 100%)`,
              color: "rgba(0,0,0,0.88)",
              boxShadow: active
                ? `0 0 14px hsl(${h}, 100%, 55%), 0 0 28px hsl(${h}, 90%, 45%)`
                : `0 0 6px hsl(${h}, 85%, 40%)`,
            }}
          >
            <span className="flex h-full w-full items-center justify-center font-mono tabular-nums">
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
          <div className="pointer-events-auto flex max-h-full max-w-full items-center justify-center overflow-visible p-1">
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
            <span className="font-semibold text-cyan-50">46 tiles</span> ring the button — each side is one{" "}
            <span className="font-mono text-cyan-200/90">15s</span> window (4 windows per minute). Tap any tile on a
            side to stake that window.{" "}
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
        {ring}
        {slotNow !== undefined ? (
          <p className="text-center font-mono text-[10px] text-cyan-300/85 md:text-[11px]">
            Clock · live 15s band:{" "}
            <span className="font-semibold text-cyan-100">{SLOT_HINTS[slotNow]}</span> (slot {slotNow})
          </p>
        ) : null}
      </div>

      <p className="mt-3 text-center font-body text-[10px] leading-relaxed text-cyan-700/95 md:text-[11px]">
        Randomness is on-chain (pseudo). High stakes → plan VRF.
      </p>
    </section>
  );
}
