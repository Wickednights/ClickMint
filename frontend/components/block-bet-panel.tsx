"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
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

const SLOT_LABELS = ["0–14s", "15–29s", "30–44s", "45–59s"] as const;

function formatCountdownShort(totalSec: number): string {
  if (totalSec <= 0) return "0:00";
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

type BlockBetPanelProps = {
  gameAddr: `0x${string}`;
  tickSec: number;
  wrongChain: boolean;
  canAct: boolean;
};

export function BlockBetPanel({ gameAddr, tickSec, wrongChain, canAct }: BlockBetPanelProps) {
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
    const n = Math.max(0, Number(nextBoundary - ts));
    return n;
  }, [gameRoundNow, ts]);

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
            description: `Slot ${a.winSlot ?? "?"}` + ` · ${formatEther(a.winnersPaid)} ETH paid (pot ${formatEther(a.totalPot)} ETH)`,
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
      toast.success(`Bet placed on slot ${slot}`);
    } catch (e) {
      console.error("placeBet failed", e);
      toast.error("Bet failed", { description: (e as Error).message.slice(0, 200) });
    }
  };

  return (
    <section
      className={cn(
        "w-full max-w-3xl rounded border border-cyan-400/25 bg-black/50 px-3 py-3 font-mono text-cyan-200/95 shadow-[0_0_24px_rgba(34,211,238,0.08)] md:px-4 md:py-4"
      )}
    >
      <div className="flex flex-wrap items-end justify-between gap-2 border-b border-cyan-500/20 pb-2">
        <div>
          <h3 className="font-label text-[10px] uppercase tracking-[0.25em] text-cyan-300/90">Block bet</h3>
          <p className="mt-0.5 text-[11px] text-cyan-100/70 md:text-xs">
            Parimutuel on four 15s slots this minute. Pool = carry + 20% deposits + stakes.{" "}
            <Link href="/documentation#block-bet" className="text-cyan-300 underline-offset-2 hover:underline">
              Rules
            </Link>
          </p>
        </div>
        <div className="text-right text-[11px] tabular-nums md:text-xs">
          <div>
            Round ends in{" "}
            <span className="font-semibold text-cyan-100">{formatCountdownShort(secToRoundEnd)}</span>
          </div>
          {slotNow !== undefined ? (
            <div className="text-cyan-400/80">Wall slot now: {SLOT_LABELS[slotNow]}</div>
          ) : null}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] md:text-xs">
        <span className="text-cyan-100/85">
          Est. pot (this settlement):{" "}
          <span className="font-semibold tabular-nums text-cyan-50">{formatEther(totalPotWei)} ETH</span>
        </span>
        <label className="flex items-center gap-1.5">
          <span className="text-cyan-500/90">Bet size</span>
          <input
            value={betEth}
            onChange={(e) => setBetEth(e.target.value)}
            className="w-24 border border-cyan-500/35 bg-black/60 px-2 py-1 text-right text-cyan-100 tabular-nums"
          />
          <span className="text-cyan-500/80">ETH</span>
        </label>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
        {SLOT_LABELS.map((label, slot) => {
          const sw = [q0.data, q1.data, q2.data, q3.data][slot];
          const uw = [user0.data, user1.data, user2.data, user3.data][slot];
          const active = slotNow === slot;
          return (
            <div
              key={slot}
              className={cn(
                "flex flex-col gap-1.5 rounded border px-2 py-2 text-center",
                active ? "border-cyan-300/50 bg-cyan-500/10" : "border-cyan-600/30 bg-black/40"
              )}
            >
              <div className="text-[10px] uppercase tracking-wider text-cyan-400/90">Slot {slot}</div>
              <div className="text-[10px] text-cyan-200/80">{label}</div>
              <div className="text-[11px] tabular-nums text-cyan-100/90">
                {sw !== undefined ? `${formatEther(sw)} Ξ` : "…"}
              </div>
              {uw !== undefined && uw > 0n ? (
                <div className="text-[10px] text-cyan-500/80">You {formatEther(uw)}</div>
              ) : (
                <div className="text-[10px] text-cyan-700/80">—</div>
              )}
              <button
                type="button"
                disabled={!canAct || !address || wrongChain || isPending}
                onClick={() => void onBet(slot)}
                className="mt-auto border border-cyan-400/40 py-1 text-[10px] font-bold uppercase tracking-wider text-cyan-100 hover:bg-cyan-500/15 disabled:opacity-40"
              >
                Bet
              </button>
            </div>
          );
        })}
      </div>

      <p className="mt-3 text-center text-[10px] leading-relaxed text-cyan-600/90 md:text-[11px]">
        Trophy holders: claim ETH from the NFT contract when accrued — see docs. Randomness is on-chain pseudo-random;
        high stakes → plan VRF.
      </p>
    </section>
  );
}
