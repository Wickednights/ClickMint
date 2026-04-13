"use client";

import type { CSSProperties } from "react";
import Link from "next/link";
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
  formatWholeCredits,
  isTinyClickCostWei,
  onChainPlaysRemaining,
  vestingVaultDisplay,
} from "@/lib/game-display";
import { baseSepolia } from "wagmi/chains";
import { formatEther, parseEther, type Address } from "viem";
import { toast } from "sonner";
import { binaryTrophyAbi, clickMintGameAbi, clickTokenAbi } from "@/lib/abi";
import { explainRevertData, extractRevertData } from "@/lib/revert-reason";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { ClickHistoryPanel } from "@/components/click-history-panel";
import { SidebarRecentTrophies, TrophyRoomGrid } from "@/components/trophy-room-panel";
import { EscrowPanel } from "@/components/escrow-panel";
import { getClickAddress, getEscrowAddress, getGameAddress, getTrophyNftAddress } from "@/lib/addresses";
import { economyPresetHint, economyPresetShortLabel } from "@/lib/economy-preset";
import { useClickMintAudio } from "@/hooks/use-clickmint-audio";
import {
  gameHourIndexFromUnixSec,
  hourIdForDisplay,
  potRoundKind,
  readGenesisGameHourFromEnv,
  GAME_RESET_BUFFER_SEC,
} from "@/lib/game-genesis";
import { fetchTrophyMintLogs, trophyHistoryFromBlock } from "@/lib/trophy-mints";

const QUICK_BUY = ["0.001", "0.01", "0.1", "0.25", "0.5", "1"] as const;

/** Pot bar fills to 100% at this on-chain pot size (display only; tune for your campaign). */
const POT_BAR_DISPLAY_MAX = parseEther("0.05");

/** Accent for round # and Add credits (neon magenta). */
const NEON_MAGENTA_TEXT = "text-[#ff2ee8] drop-shadow-[0_0_12px_rgba(255,46,232,0.55)]";
const NEON_MAGENTA_BTN =
  "border-2 border-[#ff2ee8]/75 bg-[#ff2ee8]/10 text-[#ff2ee8] shadow-[0_0_14px_rgba(255,46,232,0.35)] hover:bg-[#ff2ee8]/18";

const ZERO_ADDR = "0x0000000000000000000000000000000000000000" as const;

/** UTC minute-of-hour 0..59 (same as on-chain `_minuteInUtcHour`). */
function minuteInHourFromUnix(sec: number): number {
  return Math.floor((sec % 3600) / 60);
}

/** Winning POT span after finalize: `startMinute` is 0..44; span is 15 consecutive UTC minutes. */
function utcPotSpanLabel(startMinute: number): string {
  if (startMinute < 0 || startMinute > 44) return "—";
  const endMinute = startMinute + 14;
  return `:${String(startMinute).padStart(2, "0")}–:${String(endMinute).padStart(2, "0")} UTC`;
}

function formatEpochLocalShort(epochSec: number): string {
  return new Date(epochSec * 1000).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatCountdown(totalSec: number): string {
  if (totalSec <= 0) return "0:00";
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

type PotRow = {
  hourId: bigint;
  winner: Address;
  payout: bigint;
  /** Start UTC minute 0–44 of the winning 15-minute span. */
  winStartMinute: number;
  entropy?: `0x${string}`;
};

type MobileTab = "terminal" | "history" | "trophies" | "clicks";

function Icon({ name, className }: { name: string; className?: string }) {
  return (
    <span className={cn("material-symbols-outlined text-lg", className)} aria-hidden>
      {name}
    </span>
  );
}

function WinnerTable({ rows, genesisGameHour }: { rows: PotRow[]; genesisGameHour: bigint | null }) {
  if (rows.length === 0) {
    return (
      <p className="text-center font-body text-sm leading-relaxed text-secondary opacity-80 md:text-base">
        No POT wins in this session yet. Keep the tab open to catch live events, or finalize an hour on-chain.
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
              <th className="w-[18%] px-2 py-3 text-right tabular-nums">$CLICK</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.hourId}-${r.entropy ?? ""}`} className="border-t border-outline-variant/20">
                <td className="px-2 py-3 pr-2 font-headline text-primary-fixed tabular-nums">
                  {hourIdForDisplay(r.hourId, genesisGameHour)}
                </td>
                <td className="px-2 py-3 pr-2 font-mono text-xs text-secondary md:text-sm">
                  {utcPotSpanLabel(Number(r.winStartMinute))}
                </td>
                <td className="truncate px-2 py-3 pr-2 font-mono text-xs md:text-sm" title={r.winner}>
                  {r.winner}
                </td>
                <td className="px-2 py-3 text-right font-headline font-semibold tabular-nums text-primary">
                  {formatClickDisplayWei(r.payout, 6)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-center font-body text-xs text-secondary opacity-75 md:text-sm">
        Amounts match on-chain <code className="text-primary-fixed/90">PotWin.clickPayout</code>. Small hourly pots pay
        fewer $CLICK (ETH in pot × click-per-ETH rate).
      </p>
    </div>
  );
}

/** Desktop sidebar: last 5 POT wins (same live session state as full POT history). */
function SidebarPotWinners({ rows, genesisGameHour }: { rows: PotRow[]; genesisGameHour: bigint | null }) {
  const shown = rows.slice(0, 5);
  const rk = potRoundKind(genesisGameHour);
  return (
    <div className="border-t border-outline-variant/20 pt-4">
      <h3 className="mb-3 text-center font-headline text-sm font-bold uppercase tracking-[0.2em] text-emerald-300/90">
        POT winners
      </h3>
      {shown.length === 0 ? (
        <p className="text-center font-body text-sm leading-snug text-secondary">
          No POT wins yet — finalize hours and watch live.
        </p>
      ) : (
        <ul className="space-y-2.5">
          {shown.map((r) => (
            <li
              key={`${r.hourId}-${r.entropy ?? ""}`}
              className="rounded border border-emerald-500/25 bg-emerald-500/[0.07] px-3 py-2.5 text-center"
            >
              <div className="font-label text-xs uppercase tracking-wider text-secondary">
                {rk} {hourIdForDisplay(r.hourId, genesisGameHour)}
              </div>
              <div className="mt-1 truncate font-mono text-sm text-primary-fixed" title={r.winner}>
                {r.winner.slice(0, 6)}…{r.winner.slice(-4)}
              </div>
              <div className="mt-1 font-headline text-base font-bold tabular-nums text-emerald-200/95">
                +{formatClickDisplayWei(r.payout, 6)} $CLICK
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
  const escrowAddr = getEscrowAddress();

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

  const { address, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient({ chainId: baseSepolia.id });
  const gasless = useGaslessClickSession(gameAddr);
  /** All ClickMint game balance / POT / vesting use the connected EOA; gasless uses a smart account only as tx executor. */
  const playerAddress = address;

  const [gaslessDialogOpen, setGaslessDialogOpen] = useState(false);
  const [gaslessActionPending, setGaslessActionPending] = useState(false);

  const chainId = useChainId();
  const { isPending: connectPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, switchChainAsync, isPending: switchPending } = useSwitchChain();

  const [walletOpen, setWalletOpen] = useState(false);

  const { writeContractAsync, isPending: writePending } = useWriteContract();
  const publicClient = usePublicClient({ chainId: baseSepolia.id });
  const queryClient = useQueryClient();

  /** First `gameHour` bucket after deploy — from `NEXT_PUBLIC_GAME_GENESIS_UNIX` or `NEXT_PUBLIC_GAME_DEPLOY_BLOCK`. */
  const [genesisGameHour, setGenesisGameHour] = useState<bigint | null>(() => readGenesisGameHourFromEnv());

  useEffect(() => {
    const blockStr = typeof process !== "undefined" ? process.env.NEXT_PUBLIC_GAME_DEPLOY_BLOCK?.trim() : undefined;
    if (!blockStr || !publicClient) return;
    if (!/^\d+$/.test(blockStr)) return;
    const blockNumber = BigInt(blockStr);
    let cancelled = false;
    void publicClient
      .getBlock({ blockNumber })
      .then((b) => {
        if (!cancelled) setGenesisGameHour(gameHourIndexFromUnixSec(Number(b.timestamp)));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [publicClient]);

  /** One wall-clock second bucket for reads + countdowns — avoids refetch thrash from `Date.now()` on unrelated renders. */
  const [tickSec, setTickSec] = useState(() => Math.floor(Date.now() / 1000));
  /**
   * Stable timestamp for `gameHour(ts)` reads: same on-chain hour for every second inside that hour.
   * Must mirror `ClickMintGame.gameHour`: `(ts - RESET_BUFFER) / 3600` (not raw UTC hour start).
   */
  const gameHourReadTs = useMemo(() => {
    if (tickSec <= GAME_RESET_BUFFER_SEC) return BigInt(GAME_RESET_BUFFER_SEC + 1);
    const h = Math.floor((tickSec - GAME_RESET_BUFFER_SEC) / 3600);
    return BigInt(GAME_RESET_BUFFER_SEC + h * 3600 + 1);
  }, [tickSec]);
  const { data: gameHourNow } = useReadContract({
    address: gameAddr,
    abi: clickMintGameAbi,
    functionName: "gameHour",
    args: [gameHourReadTs],
    query: { enabled: !!gameAddr, placeholderData: keepPreviousData },
  });

  const { data: totalClicksThisHour } = useReadContract({
    address: gameAddr,
    abi: clickMintGameAbi,
    functionName: "totalClicksInHour",
    args: gameHourNow !== undefined ? [gameHourNow] : undefined,
    query: {
      enabled: !!gameAddr && gameHourNow !== undefined,
      refetchInterval: 4_000,
    },
  });

  /** 1-based round counter since contract deploy (requires genesis env). */
  const roundsSinceLaunch = useMemo(() => {
    if (gameHourNow === undefined || genesisGameHour === null) return undefined;
    return gameHourNow >= genesisGameHour ? gameHourNow - genesisGameHour + 1n : 1n;
  }, [gameHourNow, genesisGameHour]);

  const prevHour = useMemo(() => {
    if (gameHourNow === undefined || gameHourNow === 0n) return undefined;
    return gameHourNow - 1n;
  }, [gameHourNow]);

  const { data: prevFinalized } = useReadContract({
    address: gameAddr,
    abi: clickMintGameAbi,
    functionName: "hourFinalized",
    args: prevHour !== undefined ? [prevHour] : undefined,
    query: { enabled: !!gameAddr && prevHour !== undefined },
  });

  const { data: prevHourWinWindow } = useReadContract({
    address: gameAddr,
    abi: clickMintGameAbi,
    functionName: "hourWinWindow",
    args: prevHour !== undefined ? [prevHour] : undefined,
    query: { enabled: !!gameAddr && prevHour !== undefined && !!prevFinalized },
  });

  useEffect(() => {
    const id = setInterval(() => setTickSec(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(id);
  }, []);

  const potClock = useMemo(() => {
    const now = tickSec;
    if (gameHourNow === undefined) return null;
    const nextBoundary = (gameHourNow + 1n) * 3600n + BigInt(GAME_RESET_BUFFER_SEC);
    const secToHourEnd = Math.max(0, Number(nextBoundary - BigInt(now)));

    let secUntilFinalizeGate: number | null = null;
    if (gameHourNow > 0n) {
      const gate = gameHourNow * 3600n + BigInt(GAME_RESET_BUFFER_SEC);
      secUntilFinalizeGate = now >= Number(gate) ? 0 : Number(gate - BigInt(now));
    }

    return {
      secToHourEnd,
      secUntilFinalizeGate,
      currentMinuteUtc: minuteInHourFromUnix(now),
      gameHourId: gameHourNow,
      nextBoundaryEpochSec: Number(nextBoundary),
    };
  }, [gameHourNow, tickSec]);

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

  const [potRows, setPotRows] = useState<PotRow[]>([]);
  const [earlyAmt, setEarlyAmt] = useState("");
  const [mobileTab, setMobileTab] = useState<MobileTab>("terminal");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [earlyClaimInfoOpen, setEarlyClaimInfoOpen] = useState(false);
  const [depositOpen, setDepositOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [heroClickFlash, setHeroClickFlash] = useState(false);
  const heroClickFlashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastClientClick = useRef(0);
  const [cooldownMs, setCooldownMs] = useState(0);

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

  const pushPotRow = useCallback((row: PotRow) => {
    setPotRows((r) => [row, ...r].slice(0, 48));
  }, []);

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
      for (const log of logs) {
        const args = log.args as unknown as {
          hourId: bigint;
          winner: Address;
          clickPayout: bigint;
          winStartMinute: number;
          entropy: `0x${string}`;
        };
        if (!args?.winner || args.winner === ZERO_ADDR) {
          toast.message("POT — no eligible winner; carry forward.");
          void refetchPot();
          continue;
        }
        pushPotRow({
          hourId: args.hourId,
          winner: args.winner,
          payout: args.clickPayout,
          winStartMinute: args.winStartMinute,
          entropy: args.entropy,
        });
        sfxRef.current.playWin();
        sfxRef.current.celebrateWin();
        toast.success("POT WIN", {
          description: `${args.winner.slice(0, 10)}… +${formatClickDisplayWei(args.clickPayout, 6)} $CLICK`,
          duration: 8000,
        });
        void refetchPot();
      }
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
      for (const log of logs) {
        const args = log.args as unknown as { from?: Address; to?: Address; tokenId?: bigint };
        const from = args?.from;
        const to = args?.to;
        const tokenId = args?.tokenId;
        if (!from || !to || tokenId === undefined) continue;
        if (from.toLowerCase() !== ZERO_ADDR.toLowerCase()) continue;
        void queryClient.invalidateQueries({ queryKey: ["trophyMints", trophyAddr] });
        if (address && to.toLowerCase() === address.toLowerCase()) {
          sfxRef.current.playNft();
          toast.success("Trophy NFT received", {
            description: `Token #${tokenId.toString()}`,
            duration: 6000,
          });
        }
      }
    },
    enabled: !!trophyAddr,
  });

  const wrongChain = isConnected && chainId !== baseSepolia.id;

  const onDeposit = async (eth: string) => {
    if (!gameAddr || !address || !publicClient) return;
    if (wrongChain) {
      try {
        await switchChainAsync({ chainId: baseSepolia.id });
      } catch {
        toast.error("Switch to Base Sepolia", {
          description: "Deposits must be signed on chain 84532. Choose Base Sepolia in your wallet, then try again.",
        });
        return;
      }
    }
    const valueWei = parseEther(eth);

    try {
      const hash = await writeContractAsync({
        chainId: baseSepolia.id,
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
        msg = `${msg.slice(0, 160)} — Use Base Sepolia (84532). If your wallet shows Sepolia but errors persist, set the RPC to https://sepolia.base.org (some custom RPCs confuse the signer).`;
      }
      console.error("deposit() failed", e);
      toast.error("Deposit failed", { description: msg.slice(0, 320) });
    }
  };

  const onClick = async () => {
    if (!gameAddr || !address) return;
    if (wrongChain) {
      try {
        await switchChainAsync({ chainId: baseSepolia.id });
      } catch {
        toast.error("Switch to Base Sepolia in your wallet, then tap CLICK again.");
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
    if (now - lastClientClick.current < 500) {
      setCooldownMs(500 - (now - lastClientClick.current));
      sfxRef.current.playError();
      toast.message("Cooldown");
      return;
    }
    lastClientClick.current = now;
    try {
      if (!publicClient) throw new Error("No RPC client for Base Sepolia");

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
      const hash = await writeContractAsync({
        ...request,
        chainId: baseSepolia.id,
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
      const msg = data ? explainRevertData(data) : (e as Error).message;
      console.error("click() failed", { error: e, revertData: data, explained: msg });
      toast.error("Click failed", { description: msg.slice(0, 280), duration: 12_000 });
    }
  };

  const onClaim = async () => {
    if (!clickAddr || wrongChain || !publicClient) return;
    try {
      const hash = await writeContractAsync({
        chainId: baseSepolia.id,
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
        chainId: baseSepolia.id,
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
    if (!gameAddr || wrongChain || prevHour === undefined) return;
    try {
      await writeContractAsync({
        chainId: baseSepolia.id,
        address: gameAddr,
        abi: clickMintGameAbi,
        functionName: "finalizeHour",
        args: [prevHour],
      });
      toast.message(
        `Finalize ${potRoundKind(genesisGameHour)} ${hourIdForDisplay(prevHour, genesisGameHour)} sent`
      );
    } catch (e) {
      sfxRef.current.playError();
      const data = extractRevertData(e);
      const msg = data ? explainRevertData(data) : (e as Error).message;
      console.error("finalizeHour() failed", e);
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

  const canAct = isConnected && !wrongChain && !writePending && !gaslessActionPending;
  /** Allow CLICK on wrong chain so the handler can prompt a network switch. */
  const canSendClick =
    isConnected && !writePending && !gaslessActionPending && !gameLinkPending && gameLinkOk;

  const hourlyPotCard = (
    <div className="w-full max-w-[17rem] space-y-2 rounded border border-outline-variant/25 bg-surface-container-low/50 px-3 py-2.5 text-center shadow-sm shadow-black/20">
      <p className="font-label text-[10px] uppercase tracking-[0.2em] text-primary-fixed/90 md:text-[11px]">Hourly POT</p>
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
      <p className="font-body text-[11px] leading-snug text-secondary opacity-90 md:text-xs">
        {minPotClicks !== undefined ? (
          <>
            Qualify: ≥{minPotClicks.toString()} clicks/hr + overlap with winning 15-min span.{" "}
          </>
        ) : null}
        <Link href="/documentation#pot" className="text-primary-fixed/90 underline-offset-2 hover:underline">
          Rules
        </Link>
      </p>
      <button
        type="button"
        disabled={!canAct || prevHour === undefined || !!prevFinalized}
        onClick={() => void onFinalize()}
        className="w-full rounded border border-primary-fixed/40 bg-primary-fixed/10 py-2.5 font-label text-[11px] font-semibold uppercase tracking-widest text-primary-fixed shadow-[0_0_12px_rgba(0,251,251,0.12)] transition-colors hover:bg-primary-fixed/20 disabled:opacity-25 md:text-xs"
      >
        Finalize hour / settle round
      </button>
    </div>
  );

  const resetTimerStrip =
    potClock !== null ? (
      <div className="w-full max-w-lg rounded border border-outline-variant/20 bg-surface-container-low/30 px-3 py-2.5 text-center font-body text-[12px] leading-snug text-secondary md:text-sm">
        <p className="font-headline text-sm font-bold tabular-nums text-white md:text-base">
          Next reset <span className="text-primary-fixed">{formatCountdown(potClock.secToHourEnd)}</span>
        </p>
        <p className="mt-1 text-[11px] text-on-surface/80 md:text-xs">
          ~{formatEpochLocalShort(potClock.nextBoundaryEpochSec)} your time
        </p>
        <p className="mt-2 text-[12px] font-semibold text-primary-fixed md:text-sm">
          :{String(potClock.currentMinuteUtc).padStart(2, "0")} UTC
          <span className="mx-1.5 font-normal text-outline-variant">·</span>
          <span className="font-normal text-on-surface/85">
            {new Date(tickSec * 1000).toLocaleTimeString(undefined, {
              hour: "numeric",
              minute: "2-digit",
              second: "2-digit",
            })}{" "}
            local
          </span>
        </p>
        {prevHour !== undefined && prevFinalized !== undefined ? (
          <p className="mt-2 text-[11px] text-secondary md:text-xs">
            Last {potRoundKind(genesisGameHour)} {hourIdForDisplay(prevHour, genesisGameHour)}{" "}
            {prevFinalized ? (
              <span className="text-emerald-300/90">settled</span>
            ) : (
              <span className="text-amber-200/90">awaiting settlement</span>
            )}
          </p>
        ) : null}
        {prevHour !== undefined ? (
          <div className="mt-1 text-[11px] leading-snug md:text-xs">
            {prevFinalized ? (
              <p className="text-secondary">
                Last span:{" "}
                <span className="font-semibold text-primary-fixed">
                  {prevHourWinWindow !== undefined ? utcPotSpanLabel(Number(prevHourWinWindow)) : "—"}
                </span>
              </p>
            ) : potClock.secUntilFinalizeGate !== null ? (
              potClock.secUntilFinalizeGate > 0 ? (
                <p className="text-secondary">
                  Settlement — {potRoundKind(genesisGameHour)} {hourIdForDisplay(prevHour, genesisGameHour)} in{" "}
                  <span className="font-semibold tabular-nums text-primary-fixed">
                    {formatCountdown(potClock.secUntilFinalizeGate)}
                  </span>
                </p>
              ) : (
                <p className="rounded border border-amber-400/30 bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-100/95 md:text-xs">
                  {potRoundKind(genesisGameHour)} {hourIdForDisplay(prevHour, genesisGameHour)} ready to settle (operators).
                </p>
              )
            ) : null}
          </div>
        ) : null}
      </div>
    ) : (
      <p className="font-body text-[12px] text-secondary">Loading round clock…</p>
    );

  const terminalBody = (
    <>
      {/* One-line objective for new players */}
      <section className="mx-auto w-full max-w-xl space-y-3 px-2 text-center">
        <p className="mx-auto max-w-xl font-body text-[13px] leading-relaxed text-secondary md:text-sm">
          <span className="font-semibold text-on-surface/95">Objective:</span> spend credits to{" "}
          <span className="text-primary-fixed/95">CLICK</span> each hour, earn $CLICK (vesting), and compete for the hourly
          ETH pot. Use <span className="text-primary-fixed/90">Claim vested</span> for time-unlocked tokens, or{" "}
          <span className="text-primary-fixed/90">Early claim</span> to exit locked balance early — details under the amount
          field (<span className="font-semibold text-primary-fixed/85">More info</span>).
        </p>
        <p className="mx-auto max-w-xl font-body text-[12px] leading-relaxed text-secondary md:text-[13px]">
          <span className="font-semibold text-on-surface/95">Trophies:</span> lucky clicks can mint{" "}
          <span className="text-primary-fixed/90">Binary Trophy</span> NFTs to your wallet. Each one can earn ongoing{" "}
          <span className="font-semibold text-primary-fixed/85">revenue share</span> from protocol fees.{" "}
          <Link href="/documentation#trophies" className="text-primary-fixed underline-offset-2 hover:underline">
            Read how trophies &amp; revenue work
          </Link>
          .
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
            Game not linked. Owner runs <span className="font-mono text-amber-100">CLICK.setGame({gameAddr})</span> (
            <span className="font-mono">contracts/scripts/set-game.ts</span>).
          </div>
        )}
        {baseClickReward !== undefined && baseClickReward === 0n && (
          <div className="w-full border border-outline-variant/40 bg-surface-container-low/80 px-3 py-2 text-center font-body text-[11px] text-secondary md:text-xs">
            <span className="text-primary-fixed/90">No $CLICK per click</span> here —{" "}
            <span className="font-mono">baseClickReward</span> is 0. See{" "}
            <Link href="/documentation" className="text-primary-fixed underline">
              docs
            </Link>
            .
          </div>
        )}
        {tinyClickCost && (
          <p className="w-full text-center font-body text-[11px] leading-snug text-amber-200/90 md:text-xs">
            Test economy: <span className="font-mono">clickCostCredits</span> is tiny (often 1 wei), so credit numbers are
            huge. Owner: run <span className="font-mono">setEconomy</span> via{" "}
            <span className="font-mono">contracts/scripts/set-economy-round.ts</span>.
          </p>
        )}
      </section>

      {/* Centered CLICK hero — desktop: round/since launch sits above button (aligned with main column). */}
      <div className="relative mx-auto flex w-full max-w-3xl flex-col items-center justify-center space-y-2 px-1 py-1 md:space-y-3 md:py-4">
        {gameHourNow !== undefined ? (
          <div className="hidden w-full flex-col items-center pb-0.5 text-center md:flex">
            <p
              className={cn("font-mono text-4xl font-black tabular-nums leading-none md:text-5xl", NEON_MAGENTA_TEXT)}
              title={
                roundsSinceLaunch !== undefined
                  ? "Rounds since this game contract was deployed."
                  : "Raw on-chain hour bucket (epoch). Add NEXT_PUBLIC_GAME_GENESIS_UNIX or NEXT_PUBLIC_GAME_DEPLOY_BLOCK for “rounds since launch.”"
              }
            >
              {roundsSinceLaunch !== undefined ? roundsSinceLaunch.toString() : `#${gameHourNow.toString()}`}
            </p>
            <p className="mt-1 max-w-[14rem] font-label text-[10px] uppercase tracking-widest text-secondary md:text-[11px]">
              {roundsSinceLaunch !== undefined ? "Since launch" : "Game hour index (chain)"}
            </p>
          </div>
        ) : null}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-10 md:hidden">
          <div className="pulse-ring h-64 w-64 rounded-full border border-primary-container" />
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
            "md:h-[17rem] md:w-[17rem] md:shrink-0",
            "rounded-full border-4 border-primary-container bg-surface-container md:rounded-none md:border-0 md:bg-primary-fixed md:text-on-primary-fixed",
            wrongChain && "ring-2 ring-amber-400/80"
          )}
        >
          <span
            aria-hidden
            className={cn(
              "pointer-events-none absolute inset-0 z-0 rounded-full md:rounded-none neon-pulse",
              heroClickFlash && "click-hero-flash"
            )}
          />
          <span className="absolute inset-0 z-[1] bg-gradient-to-tr from-primary-container/20 to-transparent md:hidden" />
          <span className="relative z-20 font-headline text-5xl font-extrabold tracking-tighter text-white glitch-text md:text-6xl md:text-on-primary-fixed md:[text-shadow:none]">
            CLICK
          </span>
          <span className="relative z-20 mt-1 font-label text-[10px] font-medium tracking-[0.3em] text-primary-fixed md:hidden">
            EXECUTE
          </span>
        </button>
        {wrongChain && (
          <p className="max-w-xs text-center font-body text-[10px] uppercase tracking-wider text-amber-200/90 md:text-[11px]">
            Wrong network — tap CLICK to switch to Base Sepolia, or use the header link.
          </p>
        )}
        <div className="flex flex-col items-center gap-1.5">
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
          {totalClicksThisHour !== undefined ? (
            <p
              className="max-w-sm px-2 text-center font-mono text-[11px] tabular-nums text-primary-fixed/90 md:text-xs"
              title="All players’ clicks recorded on-chain for the current game hour bucket."
            >
              Total clicks this {genesisGameHour !== null ? "round" : "hour"}:{" "}
              <span className="font-semibold text-on-surface/95">{totalClicksThisHour.toString()}</span>
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
        </div>
        {gasless.status === "ready" ? (
          <p className="max-w-md px-2 text-center font-body text-[11px] leading-snug text-secondary md:text-xs">
            <span className="font-semibold text-primary-fixed/90">Gasless mode active</span> — clicks are free of gas. Your
            EOA receives all rewards and uses your existing credits. Executor:{" "}
            <span className="font-mono text-primary-fixed/85">
              {gasless.smartAccountAddress
                ? `${gasless.smartAccountAddress.slice(0, 6)}…${gasless.smartAccountAddress.slice(-4)}`
                : "—"}
            </span>
            .
          </p>
        ) : null}
      </div>

      {/* Stats — top center */}
      <section className="flex w-full max-w-xl flex-col items-center">
        <div className="w-full text-center">
          <div className="flex items-center justify-center gap-8 md:gap-10">
            <div className="text-center">
              <p className="mb-1 font-label text-[11px] uppercase tracking-widest text-secondary md:text-xs">
                Click Credits
              </p>
              <p className="font-headline text-3xl font-black text-white md:text-4xl md:tabular-nums">
                {clickCostCredits === undefined ? "—" : unlimitedClicks ? "∞" : formatWholeCredits(playsRemainingBig)}
              </p>
              <p className="mt-2 font-body text-[12px] leading-snug text-primary-fixed/90 md:text-sm">
                {clickCostCredits === undefined
                  ? "Loading…"
                  : unlimitedClicks
                    ? "Free clicks — balance still tracks deposits."
                    : "Remaining clicks (1 credit each)."}
              </p>
            </div>
            <div className="h-10 w-px bg-outline-variant/30" aria-hidden />
            <div className="text-center">
              <p className="mb-1 font-label text-[11px] uppercase tracking-widest text-secondary md:text-xs">
                Unvested $CLICK
              </p>
              <div className="flex flex-col items-center gap-1">
                <span className="font-headline text-3xl font-black text-primary-fixed text-glow md:text-4xl md:tabular-nums">
                  {vestingDisplay.unvested.headline}
                </span>
                <span className="max-w-[11rem] font-body text-[11px] font-medium leading-snug tracking-wide text-primary-fixed/85 md:text-xs">
                  {vestingDisplay.unvested.caption}
                </span>
              </div>
            </div>
          </div>
          <div className="mt-4 flex flex-col items-center gap-1 font-body text-[12px] text-outline md:text-sm">
            <span className="inline-flex flex-wrap items-center justify-center gap-1.5 normal-case">
              <span
                className="material-symbols-outlined text-base text-primary-fixed/75"
                style={{ fontVariationSettings: `"FILL" 0, "wght" 400` } as CSSProperties}
              >
                redeem
              </span>
              <span className="text-primary-fixed/90">{vestingDisplay.claimable.headline}</span>
              <span className="opacity-90">{vestingDisplay.claimable.caption}</span>
            </span>
            <button
              type="button"
              className="mt-1 font-label text-[11px] uppercase tracking-wider text-primary-fixed/90 underline-offset-2 hover:underline disabled:opacity-30"
              disabled={!canAct}
              onClick={() => void onClaim()}
            >
              Claim vested
            </button>
          </div>
          <div className="mt-4 w-full max-w-lg border border-outline-variant/20 bg-surface-container-low/50 px-3 py-2">
            <div className="mx-auto flex w-full max-w-md flex-wrap items-center justify-center gap-2">
              <input
                value={earlyAmt}
                onChange={(e) => setEarlyAmt(e.target.value)}
                className="min-w-[5rem] flex-1 border-b border-outline bg-transparent py-1.5 text-center font-body text-[11px] text-primary-fixed focus:border-primary-fixed focus:outline-none sm:max-w-[7rem] md:text-xs"
                placeholder="0"
                title="Amount of unvested $CLICK to claim early (≤ Unvested)"
              />
              <button
                type="button"
                disabled={!canAct || unvestedCap === 0n}
                onClick={() => setEarlyAmt(formatEther(unvestedCap))}
                className="font-label text-[10px] font-bold uppercase tracking-widest text-secondary hover:text-primary-fixed disabled:opacity-30 md:text-[11px]"
              >
                Max
              </button>
              <button
                type="button"
                disabled={!canAct}
                onClick={() => void onEarlySpend()}
                className="font-label text-[11px] font-bold uppercase tracking-widest text-primary-fixed hover:text-white disabled:opacity-30 md:text-xs"
              >
                Early claim
              </button>
            </div>
            {earlySplitDisplay !== null && earlyBreakdownSpend !== null ? (
              <div className="mx-auto mt-3 w-full max-w-md border-t border-outline-variant/25 pt-3">
                <p className="mb-1 text-center font-label text-[9px] uppercase tracking-widest text-secondary md:text-[10px]">
                  Burn / Treasury / LP / You
                </p>
                <p className="mb-2 text-center font-mono text-[10px] tabular-nums text-primary-fixed/85 md:text-[11px]">
                  30 / 30 / 20 / 20
                </p>
                <p className="mb-1.5 text-center font-body text-[10px] text-secondary opacity-90 md:text-[11px]">
                  $CLICK split on{" "}
                  <span className="font-semibold text-on-surface/90">{formatClickDisplayWei(earlyBreakdownSpend)}</span>{" "}
                  unvested (estimate)
                </p>
                <div className="grid grid-cols-4 gap-1 text-center font-mono text-[10px] tabular-nums leading-tight text-on-surface md:text-[11px] md:leading-snug">
                  <span className="text-secondary">{formatClickDisplayWei(earlySplitDisplay.burn)}</span>
                  <span className="text-secondary">{formatClickDisplayWei(earlySplitDisplay.treasury)}</span>
                  <span className="text-secondary">{formatClickDisplayWei(earlySplitDisplay.lp)}</span>
                  <span className="text-primary-fixed">{formatClickDisplayWei(earlySplitDisplay.you)}</span>
                </div>
              </div>
            ) : null}
          </div>
          <div className="mx-auto mt-2 flex max-w-md flex-col items-center gap-2">
            <p className="text-center font-body text-[12px] leading-snug text-secondary md:text-sm">
              Cash out <span className="font-semibold text-on-surface/90">unvested</span> early — not the same as{" "}
              <span className="font-semibold">Claim vested</span>.
            </p>
            <button
              type="button"
              onClick={() => setEarlyClaimInfoOpen(true)}
              className="font-label text-[11px] uppercase tracking-wider text-primary-fixed underline-offset-2 hover:underline"
            >
              More info
            </button>
          </div>
          <Dialog open={earlyClaimInfoOpen} onOpenChange={setEarlyClaimInfoOpen}>
            <DialogContent className="max-h-[min(90dvh,32rem)] overflow-y-auto border-outline-variant/40">
              <DialogHeader>
                <DialogTitle>Early claim</DialogTitle>
                <DialogDescription className="text-left text-secondary">
                  How unvested exit differs from claiming time-unlocked tokens.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3 text-left font-body text-sm leading-relaxed text-secondary">
                <p>
                  <span className="font-semibold text-on-surface/95">Early claim</span> uses your{" "}
                  <span className="font-semibold">locked (unvested)</span> balance.{" "}
                  <span className="font-semibold text-on-surface/95">Claim vested</span> only releases tokens that have
                  finished vesting on schedule.
                </p>
                <p>
                  When you early-claim, part of what you exit stays in the protocol (burn, treasury, liquidity pools). You
                  keep roughly <span className="font-semibold text-primary-fixed/90">one fifth</span> of the amount you exit
                  as liquid <span className="text-primary-fixed/90">$CLICK</span> in your wallet — exact amounts follow
                  on-chain rules.
                </p>
                <p>
                  The <span className="font-semibold">Preview</span> line under the form (when you enter an amount) estimates
                  liquid $CLICK from your input.
                </p>
                <p>
                  <Link href="/documentation#early-claim" className="text-primary-fixed underline-offset-2 hover:underline">
                    Full early-claim documentation
                  </Link>
                </p>
              </div>
            </DialogContent>
          </Dialog>
          {earlyLiquidPreview !== null && canAct && parsedEarlySpend.ok && (
            <p className="mx-auto mt-2 max-w-md text-center font-body text-[12px] leading-snug text-primary-fixed/95 md:text-sm">
              Preview: exiting {formatClickDisplayWei(earlyLiquidPreview.spend)} unvested → about{" "}
              {formatClickDisplayWei(earlyLiquidPreview.liquid)} liquid $CLICK to your wallet (estimate from your input).
            </p>
          )}
          {canAct && !parsedEarlySpend.ok && (
            <p className="mt-1 text-center font-body text-[11px] text-amber-200/90 md:text-xs">
              Invalid amount — use a decimal number (wei parsed as ether).
            </p>
          )}
          {canAct && parsedEarlySpend.ok && earlySpendWei > unvestedCap && unvestedCap > 0n && (
            <p className="mt-1 text-center font-body text-[11px] text-amber-200/90 md:text-xs">
              Amount exceeds unvested ({formatClickDisplayWei(unvestedCap)} $CLICK max). Try Max.
            </p>
          )}
          {canAct && unvestedCap === 0n && (
            <p className="mt-1 text-center font-body text-[11px] text-secondary opacity-85 md:text-xs">
              No unvested balance — early claim will revert (wallet may show “User rejected”).
            </p>
          )}
        </div>
      </section>

      <div className="mx-auto flex w-full max-w-xl justify-center px-1">
        <EscrowPanel escrowAddr={escrowAddr} trophyAddr={trophyAddr} />
      </div>

      {/* Minimal footer strip */}
      <section className="flex max-w-lg flex-col items-center gap-4 text-center">
        <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
          <DialogTrigger asChild>
            <button
              type="button"
              className="group inline-flex items-center gap-3 text-primary-fixed transition-colors hover:text-white"
            >
              <Icon name="workspace_premium" className="text-xl" />
              <span className="border-b border-primary-fixed/20 font-label text-xs uppercase tracking-[0.2em] transition-all group-hover:border-primary-fixed">
                POT winners
              </span>
            </button>
          </DialogTrigger>
          <DialogContent className="border-outline-variant/40">
            <DialogHeader>
              <DialogTitle>POT winners</DialogTitle>
              <DialogDescription className="sr-only">Hourly pot payout history from this browser session</DialogDescription>
            </DialogHeader>
            <WinnerTable rows={potRows} genesisGameHour={genesisGameHour} />
          </DialogContent>
        </Dialog>
        <p className="font-body text-[11px] text-secondary opacity-65 md:text-xs">
          <Link href="/documentation" className="text-primary-fixed underline-offset-2 hover:underline">
            Rules & mechanics
          </Link>
        </p>
      </section>
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
              <span className="material-symbols-outlined shrink-0 text-primary-fixed md:hidden">token</span>
              <span className="truncate text-lg font-black tracking-tighter text-white md:text-2xl">CLICKMINT</span>
              <Link
                href="/documentation"
                className="ml-1 hidden shrink-0 font-label text-[9px] uppercase tracking-widest text-primary-fixed/75 hover:text-primary-fixed sm:inline md:ml-2"
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

          {gameHourNow !== undefined ? (
            <div className="pointer-events-none absolute inset-y-0 left-1/2 z-10 flex -translate-x-1/2 items-center md:left-[calc(18rem+min(56rem,100vw-18rem)/2)]">
              <div className="pointer-events-auto flex max-h-full flex-col items-center justify-center gap-1 py-1 md:gap-1.5 md:py-0">
                <div className="flex flex-col items-center gap-0.5 text-center md:hidden">
                  <p
                    className={cn("font-mono text-xl font-black tabular-nums leading-none", NEON_MAGENTA_TEXT)}
                    title={
                      roundsSinceLaunch !== undefined
                        ? "Rounds since this game contract was deployed."
                        : "Raw on-chain hour bucket (epoch). Add NEXT_PUBLIC_GAME_GENESIS_UNIX or NEXT_PUBLIC_GAME_DEPLOY_BLOCK for “rounds since launch.”"
                    }
                  >
                    {roundsSinceLaunch !== undefined ? roundsSinceLaunch.toString() : `#${gameHourNow.toString()}`}
                  </p>
                  <p className="max-w-[14rem] font-label text-[7px] uppercase tracking-widest text-secondary">
                    {roundsSinceLaunch !== undefined ? "Since launch" : "Game hour index (chain)"}
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
            {isConnected ? (
              <>
                <button
                  type="button"
                  onClick={() => disconnect()}
                  className="max-w-[11rem] truncate bg-primary-container px-2 py-1.5 font-headline text-[10px] font-bold tracking-widest text-on-primary-fixed transition-all hover:brightness-110 active:scale-95 sm:max-w-[13rem] sm:px-3 md:max-w-[14rem] md:px-4 md:text-xs"
                >
                  {address?.slice(0, 6)}…{address?.slice(-4)}
                </button>
                {wrongChain && (
                  <button
                    type="button"
                    disabled={switchPending}
                    onClick={() => switchChain({ chainId: baseSepolia.id })}
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

        <Dialog open={depositOpen} onOpenChange={setDepositOpen}>
          <DialogContent className="max-h-[min(90dvh,32rem)] overflow-y-auto sm:max-w-lg" aria-describedby="deposit-dialog-desc">
            <DialogHeader>
              <DialogTitle>Add click credits</DialogTitle>
              <DialogDescription id="deposit-dialog-desc" className="text-left font-body text-sm text-secondary">
                Deposit ETH for in-game credits (not $CLICK). Larger single deposits may include tier bonuses.
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
            <p className="text-center font-body text-[10px] leading-snug text-secondary opacity-90">
              Deposits use native ETH. To fund from USDC or other tokens, swap to ETH on Base Sepolia first (e.g.{" "}
              <a
                href="https://app.uniswap.org/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary-fixed underline-offset-2 hover:underline"
              >
                Uniswap
              </a>
              ), then add credits here.
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
                    void switchChain({ chainId: baseSepolia.id });
                    setMobileMenuOpen(false);
                  }}
                  className="border border-amber-500/50 py-2 text-[11px] text-amber-200"
                >
                  Switch to Base Sepolia
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
      </header>

      {/* Desktop sidebar */}
      <aside className="fixed left-0 top-0 z-40 hidden h-full w-72 flex-col overflow-y-auto border-r border-outline-variant/30 bg-surface-container-lowest pt-28 md:flex">
        <div className="mb-6 shrink-0 px-6">
          <h3 className="font-label text-xs uppercase tracking-[0.15em] text-primary-fixed">Operations</h3>
          <p className="text-[11px] text-secondary opacity-55">BASE_NETWORK_ACTIVE</p>
        </div>
        <nav className="shrink-0 flex flex-col space-y-1">
          <button
            type="button"
            onClick={() => setMobileTab("terminal")}
            className={cn(
              "flex w-full items-center gap-3 px-6 py-3 text-left font-label text-xs uppercase tracking-[0.15em] transition-all hover:bg-surface-container-low hover:text-white",
              mobileTab === "terminal"
                ? "border-l-2 border-primary-container bg-surface-container-low text-white"
                : "text-secondary"
            )}
          >
            <Icon name="terminal" className="text-sm" />
            Terminal
          </button>
          <button
            type="button"
            onClick={() => setMobileTab("clicks")}
            className={cn(
              "flex w-full items-center gap-3 px-6 py-3 text-left font-label text-xs uppercase tracking-[0.15em] transition-all hover:bg-surface-container-low hover:text-white",
              mobileTab === "clicks"
                ? "border-l-2 border-primary-container bg-surface-container-low text-white"
                : "text-secondary"
            )}
          >
            <Icon name="touch_app" className="text-sm" />
            Click history
          </button>
          <button
            type="button"
            onClick={() => setMobileTab("history")}
            className={cn(
              "flex w-full items-center gap-3 px-6 py-3 text-left font-label text-xs uppercase tracking-[0.15em] transition-all hover:bg-surface-container-low hover:text-white",
              mobileTab === "history"
                ? "border-l-2 border-primary-container bg-surface-container-low text-white"
                : "text-secondary"
            )}
          >
            <Icon name="military_tech" className="text-sm" />
            Pot history
          </button>
          <button
            type="button"
            onClick={() => setMobileTab("trophies")}
            className={cn(
              "flex w-full items-center gap-3 px-6 py-3 text-left font-label text-xs uppercase tracking-[0.15em] transition-all hover:bg-surface-container-low hover:text-white",
              mobileTab === "trophies"
                ? "border-l-2 border-primary-container bg-surface-container-low text-white"
                : "text-secondary"
            )}
          >
            <Icon name="workspace_premium" className="text-sm" />
            Trophy room
          </button>
          <Link
            href="/documentation"
            className="flex items-center gap-3 px-6 py-3 font-label text-xs uppercase tracking-[0.15em] text-secondary transition-all hover:bg-surface-container-low hover:text-white"
          >
            <Icon name="description" className="text-sm" />
            Documentation
          </Link>
        </nav>
        <div className="mt-4 space-y-4 border-t border-outline-variant/25 px-4 pb-36 pt-4 md:pb-44">
          <div className="mx-auto w-full max-w-[17rem]">{resetTimerStrip}</div>
          <div className="mx-auto flex w-full max-w-[17rem] justify-center">{hourlyPotCard}</div>
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
          "relative z-10 mx-auto flex max-w-4xl flex-col items-center space-y-8 px-4 pb-24 pt-28 md:ml-72 md:mr-0 md:pb-16 md:pt-32",
          mobileTab !== "terminal" && "md:space-y-6"
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
            <p className="mb-4 font-body text-[10px] text-secondary opacity-80">
              On-chain Binary Trophy mints (lucky clicks). Thumbnails use metadata from the contract. Card links open
              BaseScan. For full history if your RPC truncates logs, set{" "}
              <code className="text-primary-fixed/90">NEXT_PUBLIC_TROPHY_DEPLOY_BLOCK</code> to the NFT contract creation
              block.
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
