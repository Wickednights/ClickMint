"use client";

import type { CSSProperties } from "react";
import Link from "next/link";
import Image from "next/image";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWatchContractEvent,
  useChainId,
  useSwitchChain,
  useConnect,
  useDisconnect,
  useBalance,
  usePublicClient,
  useWalletClient,
} from "wagmi";
import { WalletPickerDialog } from "@/components/wallet-picker-dialog";
import { GaslessSessionDialog } from "@/components/gasless-session-dialog";
import { useGaslessClickSession } from "@/hooks/use-gasless-click-session";
import { isPimlicoConfigured } from "@/lib/account-abstraction";
import {
  claimableVaultDisplay,
  clickCreditsFromDeposit,
  creditsGrantedOnDeposit,
  depositBonusLabel,
  earlySpendLiquidWei,
  earlySpendSplitWei,
  formatClickDisplayWei,
  formatPotEthDisplay,
  formatWholeCredits,
  isTinyClickCostWei,
  onChainPlaysRemaining,
  vestingVaultDisplay,
} from "@/lib/game-display";
import { clickmintChainId, clickmintChainLabel, isClickmintBaseMainnet } from "@/lib/clickmint-chain";
import { formatEther, parseEther, type Address } from "viem";
import { toast } from "sonner";
import { binaryTrophyAbi, clickMintGameAbi, clickTokenAbi } from "@/lib/abi";
import { explainRevertData, extractRevertData } from "@/lib/revert-reason";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { BlockBetPanel, BlockBetSidebarCard, useBlockBetGame } from "@/components/block-bet-panel";
import { ClickHistoryPanel } from "@/components/click-history-panel";
import { SidebarRecentTrophies, TrophyRoomGrid } from "@/components/trophy-room-panel";
import { getClickAddress, getGameAddress, getTrophyNftAddress } from "@/lib/addresses";
import { economyPresetHint, economyPresetShortLabel } from "@/lib/economy-preset";
import { useClickMintAudio } from "@/hooks/use-clickmint-audio";
import {
  gameRoundIndexFromUnixSec,
  hourIdForDisplay,
  potRoundKind,
  readGenesisGameRoundFromEnv,
  GAME_RESET_BUFFER_SEC,
} from "@/lib/game-genesis";
import { fetchPotWinLogs, potHistoryFromBlock, type PotWinLogRow } from "@/lib/pot-win-logs";
import { fetchTrophyMintLogs, trophyHistoryFromBlock } from "@/lib/trophy-mints";

const QUICK_BUY = ["0.001", "0.01", "0.1", "0.25", "0.5", "1"] as const;

/** Pot bar fills to 100% at this on-chain pot size (display only; tune for your campaign). */
const POT_BAR_DISPLAY_MAX = parseEther("0.05");

/** Accent for round # and Add credits (neon magenta). */
const NEON_MAGENTA_TEXT = "text-[#ff2ee8] drop-shadow-[0_0_12px_rgba(255,46,232,0.55)]";
const NEON_MAGENTA_BTN =
  "border-2 border-[#ff2ee8]/75 bg-[#ff2ee8]/10 text-[#ff2ee8] shadow-[0_0_14px_rgba(255,46,232,0.35)] hover:bg-[#ff2ee8]/18";

const ZERO_ADDR = "0x0000000000000000000000000000000000000000" as const;

async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/** Winning 15s slot after finalize: 0..3 within the minute. */
function slotSpanLabel(winSlot: number): string {
  if (winSlot < 0 || winSlot > 3) return "—";
  const starts = [0, 15, 30, 45];
  const a = starts[winSlot];
  return `${a}–${a + 14}s in minute`;
}

function formatCountdown(totalSec: number): string {
  if (totalSec <= 0) return "0:00";
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

type PotRow = PotWinLogRow;

type MobileTab = "terminal" | "history" | "trophies" | "clicks";

function Icon({ name, className }: { name: string; className?: string }) {
  return (
    <span className={cn("material-symbols-outlined text-lg", className)} aria-hidden>
      {name}
    </span>
  );
}

function addressExplorerUrl(addr: string): string {
  const base = isClickmintBaseMainnet() ? "https://basescan.org" : "https://sepolia.basescan.org";
  return `${base}/address/${addr}`;
}

function WinnerTable({ rows, genesisGameHour }: { rows: PotRow[]; genesisGameHour: bigint | null }) {
  if (rows.length === 0) {
    return (
      <p className="text-center font-body text-sm text-secondary opacity-80 md:text-base">
        No rows in range. Set <code className="text-primary-fixed/90">NEXT_PUBLIC_GAME_DEPLOY_BLOCK</code> if logs are
        truncated — see{" "}
        <Link href="/documentation" className="text-primary-fixed underline-offset-2 hover:underline">
          docs
        </Link>
        .
      </p>
    );
  }
  const col = potRoundKind(genesisGameHour);
  return (
    <div className="w-full space-y-3">
      <div className="max-h-[min(60vh,28rem)] overflow-auto rounded-md border border-outline-variant/25">
        <table className="w-full table-fixed text-left font-body text-sm text-on-surface md:text-base">
          <thead>
            <tr className="font-label text-xs uppercase tracking-widest text-secondary md:text-sm">
              <th className="w-[14%] px-2 py-3 pr-2">{col}</th>
              <th className="w-[26%] px-2 py-3 pr-2">Span</th>
              <th className="px-2 py-3 pr-2">Winner</th>
              <th className="w-[18%] px-2 py-3 text-right tabular-nums">ETH</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-t border-outline-variant/20">
                <td className="px-2 py-3 pr-2 font-headline text-primary-fixed tabular-nums">
                  {hourIdForDisplay(r.roundId, genesisGameHour)}
                </td>
                <td className="px-2 py-3 pr-2 font-mono text-xs text-secondary md:text-sm">
                  {slotSpanLabel(Number(r.winSlot))}
                </td>
                <td className="truncate px-2 py-3 pr-2 font-mono text-xs md:text-sm" title={r.winner}>
                  {r.winner.toLowerCase() === ZERO_ADDR.toLowerCase() ? (
                    <span className="text-secondary">No eligible winner (carry)</span>
                  ) : (
                    r.winner
                  )}
                </td>
                <td className="px-2 py-3 text-right font-headline font-semibold tabular-nums text-primary">
                  {formatPotEthDisplay(r.payout)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-center font-body text-[11px] text-secondary opacity-75 md:text-xs">
        On-chain <code className="text-primary-fixed/90">PotWin</code> /{" "}
        <code className="text-primary-fixed/90">finalizeRound</code>.{" "}
        <Link href="/documentation#pot" className="text-primary-fixed underline-offset-2 hover:underline">
          Details
        </Link>
      </p>
    </div>
  );
}

/** Desktop sidebar: last 5 rounds with an actual winner (excludes carry-only finalizations). */
function SidebarPotWinners({ rows, genesisGameHour }: { rows: PotRow[]; genesisGameHour: bigint | null }) {
  const winnerRows = rows.filter(
    (r) => r.winner.toLowerCase() !== ZERO_ADDR.toLowerCase() && r.payout > 0n
  );
  const shown = winnerRows.slice(0, 5);
  const rk = potRoundKind(genesisGameHour);
  return (
    <div className="border-t border-outline-variant/20 pt-4">
      <h3 className="mb-3 text-center font-headline text-sm font-bold uppercase tracking-[0.2em] text-emerald-300/90">
        POT winners
      </h3>
      {shown.length === 0 ? (
        <p className="text-center font-body text-xs text-secondary">None in indexed range.</p>
      ) : (
        <ul className="space-y-2.5">
          {shown.map((r) => (
            <li
              key={r.key}
              className="rounded border border-emerald-500/25 bg-emerald-500/[0.07] px-3 py-2.5 text-center"
            >
              <div className="font-label text-xs uppercase tracking-wider text-secondary">
                {rk} {hourIdForDisplay(r.roundId, genesisGameHour)}
              </div>
              <div className="mt-1 truncate font-mono text-sm text-primary-fixed" title={r.winner}>
                {r.winner.slice(0, 6)}…{r.winner.slice(-4)}
              </div>
              <div className="mt-1 font-headline text-base font-bold tabular-nums text-emerald-200/95">
                +{formatPotEthDisplay(r.payout)} ETH
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ClickMintDashboard() {
  const gameAddr = getGameAddress();
  const clickAddr = getClickAddress();
  const trophyAddr = getTrophyNftAddress();

  const {
    musicOn,
    setMusicOn,
    sfxOn,
    setSfxOn,
    playClickSuccess,
    playWin,
    playNft,
    playError,
    celebrateWin,
  } = useClickMintAudio();

  const sfxRef = useRef({
    playClickSuccess,
    playWin,
    playNft,
    playError,
    celebrateWin,
  });
  useEffect(() => {
    sfxRef.current = { playClickSuccess, playWin, playNft, playError, celebrateWin };
  }, [playClickSuccess, playWin, playNft, playError, celebrateWin]);

  const [walletOpen, setWalletOpen] = useState(false);
  const [walletAccountOpen, setWalletAccountOpen] = useState(false);
  const walletAccountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!walletAccountOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (walletAccountRef.current && !walletAccountRef.current.contains(e.target as Node)) {
        setWalletAccountOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setWalletAccountOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("keydown", onKey);
    };
  }, [walletAccountOpen]);

  const { address, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient({ chainId: clickmintChainId() });
  const gasless = useGaslessClickSession(gameAddr);
  /** All ClickMint game balance / POT / vesting use the connected EOA; gasless uses a smart account only as tx executor. */
  const playerAddress = address;

  const [gaslessDialogOpen, setGaslessDialogOpen] = useState(false);
  const [gaslessActionPending, setGaslessActionPending] = useState(false);

  const chainId = useChainId();
  const { isPending: connectPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, switchChainAsync, isPending: switchPending } = useSwitchChain();
  const { data: walletEthBalance } = useBalance({
    address,
    chainId: clickmintChainId(),
    query: { enabled: !!address },
  });

  const { writeContractAsync, isPending: writePending } = useWriteContract();
  const publicClient = usePublicClient({ chainId: clickmintChainId() });
  const queryClient = useQueryClient();

  /** First `gameRound` bucket after deploy — from `NEXT_PUBLIC_GAME_GENESIS_UNIX` or `NEXT_PUBLIC_GAME_DEPLOY_BLOCK`. */
  const [genesisGameHour, setGenesisGameHour] = useState<bigint | null>(() => readGenesisGameRoundFromEnv());

  useEffect(() => {
    const blockStr = typeof process !== "undefined" ? process.env.NEXT_PUBLIC_GAME_DEPLOY_BLOCK?.trim() : undefined;
    if (!blockStr || !publicClient) return;
    if (!/^\d+$/.test(blockStr)) return;
    const blockNumber = BigInt(blockStr);
    let cancelled = false;
    void publicClient
      .getBlock({ blockNumber })
      .then((b) => {
        if (!cancelled) setGenesisGameHour(gameRoundIndexFromUnixSec(Number(b.timestamp)));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [publicClient]);

  /** One wall-clock second bucket for reads + countdowns — avoids refetch thrash from `Date.now()` on unrelated renders. */
  const [tickSec, setTickSec] = useState(() => Math.floor(Date.now() / 1000));
  /** Wall-clock second for `gameRound(ts)` — any ts in the current minute returns the same round id. */
  const gameRoundReadTs = useMemo(() => BigInt(tickSec), [tickSec]);
  const { data: gameRoundNow } = useReadContract({
    address: gameAddr,
    abi: clickMintGameAbi,
    functionName: "gameRound",
    args: [gameRoundReadTs],
    query: { enabled: !!gameAddr, placeholderData: keepPreviousData },
  });

  const { data: totalClicksThisRound } = useReadContract({
    address: gameAddr,
    abi: clickMintGameAbi,
    functionName: "totalClicksInRound",
    args: gameRoundNow !== undefined ? [gameRoundNow] : undefined,
    query: {
      enabled: !!gameAddr && gameRoundNow !== undefined,
      refetchInterval: 4_000,
    },
  });

  /** 1-based round counter since contract deploy (requires genesis env). */
  const roundsSinceLaunch = useMemo(() => {
    if (gameRoundNow === undefined || genesisGameHour === null) return undefined;
    return gameRoundNow >= genesisGameHour ? gameRoundNow - genesisGameHour + 1n : 1n;
  }, [gameRoundNow, genesisGameHour]);

  const prevRound = useMemo(() => {
    if (gameRoundNow === undefined || gameRoundNow === 0n) return undefined;
    return gameRoundNow - 1n;
  }, [gameRoundNow]);

  const { data: prevFinalized } = useReadContract({
    address: gameAddr,
    abi: clickMintGameAbi,
    functionName: "roundFinalized",
    args: prevRound !== undefined ? [prevRound] : undefined,
    query: { enabled: !!gameAddr && prevRound !== undefined },
  });

  const { data: prevRoundWinSlot } = useReadContract({
    address: gameAddr,
    abi: clickMintGameAbi,
    functionName: "roundWinSlot",
    args: prevRound !== undefined ? [prevRound] : undefined,
    query: { enabled: !!gameAddr && prevRound !== undefined && !!prevFinalized },
  });

  useEffect(() => {
    const id = setInterval(() => setTickSec(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(id);
  }, []);

  const potClock = useMemo(() => {
    const now = tickSec;
    if (gameRoundNow === undefined) return null;
    const nextBoundary = (gameRoundNow + 1n) * 60n + BigInt(GAME_RESET_BUFFER_SEC);
    const secToRoundEnd = Math.max(0, Number(nextBoundary - BigInt(now)));

    let secUntilFinalizeGate: number | null = null;
    if (gameRoundNow > 0n) {
      const gate = gameRoundNow * 60n + BigInt(GAME_RESET_BUFFER_SEC);
      secUntilFinalizeGate = now >= Number(gate) ? 0 : Number(gate - BigInt(now));
    }

    return {
      secToRoundEnd,
      secUntilFinalizeGate,
      gameRoundId: gameRoundNow,
      nextBoundaryEpochSec: Number(nextBoundary),
    };
  }, [gameRoundNow, tickSec]);

  const { data: credits, refetch: refetchCredits } = useReadContract({
    address: gameAddr,
    abi: clickMintGameAbi,
    functionName: "credits",
    args: playerAddress ? [playerAddress] : undefined,
    query: { enabled: !!gameAddr && !!playerAddress },
  });

  const { data: clickCostCredits } = useReadContract({
    address: gameAddr,
    abi: clickMintGameAbi,
    functionName: "clickCostCredits",
    query: { enabled: !!gameAddr },
  });

  const playsRemainingBig = useMemo(() => {
    if (credits === undefined) return 0n;
    return onChainPlaysRemaining(credits, clickCostCredits);
  }, [credits, clickCostCredits]);

  const unlimitedClicks = clickCostCredits !== undefined && clickCostCredits === 0n;
  const tinyClickCost = isTinyClickCostWei(clickCostCredits);

  /** True when the player cannot afford a single click (credits loaded). */
  const needsBuyCredits = useMemo(
    () =>
      isConnected &&
      !!address &&
      !unlimitedClicks &&
      clickCostCredits !== undefined &&
      clickCostCredits > 0n &&
      credits !== undefined &&
      playsRemainingBig === 0n,
    [isConnected, address, unlimitedClicks, clickCostCredits, credits, playsRemainingBig]
  );

  const { data: gameClickTokenAddr } = useReadContract({
    address: gameAddr,
    abi: clickMintGameAbi,
    functionName: "clickToken",
    query: { enabled: !!gameAddr },
  });

  const { data: clickTokenLinkedGame } = useReadContract({
    address: gameClickTokenAddr,
    abi: clickTokenAbi,
    functionName: "game",
    query: { enabled: !!gameClickTokenAddr },
  });

  const { data: potWei, refetch: refetchPot } = useReadContract({
    address: gameAddr,
    abi: clickMintGameAbi,
    functionName: "currentPotEth",
    query: { enabled: !!gameAddr, refetchInterval: 12_000 },
  });

  const { data: baseClickReward } = useReadContract({
    address: gameAddr,
    abi: clickMintGameAbi,
    functionName: "baseClickReward",
    query: { enabled: !!gameAddr },
  });

  const { data: minPotClicks } = useReadContract({
    address: gameAddr,
    abi: clickMintGameAbi,
    functionName: "minPotClicks",
    query: { enabled: !!gameAddr },
  });

  const { data: claimable, refetch: refetchClaimable } = useReadContract({
    address: clickAddr,
    abi: clickTokenAbi,
    functionName: "claimable",
    args: playerAddress ? [playerAddress] : undefined,
    query: {
      enabled: !!clickAddr && !!playerAddress,
      refetchInterval: 12_000,
      placeholderData: keepPreviousData,
    },
  });

  /** On-chain name is pendingVested — it is the still-unvested slice (early-spend cap), not “pending rewards” total. */
  const { data: unvestedWei, refetch: refetchUnvested } = useReadContract({
    address: clickAddr,
    abi: clickTokenAbi,
    functionName: "pendingVested",
    args: playerAddress ? [playerAddress] : undefined,
    query: {
      enabled: !!clickAddr && !!playerAddress,
      refetchInterval: 12_000,
      placeholderData: keepPreviousData,
    },
  });

  const [earlyAmt, setEarlyAmt] = useState("");
  const [mobileTab, setMobileTab] = useState<MobileTab>("terminal");
  const [earlyClaimInfoOpen, setEarlyClaimInfoOpen] = useState(false);
  const [depositOpen, setDepositOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [heroClickFlash, setHeroClickFlash] = useState(false);
  const heroClickFlashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastClientClick = useRef(0);
  /** Prevents overlapping click() submissions before wagmi `writePending` flips (double taps / fast retries). */
  const clickInFlight = useRef(false);
  const [cooldownMs, setCooldownMs] = useState(0);

  /** UX pacing; on-chain limit is `MAX_CLICKS_PER_BLOCK` (20) per L2 block. */
  const MIN_CLICK_INTERVAL_MS = 100;

  const triggerHeroClickFlash = useCallback(() => {
    if (heroClickFlashTimerRef.current) {
      clearTimeout(heroClickFlashTimerRef.current);
      heroClickFlashTimerRef.current = null;
    }
    setHeroClickFlash(true);
    heroClickFlashTimerRef.current = setTimeout(() => {
      setHeroClickFlash(false);
      heroClickFlashTimerRef.current = null;
    }, 480);
  }, []);

  useEffect(() => {
    return () => {
      if (heroClickFlashTimerRef.current) clearTimeout(heroClickFlashTimerRef.current);
    };
  }, []);

  const gameLinkOk = useMemo(() => {
    if (!gameAddr || clickTokenLinkedGame === undefined) return false;
    return clickTokenLinkedGame.toLowerCase() === gameAddr.toLowerCase();
  }, [gameAddr, clickTokenLinkedGame]);

  const gameLinkPending = !!gameClickTokenAddr && clickTokenLinkedGame === undefined;

  useEffect(() => {
    if (cooldownMs <= 0) return;
    const t = setInterval(() => setCooldownMs((c) => Math.max(0, c - 50)), 50);
    return () => clearInterval(t);
  }, [cooldownMs]);

  const { data: potRows = [] } = useQuery({
    queryKey: ["potWins", gameAddr],
    queryFn: async () => {
      if (!publicClient || !gameAddr) return [];
      const latest = await publicClient.getBlockNumber();
      const fromBlock = potHistoryFromBlock(latest);
      return fetchPotWinLogs(publicClient, gameAddr, fromBlock);
    },
    enabled: !!publicClient && !!gameAddr,
    staleTime: 45_000,
    refetchInterval: 120_000,
  });

  const { data: trophyMintHistory = [] } = useQuery({
    queryKey: ["trophyMints", trophyAddr],
    queryFn: async () => {
      if (!publicClient || !trophyAddr) return [];
      const latest = await publicClient.getBlockNumber();
      const fromBlock = trophyHistoryFromBlock(latest);
      return fetchTrophyMintLogs(publicClient, trophyAddr, fromBlock);
    },
    enabled: !!publicClient && !!trophyAddr,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  useWatchContractEvent({
    address: gameAddr,
    abi: clickMintGameAbi,
    eventName: "PotWin",
    onLogs(logs) {
      let invalidatePot = false;
      for (const log of logs) {
        const args = log.args as unknown as {
          roundId: bigint;
          winner: Address;
          ethPayout: bigint;
          winSlot: number;
          entropy: `0x${string}`;
        };
        if (!args?.winner || args.winner === ZERO_ADDR) {
          toast.message("POT — no eligible winner; carry forward.");
          void refetchPot();
          invalidatePot = true;
          continue;
        }
        invalidatePot = true;
        sfxRef.current.playWin();
        sfxRef.current.celebrateWin();
        toast.success("POT WIN", {
          description: `${args.winner.slice(0, 10)}… +${formatPotEthDisplay(args.ethPayout)} ETH`,
          duration: 8000,
        });
        void refetchPot();
      }
      if (invalidatePot) void queryClient.invalidateQueries({ queryKey: ["potWins", gameAddr] });
    },
    enabled: !!gameAddr,
  });

  useEffect(() => {
    if (!isConnected) gasless.clear();
  }, [isConnected]); // eslint-disable-line react-hooks/exhaustive-deps -- clear gasless only on disconnect

  useEffect(() => {
    if (gasless.status === "ready" && gaslessDialogOpen) {
      setGaslessDialogOpen(false);
      toast.success("Gasless session active", {
        description:
          "Clicks are sponsored (no gas). All credits and $CLICK stay on your EOA — your smart account only submits clickFor(you).",
        duration: 9000,
      });
    }
  }, [gasless.status, gaslessDialogOpen]);

  useWatchContractEvent({
    address: trophyAddr,
    abi: binaryTrophyAbi,
    eventName: "Transfer",
    onLogs(logs) {
      let sawMint = false;
      for (const log of logs) {
        const args = log.args as unknown as { from?: Address; to?: Address; tokenId?: bigint };
        const from = args?.from;
        const to = args?.to;
        const tokenId = args?.tokenId;
        if (!from || !to || tokenId === undefined) continue;
        if (from.toLowerCase() !== ZERO_ADDR.toLowerCase()) continue;
        sawMint = true;
        if (address && to.toLowerCase() === address.toLowerCase()) {
          sfxRef.current.playNft();
          toast.success("Trophy NFT received", {
            description: `Token #${tokenId.toString()}`,
            duration: 6000,
          });
        }
      }
      if (sawMint) void queryClient.invalidateQueries({ queryKey: ["trophyMints", trophyAddr] });
    },
    enabled: !!trophyAddr,
  });

  const wrongChain = isConnected && chainId !== clickmintChainId();

  const onDeposit = async (eth: string) => {
    if (!gameAddr || !address || !publicClient) return;
    if (wrongChain) {
      try {
        await switchChainAsync({ chainId: clickmintChainId() });
      } catch {
        toast.error(`Switch to ${clickmintChainLabel()} (${clickmintChainId()})`, {
          description: `Deposits must be signed on chain ${clickmintChainId()}. Choose ${clickmintChainLabel()} in your wallet, then try again.`,
        });
        return;
      }
    }
    const valueWei = parseEther(eth);

    try {
      const hash = await writeContractAsync({
        chainId: clickmintChainId(),
        address: gameAddr,
        abi: clickMintGameAbi,
        functionName: "deposit",
        value: valueWei,
      });
      await publicClient.waitForTransactionReceipt({ hash });
      await Promise.all([refetchCredits(), refetchPot()]);
      setDepositOpen(false);
      toast.success(`Deposited ${eth} ETH`, { description: "Click Credits updated on-chain (includes any tier bonus)." });
    } catch (e) {
      sfxRef.current.playError();
      const data = extractRevertData(e);
      let msg = data ? explainRevertData(data) : (e as Error).message;
      if (/8453|84532|chain id|invalid chain|wrong chain/i.test(msg)) {
        msg = `${msg.slice(0, 160)} — Use ${clickmintChainLabel()} (${clickmintChainId()}). If your wallet shows the wrong network, switch RPC or network in your wallet.`;
      }
      console.error("deposit() failed", e);
      toast.error("Deposit failed", { description: msg.slice(0, 320) });
    }
  };

  const onClick = async () => {
    if (!gameAddr || !address) return;
    if (wrongChain) {
      try {
        await switchChainAsync({ chainId: clickmintChainId() });
      } catch {
        toast.error(
          `Switch to ${clickmintChainLabel()} (${clickmintChainId()}) in your wallet, then tap CLICK again.`
        );
        return;
      }
    }
    if (gameLinkPending) {
      toast.message("Still loading on-chain config…");
      return;
    }
    if (!gameLinkOk) {
      sfxRef.current.playError();
      toast.error("CLICK token is not linked to this game", {
        description:
          "On-chain CLICK.game is zero or points elsewhere. Deploy owner must run: CLICK.setGame(<ClickMintGame address>). See repo contracts/scripts/set-game.ts",
        duration: 12_000,
      });
      return;
    }
    if (needsBuyCredits) {
      setDepositOpen(true);
      toast.message("Add ETH for click credits", {
        description: "Deposits fund your credit balance so each CLICK can burn the per-click cost.",
      });
      return;
    }
    const now = Date.now();
    if (clickInFlight.current) {
      sfxRef.current.playError();
      toast.message("Previous click still in progress", {
        description: "Wait for the wallet / network to finish the last transaction.",
      });
      return;
    }
    if (now - lastClientClick.current < MIN_CLICK_INTERVAL_MS) {
      setCooldownMs(MIN_CLICK_INTERVAL_MS - (now - lastClientClick.current));
      sfxRef.current.playError();
      toast.message("Cooldown");
      return;
    }
    lastClientClick.current = now;
    clickInFlight.current = true;
    try {
      if (!publicClient) throw new Error(`No RPC client for ${clickmintChainLabel()}`);

      if (gasless.status === "ready" && address) {
        try {
          setGaslessActionPending(true);
          const hash = await gasless.gaslessClick(address);
          await publicClient.waitForTransactionReceipt({ hash });
          await Promise.all([refetchCredits(), refetchUnvested(), refetchClaimable()]);
          sfxRef.current.playClickSuccess();
          toast.success("Click sent (gasless)");
          return;
        } catch (ge) {
          console.warn("gasless click failed, falling back to wallet tx", ge);
          toast.message("Gasless click failed — retrying with wallet signature.");
        } finally {
          setGaslessActionPending(false);
        }
      }

      const { request } = await publicClient.simulateContract({
        address: gameAddr,
        abi: clickMintGameAbi,
        functionName: "click",
        account: address,
      });
      const gasHeadroom =
        request.gas !== undefined ? (request.gas * 13n) / 10n : undefined;
      const hash = await writeContractAsync({
        ...request,
        chainId: clickmintChainId(),
        ...(gasHeadroom !== undefined ? { gas: gasHeadroom } : {}),
      });
      await publicClient.waitForTransactionReceipt({ hash });
      await Promise.all([refetchCredits(), refetchUnvested(), refetchClaimable()]);
      sfxRef.current.playClickSuccess();
      toast.success("Click sent");
    } catch (e) {
      lastClientClick.current = 0;
      setCooldownMs(0);
      sfxRef.current.playError();
      const data = extractRevertData(e);
      let msg = data ? explainRevertData(data) : (e as Error).message;
      console.error("click() failed", { error: e, revertData: data, explained: msg });
      if (
        !data &&
        /out of gas|intrinsic gas too low|exceeds block gas|gas required exceeds/i.test(msg)
      ) {
        msg =
          "Your wallet often labels reverts as “out of gas.” Here, rapid clicks can exceed the on-chain limit of 20 clicks per L2 block, or the random click-hash check can fail as difficulty rises — wait for confirmation, then try again.";
      }
      toast.error("Click failed", { description: msg.slice(0, 320), duration: 12_000 });
    } finally {
      clickInFlight.current = false;
    }
  };

  const onClaim = async () => {
    if (!clickAddr || wrongChain || !publicClient) return;
    try {
      const hash = await writeContractAsync({
        chainId: clickmintChainId(),
        address: clickAddr,
        abi: clickTokenAbi,
        functionName: "claimVested",
      });
      await publicClient.waitForTransactionReceipt({ hash });
      await Promise.all([refetchClaimable(), refetchUnvested()]);
      toast.success("Vested $CLICK claimed");
    } catch (e) {
      sfxRef.current.playError();
      const data = extractRevertData(e);
      const msg = data ? explainRevertData(data) : (e as Error).message;
      console.error("claimVested() failed", e);
      toast.error("Claim failed", { description: msg.slice(0, 220) });
    }
  };

  const onEarlySpend = async () => {
    if (!clickAddr || wrongChain || !address) return;
    const cap = unvestedWei ?? 0n;
    let amt: bigint;
    try {
      amt = parseEther(earlyAmt.trim() === "" ? "0" : earlyAmt.trim());
    } catch {
      sfxRef.current.playError();
      toast.error("Early claim", { description: "Enter a valid $CLICK amount (on-chain uses ether-style decimals)." });
      return;
    }
    if (amt === 0n) {
      toast.message("Enter an amount ≤ your unvested balance (see Unvested).");
      return;
    }
    if (amt > cap) {
      sfxRef.current.playError();
      toast.error("Early claim exceeds unvested", {
        description:
          cap === 0n
            ? "You have 0 unvested $CLICK in the vesting vault. Clicks must grant baseClickReward, or wait for vesting after rewards."
            : `Max early claim now: ${formatClickDisplayWei(cap)} $CLICK (unvested). Wallets often say "rejected" when simulation reverts.`,
      });
      return;
    }
    try {
      if (publicClient) {
        await publicClient.simulateContract({
          address: clickAddr,
          abi: clickTokenAbi,
          functionName: "earlySpendPending",
          args: [amt],
          account: address,
        });
      }
      await writeContractAsync({
        chainId: clickmintChainId(),
        address: clickAddr,
        abi: clickTokenAbi,
        functionName: "earlySpendPending",
        args: [amt],
      });
      void refetchUnvested();
      void refetchClaimable();
      toast.success("Early claim (30/30/20/20 split on unvested)");
    } catch (e) {
      sfxRef.current.playError();
      const data = extractRevertData(e);
      let msg = data ? explainRevertData(data) : (e as Error).message;
      if (/unvested/i.test(msg) || msg.includes("click: unvested")) {
        msg = `On-chain: amount must be ≤ unvested (${formatClickDisplayWei(cap)} $CLICK). ${msg}`;
      }
      if (/user rejected|denied|rejected/i.test(msg)) {
        msg = `${msg.slice(0, 120)} — If you did not cancel, the wallet may be hiding a revert; try a smaller amount.`;
      }
      console.error("earlySpendPending() failed", e);
      toast.error("Early claim failed", { description: msg.slice(0, 260) });
    }
  };

  const onFinalize = async () => {
    if (!gameAddr || wrongChain || prevRound === undefined) return;
    try {
      await writeContractAsync({
        chainId: clickmintChainId(),
        address: gameAddr,
        abi: clickMintGameAbi,
        functionName: "finalizeRound",
        args: [prevRound],
      });
      toast.message(
        `Finalize ${potRoundKind(genesisGameHour)} ${hourIdForDisplay(prevRound, genesisGameHour)} sent`
      );
    } catch (e) {
      sfxRef.current.playError();
      const data = extractRevertData(e);
      const msg = data ? explainRevertData(data) : (e as Error).message;
      console.error("finalizeRound() failed", e);
      toast.error("Finalize failed", { description: msg.slice(0, 220) });
    }
  };

  const potEthStr =
    potWei !== undefined
      ? Number(formatEther(potWei)).toLocaleString("en-US", {
          maximumFractionDigits: 6,
          minimumFractionDigits: 0,
        })
      : "0";
  const potFillPct = useMemo(() => {
    if (potWei === undefined || POT_BAR_DISPLAY_MAX === 0n) return 0;
    if (potWei >= POT_BAR_DISPLAY_MAX) return 100;
    return Number((potWei * 100n) / POT_BAR_DISPLAY_MAX);
  }, [potWei]);

  const cooldownLabel = cooldownMs > 0 ? (cooldownMs / 1000).toFixed(1) : null;

  const vestingDisplay = useMemo(() => {
    const u = unvestedWei ?? 0n;
    const c = claimable ?? 0n;
    const br = baseClickReward;
    return {
      unvested: vestingVaultDisplay(u, br),
      claimable: claimableVaultDisplay(c, br),
    };
  }, [unvestedWei, claimable, baseClickReward]);

  const parsedEarlySpend: { ok: true; wei: bigint } | { ok: false } = useMemo(() => {
    const t = earlyAmt.trim();
    if (t === "") return { ok: true, wei: 0n };
    try {
      return { ok: true, wei: parseEther(t) };
    } catch {
      return { ok: false };
    }
  }, [earlyAmt]);

  const earlySpendWei = parsedEarlySpend.ok ? parsedEarlySpend.wei : 0n;
  const unvestedCap = unvestedWei ?? 0n;

  const earlyLiquidPreview = useMemo(() => {
    if (!parsedEarlySpend.ok || unvestedCap === 0n) return null;
    const t = earlyAmt.trim();
    const spend =
      t === "" ? unvestedCap : earlySpendWei > unvestedCap ? null : earlySpendWei === 0n ? null : earlySpendWei;
    if (spend === null || spend === 0n) return null;
    return { spend, liquid: earlySpendLiquidWei(spend) };
  }, [parsedEarlySpend.ok, earlyAmt, earlySpendWei, unvestedCap]);

  /** Amount used for early-claim split table (empty input = full unvested). */
  const earlyBreakdownSpend = useMemo(() => {
    if (unvestedCap === 0n || !parsedEarlySpend.ok) return null;
    const t = earlyAmt.trim();
    if (t === "") return unvestedCap;
    if (earlySpendWei === 0n || earlySpendWei > unvestedCap) return null;
    return earlySpendWei;
  }, [unvestedCap, parsedEarlySpend.ok, earlyAmt, earlySpendWei]);

  const earlySplitDisplay = useMemo(() => {
    if (earlyBreakdownSpend === null) return null;
    return earlySpendSplitWei(earlyBreakdownSpend);
  }, [earlyBreakdownSpend]);

  const earlyClaimHoverSummary = useMemo(() => {
    const parts = [
      "Early claim: 30% burn, 30% treasury, 20% LP, 20% to you (on the unvested amount you enter or Max). Claim vested only releases time-unlocked tokens.",
    ];
    if (earlySplitDisplay && earlyBreakdownSpend) {
      parts.push(
        `Estimate on ${formatClickDisplayWei(earlyBreakdownSpend)} unvested: burn ${formatClickDisplayWei(earlySplitDisplay.burn)}, treasury ${formatClickDisplayWei(earlySplitDisplay.treasury)}, LP ${formatClickDisplayWei(earlySplitDisplay.lp)}, you ${formatClickDisplayWei(earlySplitDisplay.you)}.`,
      );
    }
    if (earlyLiquidPreview) {
      parts.push(
        `~${formatClickDisplayWei(earlyLiquidPreview.liquid)} liquid to you from ${formatClickDisplayWei(earlyLiquidPreview.spend)} unvested (approx).`,
      );
    }
    parts.push("Documentation: /documentation#early-claim");
    return parts.join(" ");
  }, [earlySplitDisplay, earlyBreakdownSpend, earlyLiquidPreview]);

  const canAct = isConnected && !wrongChain && !writePending && !gaslessActionPending;
  /** Allow CLICK on wrong chain so the handler can prompt a network switch. */
  const canSendClick =
    isConnected && !writePending && !gaslessActionPending && !gameLinkPending && gameLinkOk;

  const blockBet = useBlockBetGame({ gameAddr, tickSec, wrongChain, canAct });

  const { data: slotInRoundNow } = useReadContract({
    address: gameAddr,
    abi: clickMintGameAbi,
    functionName: "slotInRound",
    args: [BigInt(tickSec)],
    query: { enabled: !!gameAddr },
  });

  const wallSlotLabel =
    slotInRoundNow === undefined
      ? "—"
      : (["0–14s", "15–29s", "30–44s", "45–59s"] as const)[Number(slotInRoundNow)] ?? "—";

  const minutePotCard = (
    <div className="w-full max-w-[17rem] space-y-2 rounded border border-outline-variant/25 bg-surface-container-low/50 px-3 py-2.5 text-center shadow-sm shadow-black/20">
      <p className="font-label text-[10px] uppercase tracking-[0.2em] text-primary-fixed/90 md:text-[11px]">Minute POT</p>
      <div className="flex justify-between font-label text-[11px] uppercase tracking-widest text-secondary md:text-xs">
        <span>{potEthStr} ETH</span>
        <span className="text-primary-fixed">{potFillPct.toFixed(0)}%</span>
      </div>
      <div className="h-px w-full overflow-hidden bg-surface-container-highest">
        <div
          className="h-full bg-primary-fixed transition-all duration-700 shadow-[0_0_12px_#00fbfb]"
          style={{ width: `${potFillPct}%` }}
        />
      </div>
      <p className="font-body text-[10px] text-secondary opacity-90 md:text-[11px]">
        {minPotClicks !== undefined ? <>≥{minPotClicks.toString()} clicks + winning slot. </> : null}
        <Link href="/documentation#pot" className="text-primary-fixed/90 underline-offset-2 hover:underline">
          Rules
        </Link>
      </p>
      <button
        type="button"
        disabled={!canAct || prevRound === undefined || !!prevFinalized}
        onClick={() => void onFinalize()}
        className="w-full rounded border border-primary-fixed/40 bg-primary-fixed/10 py-2.5 font-label text-[11px] font-semibold uppercase tracking-widest text-primary-fixed shadow-[0_0_12px_rgba(0,251,251,0.12)] transition-colors hover:bg-primary-fixed/20 disabled:opacity-25 md:text-xs"
      >
        Finalize round / settle POT
      </button>
    </div>
  );

  const resetTimerStrip =
    potClock !== null ? (
      <div className="w-full max-w-lg rounded border border-outline-variant/20 bg-surface-container-low/30 px-3 py-2 text-center font-body text-[11px] text-secondary md:text-xs">
        <p className="font-headline text-sm font-bold tabular-nums text-white">
          Next round <span className="text-primary-fixed">{formatCountdown(potClock.secToRoundEnd)}</span>
        </p>
        <p className="mt-0.5 text-[10px] text-on-surface/75 md:text-[11px]">
          {wallSlotLabel} ·{" "}
          {new Date(tickSec * 1000).toLocaleTimeString(undefined, {
            hour: "numeric",
            minute: "2-digit",
            second: "2-digit",
          })}
        </p>
        {prevRound !== undefined && prevFinalized !== undefined ? (
          <p className="mt-1.5 text-[10px] md:text-[11px]">
            Prev {hourIdForDisplay(prevRound, genesisGameHour)}{" "}
            {prevFinalized ? <span className="text-emerald-300/90">done</span> : <span className="text-amber-200/90">open</span>}
            {prevFinalized && prevRoundWinSlot !== undefined ? (
              <>
                {" "}
                · <span className="text-primary-fixed">{slotSpanLabel(Number(prevRoundWinSlot))}</span>
              </>
            ) : null}
          </p>
        ) : null}
        {prevRound !== undefined && prevFinalized === false && potClock.secUntilFinalizeGate !== null ? (
          <p className="mt-1 text-[10px] md:text-[11px]">
            {potClock.secUntilFinalizeGate > 0 ? (
              <>
                Settle in <span className="tabular-nums text-primary-fixed">{formatCountdown(potClock.secUntilFinalizeGate)}</span>
              </>
            ) : (
              <span className="text-amber-100/95">Ready to finalize</span>
            )}
          </p>
        ) : null}
      </div>
    ) : (
      <p className="font-body text-[11px] text-secondary">Loading clock…</p>
    );

  const terminalBody = (
    <>
      <section className="mx-auto w-full max-w-4xl space-y-2 px-2 text-center">
        <p className="font-mono text-xs leading-snug text-on-surface/90 sm:text-sm md:text-[15px] md:leading-relaxed">
          <span className="font-semibold text-primary-fixed/95">Main Game</span> → Buy Credits → Press{" "}
          <span className="text-primary-fixed/95">CLICK</span> → Earn $CLICK → Win Revshare NFTs + Chance at ETH Pot → No
          Winner, Pot Rolls
        </p>
        <p className="font-mono text-xs leading-snug text-on-surface/90 sm:text-sm md:text-[15px] md:leading-relaxed">
          <span className="font-semibold text-primary-fixed/95">Degen Game</span> → Block bet → Choose a 15sec Block → Bet
          ETH → Winner Takes All of Block Bet Pot → No Winner, Pot Rolls
        </p>
        <p className="pt-1">
          <Link
            href="/documentation"
            className="font-mono text-xs font-semibold uppercase tracking-wide text-primary-fixed underline-offset-4 hover:underline sm:text-sm md:text-[13px]"
          >
            How It Works
          </Link>
        </p>
      </section>

      {/* Mobile: collapsible click history (desktop has sidebar feed) */}
      <details className="mx-auto w-full max-w-xl rounded border border-outline-variant/30 bg-surface-container-low/30 px-3 py-2 md:hidden [&_summary::-webkit-details-marker]:hidden">
        <summary className="cursor-pointer list-none text-center font-label text-[11px] font-bold uppercase tracking-[0.2em] text-primary-fixed">
          Click history
        </summary>
        <div className="mt-3 max-h-[min(70vh,28rem)] overflow-y-auto">
          <ClickHistoryPanel gameAddr={gameAddr} compact genesisGameHour={genesisGameHour} />
        </div>
      </details>

      {/* Setup / economy alerts */}
      <section className="mx-auto flex w-full max-w-sm flex-col items-center space-y-5 md:max-w-lg">
        {!gameLinkPending && !gameLinkOk && (
          <div className="w-full border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-center font-body text-[11px] text-amber-200 md:text-xs">
            Game not linked — owner: <span className="font-mono text-amber-100">set-game.ts</span>.
          </div>
        )}
        {baseClickReward !== undefined && baseClickReward === 0n && (
          <div className="w-full border border-outline-variant/40 bg-surface-container-low/80 px-3 py-2 text-center font-body text-[11px] text-secondary md:text-xs">
            <span className="text-primary-fixed/90">No $CLICK per click</span> — see{" "}
            <Link href="/documentation" className="text-primary-fixed underline">
              docs
            </Link>
            .
          </div>
        )}
        {tinyClickCost && (
          <p className="w-full text-center font-body text-[11px] text-amber-200/90 md:text-xs">
            Test mode: tiny <span className="font-mono">clickCostCredits</span> → huge credit counts. Fix via{" "}
            <span className="font-mono">set-economy-round.ts</span>.
          </p>
        )}
      </section>

      {/* CLICK hero inside 46-tile block-bet ring (4×15s sides). */}
      <div className="mx-auto w-full max-w-3xl px-2 py-1 md:py-2">
        <BlockBetPanel
          gameAddr={gameAddr}
          tickSec={tickSec}
          wrongChain={wrongChain}
          canAct={canAct}
          blockBet={blockBet}
          aboveRing={
            gameRoundNow !== undefined ? (
              <div className="hidden w-full flex-col items-center pb-0.5 text-center md:flex">
                <p
                  className={cn("font-mono text-3xl font-black tabular-nums leading-none md:text-4xl", NEON_MAGENTA_TEXT)}
                  title={
                    roundsSinceLaunch !== undefined
                      ? "Rounds since this game contract was deployed."
                      : "Raw on-chain minute round id. Add NEXT_PUBLIC_GAME_GENESIS_UNIX or NEXT_PUBLIC_GAME_DEPLOY_BLOCK for “rounds since launch.”"
                  }
                >
                  {roundsSinceLaunch !== undefined ? roundsSinceLaunch.toString() : `#${gameRoundNow.toString()}`}
                </p>
                <p className="mt-1 max-w-[14rem] font-label text-[10px] uppercase tracking-widest text-secondary md:text-[11px]">
                  {roundsSinceLaunch !== undefined ? "Since launch" : "Game round index (chain)"}
                </p>
              </div>
            ) : null
          }
          center={
            <div className="relative flex min-h-0 w-full flex-col items-center justify-center">
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-10 md:hidden">
                <div className="pulse-ring h-56 w-56 rounded-full border border-primary-container" />
              </div>
              <button
                type="button"
                disabled={!canSendClick}
                onClick={() => {
                  triggerHeroClickFlash();
                  void onClick();
                }}
                className={cn(
                  "relative z-10 flex h-56 w-56 flex-col items-center justify-center font-headline font-black uppercase transition-transform active:scale-90",
                  "md:h-64 md:w-64 md:shrink-0",
                  "rounded-full border-4 border-primary-container bg-surface-container md:rounded-2xl md:border-2 md:bg-primary-fixed md:text-on-primary-fixed",
                  wrongChain && "ring-2 ring-amber-400/80"
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "pointer-events-none absolute inset-0 z-0 rounded-full md:rounded-2xl neon-pulse",
                    heroClickFlash && "click-hero-flash"
                  )}
                />
                <span className="absolute inset-0 z-[1] rounded-full bg-gradient-to-tr from-primary-container/20 to-transparent md:rounded-2xl md:hidden" />
                <span className="relative z-20 font-headline text-4xl font-extrabold tracking-tighter text-white glitch-text md:text-5xl md:text-on-primary-fixed md:[text-shadow:none]">
                  CLICK
                </span>
                <span className="relative z-20 mt-1 font-label text-[10px] font-medium tracking-[0.3em] text-primary-fixed md:hidden">
                  EXECUTE
                </span>
              </button>
              {wrongChain && (
                <p className="mt-2 max-w-xs text-center font-body text-[10px] uppercase tracking-wider text-amber-200/90 md:text-[11px]">
                  Wrong network — tap CLICK to switch to {clickmintChainLabel()}, or use the header link.
                </p>
              )}
            </div>
          }
          belowRing={
            <div className="flex w-full flex-col items-center gap-2">
              <div className="border border-outline-variant/30 bg-surface-container-low px-3 py-1.5 font-label text-[10px] uppercase tracking-widest text-primary-fixed">
                <span className="inline-flex items-center gap-2">
                  <span
                    className="material-symbols-outlined text-xs"
                    style={{ fontVariationSettings: `"FILL" 1, "wght" 400` } as CSSProperties}
                  >
                    bolt
                  </span>
                  {cooldownLabel !== null ? (
                    <>RATE LIMIT: {cooldownLabel}s</>
                  ) : needsBuyCredits ? (
                    <>Buy credits</>
                  ) : (
                    <>READY</>
                  )}
                </span>
              </div>
              {totalClicksThisRound !== undefined ? (
                <p
                  className="max-w-sm px-2 text-center font-mono text-[11px] tabular-nums text-primary-fixed/90 md:text-xs"
                  title="All players’ clicks recorded on-chain for the current minute round."
                >
                  Total clicks this round:{" "}
                  <span className="font-semibold text-on-surface/95">{totalClicksThisRound.toString()}</span>
                </p>
              ) : null}
              <button
                type="button"
                id="hero-add-credits"
                aria-haspopup="dialog"
                aria-expanded={depositOpen}
                disabled={!isConnected}
                onClick={() => setDepositOpen(true)}
                className={cn(
                  "inline-flex items-center gap-1.5 px-3 py-1.5 font-label text-[10px] font-bold uppercase tracking-[0.15em] transition-colors",
                  !isConnected
                    ? "cursor-not-allowed border-2 border-outline-variant/30 text-secondary opacity-50"
                    : depositOpen
                      ? cn(NEON_MAGENTA_BTN, "bg-[#ff2ee8]/20")
                      : cn(NEON_MAGENTA_BTN)
                )}
              >
                <Icon name="add_circle" className="text-sm opacity-90" />
                Add credits
              </button>
              {gasless.status === "ready" ? (
                <p className="max-w-sm px-2 text-center font-mono text-[10px] text-secondary md:text-[11px]">
                  Gasless ·{" "}
                  {gasless.smartAccountAddress
                    ? `${gasless.smartAccountAddress.slice(0, 6)}…${gasless.smartAccountAddress.slice(-4)}`
                    : "—"}
                </p>
              ) : null}
            </div>
          }
        />
      </div>
    </>
  );

  return (
    <div className="relative min-h-[100dvh] text-on-surface">
      {/* Background */}
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div className="absolute left-1/2 top-1/2 h-[150%] w-[150%] -translate-x-1/2 -translate-y-1/2 bg-noise" />
        <div className="absolute inset-0 grid-accent opacity-40" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-primary-container/[0.04]" />
      </div>

      {/* Header — center cluster: mobile = viewport center; md = center of main column (sidebar 18rem + max-w-4xl strip). */}
      <header className="fixed left-0 top-0 z-50 w-full overflow-hidden border-b border-outline-variant/20 bg-surface/90 font-headline uppercase tracking-tighter backdrop-blur-sm">
        <div className="relative mx-auto flex min-h-[4rem] max-w-[100vw] items-center justify-between gap-x-2 px-3 py-2 sm:px-4 md:min-h-[4.25rem] md:px-4 md:py-2 lg:px-6">
          <div className="relative z-20 flex min-w-0 max-w-[min(100%,14rem)] flex-col gap-0.5 sm:max-w-[min(100%,11rem)] md:max-w-none">
            <div className="flex min-w-0 items-center gap-2">
              <Image
                src="/ClickMint_logo_tp.jpg"
                alt=""
                width={36}
                height={36}
                className="h-8 w-8 shrink-0 rounded-sm object-cover md:h-9 md:w-9"
                priority
              />
              <span className="truncate text-lg font-black tracking-tighter text-white md:text-2xl">CLICKMINT</span>
              <Link
                href="/documentation"
                className="ml-1 shrink-0 font-label text-[9px] uppercase tracking-widest text-primary-fixed/75 hover:text-primary-fixed sm:inline md:ml-2 md:hidden"
              >
                Docs
              </Link>
            </div>
            <p
              className="hidden truncate font-label text-[7px] uppercase leading-tight tracking-widest text-secondary/90 sm:block md:text-[8px]"
              title={`${economyPresetShortLabel()} — ${economyPresetHint()}`}
            >
              {economyPresetShortLabel()}
            </p>
          </div>

          {gameRoundNow !== undefined ? (
            <div className="pointer-events-none absolute inset-y-0 left-1/2 z-10 flex -translate-x-1/2 items-center md:left-[calc(18rem+min(56rem,100vw-18rem)/2)]">
              <div className="pointer-events-auto flex max-h-full flex-col items-center justify-center gap-1 py-1 md:gap-1.5 md:py-0">
                <div className="flex flex-col items-center gap-0.5 text-center md:hidden">
                  <p
                    className={cn("font-mono text-xl font-black tabular-nums leading-none", NEON_MAGENTA_TEXT)}
                    title={
                      roundsSinceLaunch !== undefined
                        ? "Rounds since this game contract was deployed."
                        : "Raw on-chain minute round id. Add NEXT_PUBLIC_GAME_GENESIS_UNIX or NEXT_PUBLIC_GAME_DEPLOY_BLOCK for “rounds since launch.”"
                    }
                  >
                    {roundsSinceLaunch !== undefined ? roundsSinceLaunch.toString() : `#${gameRoundNow.toString()}`}
                  </p>
                  <p className="max-w-[14rem] font-label text-[7px] uppercase tracking-widest text-secondary">
                    {roundsSinceLaunch !== undefined ? "Since launch" : "Game round index (chain)"}
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-1.5">
                  <button
                    type="button"
                    aria-pressed={musicOn}
                    aria-label="Background music"
                    title="Background music"
                    onClick={() => setMusicOn(!musicOn)}
                    className={cn(
                      "border border-outline-variant/50 px-2 py-1 font-label text-[8px] font-bold tracking-widest transition-colors md:px-2.5 md:text-[9px]",
                      musicOn ? "border-primary-fixed text-primary-fixed" : "text-secondary opacity-60 hover:text-primary-fixed"
                    )}
                  >
                    BGM
                  </button>
                  <button
                    type="button"
                    aria-pressed={sfxOn}
                    aria-label="Click sounds"
                    title="Click sounds"
                    onClick={() => setSfxOn(!sfxOn)}
                    className={cn(
                      "border border-outline-variant/50 px-2 py-1 font-label text-[8px] font-bold tracking-widest transition-colors md:px-2.5 md:text-[9px]",
                      sfxOn ? "border-primary-fixed text-primary-fixed" : "text-secondary opacity-60 hover:text-primary-fixed"
                    )}
                  >
                    SFX
                  </button>
                  {isPimlicoConfigured() ? (
                    gasless.status === "ready" ? (
                      <button
                        type="button"
                        onClick={() => {
                          gasless.clear();
                          toast.message("Gasless session cleared");
                        }}
                        className="border border-outline-variant/60 px-2 py-1 font-label text-[8px] uppercase tracking-widest text-secondary hover:border-primary-fixed hover:text-primary-fixed md:px-2.5 md:text-[9px]"
                      >
                        Gasless off
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={!isConnected || wrongChain || !walletClient || gasless.status === "enabling"}
                        onClick={() => setGaslessDialogOpen(true)}
                        className="border border-primary-fixed/40 bg-primary-fixed/10 px-2 py-1 font-label text-[8px] uppercase tracking-widest text-primary-fixed hover:bg-primary-fixed/20 disabled:opacity-40 md:px-2.5 md:text-[9px]"
                      >
                        Gasless
                      </button>
                    )
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}

          <div className="relative z-20 flex min-w-0 shrink-0 items-center justify-end gap-2 md:min-w-0">
            <button
              type="button"
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center border border-outline-variant/50 text-primary-fixed md:hidden"
              aria-label="Open menu"
              onClick={() => setMobileMenuOpen(true)}
            >
              <span className="material-symbols-outlined text-xl">menu</span>
            </button>
            {isConnected && address ? (
              <>
                <div className="relative" ref={walletAccountRef}>
                  <button
                    type="button"
                    aria-expanded={walletAccountOpen ? true : false}
                    aria-haspopup="dialog"
                    aria-label="Account and holdings"
                    onClick={() => setWalletAccountOpen((o) => !o)}
                    className="max-w-[11rem] truncate bg-primary-container px-2 py-1.5 font-headline text-[10px] font-bold tracking-widest text-on-primary-fixed transition-all hover:brightness-110 active:scale-95 sm:max-w-[13rem] sm:px-3 md:max-w-[14rem] md:px-4 md:text-xs"
                  >
                    {address.slice(0, 6)}…{address.slice(-4)}
                  </button>
                  {walletAccountOpen ? (
                    <div
                      className="absolute right-0 z-[60] mt-1 w-[min(calc(100vw-1rem),17.5rem)] rounded border border-outline-variant/40 bg-surface-container-highest p-3 shadow-[0_8px_32px_rgba(0,0,0,0.45)]"
                      role="dialog"
                      aria-modal="false"
                      aria-label="Account and holdings"
                    >
                      <p className="border-b border-outline-variant/30 pb-2 font-label text-[9px] uppercase tracking-[0.2em] text-primary-fixed">
                        Account
                      </p>
                      {wrongChain ? (
                        <p className="mt-2 font-body text-[10px] text-amber-200/95">Wrong network — switch to play.</p>
                      ) : null}
                      <dl className="mt-2 space-y-2 font-mono text-[11px] normal-case leading-snug text-on-surface/95">
                        <div className="flex justify-between gap-2">
                          <dt className="text-secondary">Credits</dt>
                          <dd className="text-right tabular-nums text-primary-fixed">
                            {clickCostCredits === undefined
                              ? "—"
                              : unlimitedClicks
                                ? "∞"
                                : formatWholeCredits(playsRemainingBig)}
                          </dd>
                        </div>
                        <div className="flex justify-between gap-2">
                          <dt className="text-secondary">Unvested</dt>
                          <dd className="text-right tabular-nums">{vestingDisplay.unvested.headline}</dd>
                        </div>
                        <div className="flex justify-between gap-2">
                          <dt className="text-secondary">Claimable</dt>
                          <dd className="text-right tabular-nums text-primary-fixed/90">{vestingDisplay.claimable.headline}</dd>
                        </div>
                        <div className="flex justify-between gap-2">
                          <dt className="text-secondary">ETH</dt>
                          <dd className="text-right tabular-nums">
                            {wrongChain
                              ? "—"
                              : walletEthBalance
                                ? Number(formatEther(walletEthBalance.value)).toLocaleString(undefined, {
                                    maximumFractionDigits: 6,
                                  })
                                : "—"}{" "}
                            <span className="text-[10px] text-secondary">{clickmintChainLabel()}</span>
                          </dd>
                        </div>
                      </dl>
                      <p className="mt-2 break-all font-mono text-[9px] text-secondary opacity-90" title={address}>
                        {address.slice(0, 10)}…{address.slice(-8)}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2 border-t border-outline-variant/25 pt-3">
                        <button
                          type="button"
                          className="font-label text-[9px] uppercase tracking-wider text-primary-fixed underline-offset-2 hover:underline"
                          onClick={() => {
                            void (async () => {
                              const ok = await copyTextToClipboard(address);
                              if (ok) toast.message("Address copied");
                              else toast.error("Copy failed");
                            })();
                          }}
                        >
                          Copy
                        </button>
                        <a
                          href={addressExplorerUrl(address)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-label text-[9px] uppercase tracking-wider text-primary-fixed underline-offset-2 hover:underline"
                        >
                          Explorer
                        </a>
                        <button
                          type="button"
                          className="ml-auto font-label text-[9px] uppercase tracking-wider text-secondary underline-offset-2 hover:text-amber-200 hover:underline"
                          onClick={() => {
                            setWalletAccountOpen(false);
                            disconnect();
                          }}
                        >
                          Disconnect
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
                {wrongChain && (
                  <button
                    type="button"
                    disabled={switchPending}
                    onClick={() => switchChain({ chainId: clickmintChainId() })}
                    className="hidden font-label text-[9px] uppercase tracking-widest text-primary-fixed underline sm:inline"
                  >
                    Switch network
                  </button>
                )}
              </>
            ) : (
              <button
                type="button"
                disabled={connectPending}
                onClick={() => setWalletOpen(true)}
                className="bg-primary-container px-3 py-1.5 font-headline text-[11px] font-bold tracking-widest text-on-primary-fixed transition-all hover:brightness-110 active:scale-95 md:px-6 md:text-xs"
              >
                Connect
              </button>
            )}
          </div>
        </div>

        {isConnected ? (
          <div className="border-t border-outline-variant/20 bg-surface/95 px-2 py-1 sm:px-4 sm:py-1.5">
            <div className="mx-auto flex max-w-6xl flex-col gap-0.5">
              <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 sm:gap-x-5 md:justify-between">
                <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4">
                  <div
                    className="text-center"
                    title={
                      clickCostCredits === undefined
                        ? "Loading credit balance from chain."
                        : unlimitedClicks
                          ? "Unlimited plays when per-click credit cost is zero or not enforced."
                          : "Remaining full clicks at current clickCostCredits. Add ETH via Add credits (bookkeeping credits, not the $CLICK token)."
                    }
                  >
                    <p className="mb-0 font-label text-[7px] uppercase tracking-widest text-secondary md:text-[8px]">
                      Credits
                    </p>
                    <p className="font-headline text-base font-black tabular-nums text-white md:text-lg">
                      {clickCostCredits === undefined ? "—" : unlimitedClicks ? "∞" : formatWholeCredits(playsRemainingBig)}
                    </p>
                  </div>
                  <div className="hidden h-7 w-px bg-outline-variant/30 sm:block" aria-hidden />
                  <div
                    className="text-center"
                    title={`${vestingDisplay.unvested.caption} On-chain pendingVested = unvested in the vesting vault (early-claim cap).`}
                  >
                    <p className="mb-0 font-label text-[7px] uppercase tracking-widest text-secondary md:text-[8px]">
                      Unvested
                    </p>
                    <p className="font-headline text-base font-black tabular-nums text-primary-fixed text-glow md:text-lg">
                      {vestingDisplay.unvested.headline}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <button
                    type="button"
                    className="shrink-0 border border-outline-variant/40 px-2 py-1 font-label text-[8px] uppercase tracking-wider text-primary-fixed/90 hover:bg-surface-container-low disabled:opacity-30 md:text-[9px]"
                    disabled={!canAct}
                    title={vestingDisplay.claimable.caption}
                    onClick={() => void onClaim()}
                  >
                    Claim vested
                  </button>
                  <div className="flex items-center gap-1 border border-outline-variant/25 bg-surface-container-low/40 px-1 py-0.5 sm:gap-1.5 sm:px-1.5">
                    <input
                      value={earlyAmt}
                      onChange={(e) => setEarlyAmt(e.target.value)}
                      className="w-11 border-b border-outline-variant/50 bg-transparent py-0.5 text-center font-mono text-[10px] text-primary-fixed focus:border-primary-fixed focus:outline-none sm:w-12 md:text-[11px]"
                      placeholder="0"
                      title="Amount of unvested $CLICK to exit early (≤ Unvested). Hover the box for 30/30/20/20 split details."
                      aria-label="Early claim amount"
                    />
                    <button
                      type="button"
                      disabled={!canAct || unvestedCap === 0n}
                      onClick={() => setEarlyAmt(formatEther(unvestedCap))}
                      className="font-label text-[8px] font-bold uppercase text-secondary hover:text-primary-fixed disabled:opacity-30"
                    >
                      Max
                    </button>
                    <button
                      type="button"
                      disabled={!canAct}
                      title={earlyClaimHoverSummary}
                      onClick={() => void onEarlySpend()}
                      className="font-label text-[8px] font-bold uppercase tracking-wide text-primary-fixed hover:text-white disabled:opacity-30 md:text-[9px]"
                    >
                      Early
                    </button>
                    <button
                      type="button"
                      aria-label="Early vs vested explainer"
                      title="Open full early vs vested explainer"
                      onClick={() => setEarlyClaimInfoOpen(true)}
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-outline-variant/50 font-mono text-[10px] leading-none text-primary-fixed hover:bg-surface-container"
                    >
                      ?
                    </button>
                  </div>
                </div>
              </div>
              {canAct && !parsedEarlySpend.ok ? (
                <p className="text-center font-body text-[9px] text-amber-200/90">Invalid amount — use a decimal $CLICK amount.</p>
              ) : null}
              {canAct && parsedEarlySpend.ok && earlySpendWei > unvestedCap && unvestedCap > 0n ? (
                <p className="text-center font-body text-[9px] text-amber-200/90">
                  Over unvested ({formatClickDisplayWei(unvestedCap)} max).
                </p>
              ) : null}
              {canAct && unvestedCap === 0n ? (
                <p
                  className="text-center font-body text-[9px] text-secondary/80"
                  title="Early claim applies the 30/30/20/20 split on unvested balance only. With 0 unvested the transaction reverts (wallet may say User rejected)."
                >
                  No unvested — early claim reverts.
                </p>
              ) : null}
            </div>
          </div>
        ) : null}

        <nav
          className="hidden border-t border-outline-variant/25 bg-surface-container-lowest/95 md:block md:pl-72"
          aria-label="Sections"
        >
          <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-center gap-1 px-4 py-2 font-label text-[10px] uppercase tracking-[0.12em] lg:justify-start">
            <button
              type="button"
              onClick={() => setMobileTab("terminal")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1.5 transition-colors hover:bg-surface-container-low hover:text-white",
                mobileTab === "terminal" ? "bg-surface-container-low text-primary-fixed" : "text-secondary"
              )}
            >
              <Icon name="terminal" className="text-sm" />
              Terminal
            </button>
            <button
              type="button"
              onClick={() => setMobileTab("clicks")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1.5 transition-colors hover:bg-surface-container-low hover:text-white",
                mobileTab === "clicks" ? "bg-surface-container-low text-primary-fixed" : "text-secondary"
              )}
            >
              <Icon name="touch_app" className="text-sm" />
              Click history
            </button>
            <button
              type="button"
              onClick={() => setMobileTab("history")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1.5 transition-colors hover:bg-surface-container-low hover:text-white",
                mobileTab === "history" ? "bg-surface-container-low text-primary-fixed" : "text-secondary"
              )}
            >
              <Icon name="military_tech" className="text-sm" />
              Pot history
            </button>
            <button
              type="button"
              onClick={() => setMobileTab("trophies")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1.5 transition-colors hover:bg-surface-container-low hover:text-white",
                mobileTab === "trophies" ? "bg-surface-container-low text-primary-fixed" : "text-secondary"
              )}
            >
              <Icon name="workspace_premium" className="text-sm" />
              Trophy room
            </button>
            <Link
              href="/documentation"
              className="inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1.5 text-secondary transition-colors hover:bg-surface-container-low hover:text-primary-fixed"
            >
              <Icon name="description" className="text-sm" />
              Documentation
            </Link>
          </div>
        </nav>

        <Dialog open={depositOpen} onOpenChange={setDepositOpen}>
          <DialogContent className="max-h-[min(90dvh,32rem)] overflow-y-auto sm:max-w-lg" aria-describedby="deposit-dialog-desc">
            <DialogHeader>
              <DialogTitle>Add click credits</DialogTitle>
              <DialogDescription id="deposit-dialog-desc" className="text-left font-body text-sm text-secondary">
                ETH → click credits (not $CLICK). Bonuses on larger deposits.
              </DialogDescription>
            </DialogHeader>
            {clickCostCredits !== undefined && clickCostCredits === 0n && (
              <p className="text-center font-body text-[11px] text-secondary opacity-80">Zero credits charged per click on this deployment.</p>
            )}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {QUICK_BUY.map((e) => {
                const depWei = parseEther(e);
                const bonusLine = depositBonusLabel(depWei);
                const credPreview =
                  clickCostCredits === undefined
                    ? undefined
                    : unlimitedClicks
                      ? creditsGrantedOnDeposit(depWei)
                      : clickCreditsFromDeposit(depWei, clickCostCredits);
                const creditLine =
                  credPreview === undefined
                    ? "…"
                    : unlimitedClicks
                      ? `${formatWholeCredits(credPreview)} to balance`
                      : tinyClickCost && credPreview > 500_000n
                        ? "Fix click cost*"
                        : `${formatWholeCredits(credPreview)} credits`;
                return (
                  <button
                    key={e}
                    type="button"
                    disabled={!canAct}
                    onClick={() => void onDeposit(e)}
                    className={cn(
                      "flex flex-col items-center justify-center border border-outline-variant/30 bg-surface-container py-3 font-label text-[11px] font-bold uppercase tracking-widest text-on-surface transition-colors md:text-xs",
                      "hover:border-primary-fixed/50 hover:text-primary-fixed active:scale-[0.98] disabled:opacity-30"
                    )}
                  >
                    <span>{e} ETH</span>
                    <span
                      className="mt-1 break-words px-0.5 text-center font-body text-[10px] font-medium normal-case tracking-normal text-primary-fixed/90 md:text-[11px]"
                      title={
                        tinyClickCost && credPreview !== undefined && credPreview > 500_000n
                          ? "Owner: setEconomy on game so clickCostCredits isn’t 1 wei."
                          : undefined
                      }
                    >
                      {creditLine}
                    </span>
                    {bonusLine ? (
                      <span className="mt-1 font-label text-[10px] font-bold uppercase tracking-wide text-secondary opacity-90 md:text-[11px]">
                        {bonusLine}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
            {tinyClickCost && (
              <p className="text-center font-body text-[10px] text-secondary opacity-80">
                *Credit count explodes when per-click cost is ~1 wei. Use repo{" "}
                <span className="font-mono text-primary-fixed/80">set-economy-round.ts</span>.
              </p>
            )}
            <p className="text-center font-body text-[10px] text-secondary opacity-90">
              Native ETH only — swap on {clickmintChainLabel()} first if needed.
            </p>
            <p className="text-center">
              <Link
                href="/documentation#click-credits"
                className="font-label text-[10px] uppercase tracking-widest text-primary-fixed/80 underline-offset-2 hover:underline"
              >
                How credits work
              </Link>
            </p>
          </DialogContent>
        </Dialog>

        <Dialog open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
          <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-md" aria-describedby="mobile-menu-desc">
            <DialogHeader>
              <DialogTitle>Menu</DialogTitle>
              <DialogDescription id="mobile-menu-desc" className="sr-only">
                Credits, audio, gasless, and documentation
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-3 font-headline uppercase tracking-widest">
              <p
                className="truncate font-label text-[9px] leading-tight text-secondary normal-case"
                title={`${economyPresetShortLabel()} — ${economyPresetHint()}`}
              >
                {economyPresetShortLabel()}
              </p>
              <button
                type="button"
                className="border border-primary-fixed/40 bg-primary-fixed/10 px-3 py-2 text-left text-[11px] text-primary-fixed"
                onClick={() => {
                  setMobileMenuOpen(false);
                  setDepositOpen(true);
                }}
              >
                + Add credits
              </button>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  aria-pressed={musicOn}
                  onClick={() => setMusicOn(!musicOn)}
                  className={cn(
                    "border border-outline-variant/50 px-3 py-2 text-[10px]",
                    musicOn ? "border-primary-fixed text-primary-fixed" : "text-secondary"
                  )}
                >
                  BGM {musicOn ? "on" : "off"}
                </button>
                <button
                  type="button"
                  aria-pressed={sfxOn}
                  onClick={() => setSfxOn(!sfxOn)}
                  className={cn(
                    "border border-outline-variant/50 px-3 py-2 text-[10px]",
                    sfxOn ? "border-primary-fixed text-primary-fixed" : "text-secondary"
                  )}
                >
                  SFX {sfxOn ? "on" : "off"}
                </button>
              </div>
              {isPimlicoConfigured() ? (
                <div className="border border-outline-variant/30 bg-surface-container-low/50 px-3 py-2">
                  <p className="mb-2 font-label text-[9px] text-secondary normal-case">
                    {gasless.status === "ready" ? "Gasless mode on" : "Gasless clicks"}
                  </p>
                  {gasless.status === "ready" ? (
                    <button
                      type="button"
                      onClick={() => {
                        gasless.clear();
                        toast.message("Gasless session cleared");
                        setMobileMenuOpen(false);
                      }}
                      className="border border-outline-variant/60 px-3 py-2 text-[10px] text-secondary"
                    >
                      Turn off gasless
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={!isConnected || wrongChain || !walletClient || gasless.status === "enabling"}
                      onClick={() => {
                        setMobileMenuOpen(false);
                        setGaslessDialogOpen(true);
                      }}
                      className="border border-primary-fixed/40 bg-primary-fixed/10 px-3 py-2 text-[10px] text-primary-fixed disabled:opacity-40"
                    >
                      Enable gasless
                    </button>
                  )}
                </div>
              ) : null}
              {wrongChain && (
                <button
                  type="button"
                  disabled={switchPending}
                  onClick={() => {
                    void switchChain({ chainId: clickmintChainId() });
                    setMobileMenuOpen(false);
                  }}
                  className="border border-amber-500/50 py-2 text-[11px] text-amber-200"
                >
                  Switch to {clickmintChainLabel()}
                </button>
              )}
              <Link
                href="/documentation"
                className="border border-outline-variant/40 py-2 text-center text-[11px] text-primary-fixed"
                onClick={() => setMobileMenuOpen(false)}
              >
                Documentation
              </Link>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={earlyClaimInfoOpen} onOpenChange={setEarlyClaimInfoOpen}>
          <DialogContent className="max-h-[min(90dvh,32rem)] overflow-y-auto border-outline-variant/40">
            <DialogHeader>
              <DialogTitle>Early claim</DialogTitle>
              <DialogDescription className="text-left text-secondary">
                Unvested exit ≠ time-unlocked claim.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 text-left font-body text-sm text-secondary">
              <p>
                <span className="font-semibold text-on-surface/95">Early</span> spends locked balance; protocol keeps a cut.{" "}
                <span className="font-semibold text-on-surface/95">Claim vested</span> only releases schedule-unlocked tokens.
              </p>
              <p>
                <Link href="/documentation#early-claim" className="text-primary-fixed underline-offset-2 hover:underline">
                  Full docs
                </Link>
              </p>
            </div>
          </DialogContent>
        </Dialog>
      </header>

      {/* Desktop sidebar — live feed + POT widgets (nav is in header) */}
      <aside className="fixed left-0 top-0 z-40 hidden h-full w-72 flex-col overflow-y-auto border-r border-outline-variant/30 bg-surface-container-lowest md:flex md:pt-44">
        <div className="space-y-4 px-4 pb-36 pt-5 md:pb-44">
          <div className="mx-auto w-full max-w-[17rem]">{resetTimerStrip}</div>
          <div className="mx-auto flex w-full max-w-[17rem] justify-center">{minutePotCard}</div>
          <div className="mx-auto flex w-full max-w-[17rem] justify-center">
            <BlockBetSidebarCard blockBet={blockBet} wrongChain={wrongChain} canAct={canAct} />
          </div>
          <div className="border-t border-outline-variant/20 pt-4">
            <ClickHistoryPanel
              gameAddr={gameAddr}
              compact
              genesisGameHour={genesisGameHour}
              liveFeedMax={5}
            />
          </div>
          <SidebarPotWinners rows={potRows} genesisGameHour={genesisGameHour} />
          <SidebarRecentTrophies trophyAddr={trophyAddr} rows={trophyMintHistory} max={5} />
        </div>
      </aside>

      {/* Main */}
      <main
        className={cn(
          "relative z-10 mx-auto flex max-w-4xl flex-col items-center px-4 pb-24 pt-36 md:ml-72 md:mr-0 md:pb-16 md:pt-44",
          mobileTab === "terminal" ? "space-y-4 md:space-y-5" : "space-y-8 md:space-y-6"
        )}
      >
        {mobileTab === "terminal" && terminalBody}

        {mobileTab === "history" && (
          <section className="mx-auto w-full max-w-2xl px-1 pt-4">
            <h2 className="mb-5 text-center font-headline text-xl font-bold uppercase tracking-[0.18em] text-primary-fixed sm:text-2xl">
              POT history
            </h2>
            <WinnerTable rows={potRows} genesisGameHour={genesisGameHour} />
          </section>
        )}

        {mobileTab === "trophies" && (
          <section className="w-full max-w-lg pt-4">
            <h2 className="mb-4 font-headline text-xs font-bold uppercase tracking-[0.2em] text-primary-fixed">
              Trophy room
            </h2>
            <p className="mb-3 font-body text-[10px] text-secondary opacity-80">
              Lucky-click NFTs.{" "}
              <Link href="/documentation#trophies" className="text-primary-fixed underline-offset-2 hover:underline">
                Docs
              </Link>
            </p>
            <TrophyRoomGrid trophyAddr={trophyAddr} rows={trophyMintHistory} />
          </section>
        )}

        {mobileTab === "clicks" && <ClickHistoryPanel gameAddr={gameAddr} genesisGameHour={genesisGameHour} />}
      </main>

      {/* Desktop footer */}
      <footer className="pointer-events-none fixed bottom-0 left-0 z-50 hidden w-full items-end justify-between bg-gradient-to-t from-black/80 to-transparent px-8 py-6 md:flex">
        <div className="pointer-events-auto font-body text-[11px] uppercase tracking-widest text-secondary opacity-55">
          ©2026 CLICKMINT // SYSTEM_READY
        </div>
        <div className="pointer-events-auto flex gap-6">
          {["Terms", "Privacy", "Twitter"].map((l) => (
            <a
              key={l}
              href="#"
              className="font-body text-[11px] uppercase tracking-widest text-secondary opacity-45 transition-all hover:text-primary-fixed hover:opacity-100"
            >
              {l}
            </a>
          ))}
        </div>
      </footer>

      {/* Mobile bottom nav */}
      <nav className="fixed bottom-0 left-0 z-50 grid h-[3.75rem] w-full max-w-[100vw] grid-cols-4 items-stretch border-t border-outline-variant/30 bg-surface pb-[max(0.25rem,env(safe-area-inset-bottom))] pt-0.5 shadow-[0_-4px_20px_rgba(0,251,251,0.05)] md:hidden">
        <button
          type="button"
          onClick={() => setMobileTab("terminal")}
          className={cn(
            "flex min-w-0 flex-col items-center justify-center gap-0.5 px-0.5 font-headline text-[9px] font-bold uppercase tracking-[0.12em] transition-colors sm:text-[10px]",
            mobileTab === "terminal"
              ? "border-t-2 border-primary-fixed text-primary-fixed"
              : "text-secondary opacity-50"
          )}
        >
          <Icon name="terminal" className="!text-lg" />
          Term
        </button>
        <button
          type="button"
          onClick={() => setMobileTab("clicks")}
          className={cn(
            "flex min-w-0 flex-col items-center justify-center gap-0.5 px-0.5 font-headline text-[9px] font-bold uppercase tracking-[0.12em] transition-colors sm:text-[10px]",
            mobileTab === "clicks" ? "border-t-2 border-primary-fixed text-primary-fixed" : "text-secondary opacity-50"
          )}
        >
          <Icon name="touch_app" className="!text-lg" />
          Clicks
        </button>
        <button
          type="button"
          onClick={() => setMobileTab("history")}
          className={cn(
            "flex min-w-0 flex-col items-center justify-center gap-0.5 px-0.5 font-headline text-[9px] font-bold uppercase tracking-[0.12em] transition-colors sm:text-[10px]",
            mobileTab === "history" ? "border-t-2 border-primary-fixed text-primary-fixed" : "text-secondary opacity-50"
          )}
        >
          <Icon name="military_tech" className="!text-lg" />
          POT
        </button>
        <button
          type="button"
          onClick={() => setMobileTab("trophies")}
          className={cn(
            "flex min-w-0 flex-col items-center justify-center gap-0.5 px-0.5 font-headline text-[9px] font-bold uppercase tracking-[0.12em] transition-colors sm:text-[10px]",
            mobileTab === "trophies" ? "border-t-2 border-primary-fixed text-primary-fixed" : "text-secondary opacity-50"
          )}
        >
          <Icon name="emoji_events" className="!text-lg" />
          Trophy
        </button>
      </nav>

      {/* Mobile scanline hint */}
      <div className="pointer-events-none fixed inset-0 z-[100] opacity-[0.02] md:hidden bg-[repeating-linear-gradient(0deg,transparent,transparent_2px,rgba(0,251,251,0.03)_2px,rgba(0,251,251,0.03)_4px)]" />

      <WalletPickerDialog open={walletOpen} onOpenChange={setWalletOpen} />
      <GaslessSessionDialog
        open={gaslessDialogOpen}
        onOpenChange={setGaslessDialogOpen}
        smartAccountAddress={gasless.smartAccountAddress}
        status={
          gasless.status === "enabling"
            ? "enabling"
            : gasless.status === "error"
              ? "error"
              : "idle"
        }
        errorMessage={gasless.errorMessage}
        confirmingDisabled={!walletClient || wrongChain}
        onConfirm={() => {
          if (walletClient) void gasless.enable(walletClient);
        }}
      />
    </div>
  );
}
