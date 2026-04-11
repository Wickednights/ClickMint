"use client";

import type { CSSProperties } from "react";
import Link from "next/link";
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
import { keepPreviousData } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { EscrowPanel } from "@/components/escrow-panel";
import { getClickAddress, getEscrowAddress, getGameAddress, getTrophyNftAddress } from "@/lib/addresses";
import { economyPresetHint, economyPresetShortLabel } from "@/lib/economy-preset";
import { useClickMintAudio } from "@/hooks/use-clickmint-audio";

const QUICK_BUY = ["0.001", "0.01", "0.1", "0.25", "0.5", "1"] as const;

/** Pot bar fills to 100% at this on-chain pot size (display only; tune for your campaign). */
const POT_BAR_DISPLAY_MAX = parseEther("0.05");

/** Must match `ClickMintGame.RESET_BUFFER` — seconds after each UTC hour before `gameHour` ticks. */
const GAME_RESET_BUFFER_SEC = 20;

const ZERO_ADDR = "0x0000000000000000000000000000000000000000" as const;

/** 15-minute POT window index 0..3 (same as on-chain `utcWindow`). */
function utcWindowFromUnix(sec: number): number {
  const minuteInHour = Math.floor((sec % 3600) / 60);
  return Math.min(3, Math.floor(minuteInHour / 15));
}

function utcQuarterLabel(w: number): string {
  const labels = [":00–:14", ":15–:29", ":30–:44", ":45–:59"];
  return `${labels[Math.min(3, Math.max(0, w))]} UTC`;
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
  window: number;
  entropy?: `0x${string}`;
};

type MobileTab = "terminal" | "history" | "trophies";

function fmtToken(wei: bigint | undefined, maxFrac = 2) {
  if (wei === undefined) return "—";
  const n = Number(formatEther(wei));
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", { maximumFractionDigits: maxFrac });
}

function Icon({ name, className }: { name: string; className?: string }) {
  return (
    <span className={cn("material-symbols-outlined text-lg", className)} aria-hidden>
      {name}
    </span>
  );
}

function WinnerTable({ rows }: { rows: PotRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="font-body text-[10px] leading-relaxed text-secondary opacity-70">
        No POT wins in this session yet. Keep the tab open to catch live events, or finalize an hour on-chain.
      </p>
    );
  }
  return (
    <div className="max-h-[min(50vh,20rem)] overflow-auto">
      <table className="w-full text-left font-body text-[10px] text-on-surface">
        <thead>
          <tr className="font-label uppercase tracking-widest text-secondary">
            <th className="pb-2 pr-2">Hr</th>
            <th className="pb-2 pr-2">Slot</th>
            <th className="pb-2 pr-2">Winner</th>
            <th className="pb-2">$CLICK</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.hourId}-${r.entropy ?? ""}`} className="border-t border-outline-variant/20">
              <td className="py-2 pr-2 text-primary-fixed">{r.hourId.toString()}</td>
              <td className="py-2 pr-2 font-mono text-[9px] text-secondary">
                {utcQuarterLabel(Number(r.window))}
              </td>
              <td className="max-w-[9rem] truncate py-2 pr-2">{r.winner}</td>
              <td className="py-2 text-primary">{fmtToken(r.payout, 4)}</td>
            </tr>
          ))}
        </tbody>
      </table>
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

  const nowTs = BigInt(Math.floor(Date.now() / 1000));
  const { data: gameHourNow } = useReadContract({
    address: gameAddr,
    abi: clickMintGameAbi,
    functionName: "gameHour",
    args: [nowTs],
    query: { enabled: !!gameAddr },
  });

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

  const [timerTick, setTimerTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTimerTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const potClock = useMemo(() => {
    void timerTick;
    const now = Math.floor(Date.now() / 1000);
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
      currentQuarter: utcWindowFromUnix(now),
      gameHourId: gameHourNow,
    };
  }, [gameHourNow, timerTick]);

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
  const [depositOpen, setDepositOpen] = useState(false);
  const lastClientClick = useRef(0);
  const [cooldownMs, setCooldownMs] = useState(0);

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
          window: number;
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
          window: args.window,
          entropy: args.entropy,
        });
        sfxRef.current.playWin();
        sfxRef.current.celebrateWin();
        toast.success("POT WIN", {
          description: `${args.winner.slice(0, 10)}… +${formatEther(args.clickPayout)} $CLICK`,
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
      if (!address) return;
      for (const log of logs) {
        const args = log.args as unknown as { from?: Address; to?: Address; tokenId?: bigint };
        const from = args?.from;
        const to = args?.to;
        if (!from || !to) continue;
        if (from.toLowerCase() !== ZERO_ADDR.toLowerCase()) continue;
        if (to.toLowerCase() !== address.toLowerCase()) continue;
        sfxRef.current.playNft();
        toast.success("Trophy NFT received", {
          description: `Token #${args.tokenId?.toString() ?? "?"}`,
          duration: 6000,
        });
      }
    },
    enabled: !!trophyAddr && !!address,
  });

  const wrongChain = isConnected && chainId !== baseSepolia.id;

  const onDeposit = async (eth: string) => {
    if (!gameAddr || wrongChain || !address || !publicClient) return;
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
      const msg = data ? explainRevertData(data) : (e as Error).message;
      console.error("deposit() failed", e);
      toast.error("Deposit failed", { description: msg.slice(0, 220) });
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
      toast.error("Early spend", { description: "Enter a valid $CLICK amount (on-chain uses ether-style decimals)." });
      return;
    }
    if (amt === 0n) {
      toast.message("Enter an amount ≤ your unvested balance (see Unvested).");
      return;
    }
    if (amt > cap) {
      sfxRef.current.playError();
      toast.error("Early spend exceeds unvested", {
        description:
          cap === 0n
            ? "You have 0 unvested $CLICK in the vesting vault. Clicks must grant baseClickReward, or wait for vesting after rewards."
            : `Max early spend now: ${formatEther(cap)} $CLICK (unvested). Wallets often say "rejected" when simulation reverts.`,
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
      toast.success("Early spend (30/30/20/20)");
    } catch (e) {
      sfxRef.current.playError();
      const data = extractRevertData(e);
      let msg = data ? explainRevertData(data) : (e as Error).message;
      if (/unvested/i.test(msg) || msg.includes("click: unvested")) {
        msg = `On-chain: amount must be ≤ unvested (${formatEther(cap)} $CLICK). ${msg}`;
      }
      if (/user rejected|denied|rejected/i.test(msg)) {
        msg = `${msg.slice(0, 120)} — If you did not cancel, the wallet may be hiding a revert; try a smaller amount.`;
      }
      console.error("earlySpendPending() failed", e);
      toast.error("Early spend failed", { description: msg.slice(0, 260) });
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
      toast.message(`Finalize hour ${prevHour.toString()} sent`);
    } catch (e) {
      sfxRef.current.playError();
      const data = extractRevertData(e);
      const msg = data ? explainRevertData(data) : (e as Error).message;
      console.error("finalizeHour() failed", e);
      toast.error("Finalize failed", { description: msg.slice(0, 220) });
    }
  };

  const potEthStr = potWei !== undefined ? Number(formatEther(potWei)).toLocaleString("en-US", { maximumFractionDigits: 4 }) : "0";
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

  const canAct = isConnected && !wrongChain && !writePending && !gaslessActionPending;
  /** Allow CLICK on wrong chain so the handler can prompt a network switch. */
  const canSendClick =
    isConnected && !writePending && !gaslessActionPending && !gameLinkPending && gameLinkOk;

  const depositPanel = (
    <div className="flex w-full flex-col items-stretch border border-primary-fixed/20 bg-surface-container-low/60">
      <button
        type="button"
        aria-expanded={depositOpen}
        onClick={() => setDepositOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left font-headline text-sm font-bold uppercase tracking-[0.15em] text-primary-fixed transition-colors hover:bg-surface-container-low"
      >
        <span className="inline-flex items-center gap-2">
          <Icon name="add_circle" className="text-lg" />
          Add credits (ETH)
        </span>
        <Icon name={depositOpen ? "expand_less" : "expand_more"} className="text-xl opacity-80" />
      </button>
      {depositOpen ? (
        <div className="border-t border-outline-variant/20 px-4 pb-4 pt-3 max-h-[min(28rem,52svh)] overflow-y-auto overscroll-y-contain md:max-h-[min(32rem,70vh)] md:overscroll-auto lg:max-h-none lg:overflow-visible">
            <p className="mb-3 text-center font-body text-[12px] leading-snug text-secondary md:text-sm">
              In-game Click Credits (not $CLICK). Bonuses apply on larger single deposits.
            </p>
            {clickCostCredits === 0n && (
              <p className="mb-3 text-center font-body text-[11px] text-secondary opacity-80">0 credits charged per click on this deployment.</p>
            )}
            <div className="grid grid-cols-3 gap-2">
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
                      title={tinyClickCost && credPreview !== undefined && credPreview > 500_000n ? "Owner: setEconomy on game so clickCostCredits isn’t 1 wei." : undefined}
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
              <p className="mt-2 text-center font-body text-[10px] text-secondary opacity-80">
                *Credit count explodes when per-click cost is ~1 wei. Use repo{" "}
                <span className="font-mono text-primary-fixed/80">set-economy-round.ts</span>.
              </p>
            )}
            <p className="mt-3 text-center">
              <Link href="/documentation#click-credits" className="font-label text-[10px] uppercase tracking-widest text-primary-fixed/80 underline-offset-2 hover:underline">
                How credits work
              </Link>
            </p>
          </div>
        ) : null}
    </div>
  );

  const terminalBody = (
    <>
      {/* Deposit (top on mobile, left column on md+) + centered CLICK hero */}
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-1 md:flex-row md:items-start md:justify-center md:gap-8 lg:gap-12">
        <aside className="mx-auto w-full max-w-sm shrink-0 md:mx-0 md:w-[17.5rem] lg:w-80 md:sticky md:top-28 md:z-[5] md:self-start">
          {depositPanel}
        </aside>
        <div className="relative flex min-w-0 flex-1 flex-col items-center justify-center space-y-4 py-2 md:py-8">
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-10 md:hidden">
            <div className="pulse-ring h-64 w-64 rounded-full border border-primary-container" />
          </div>
          <button
            type="button"
            disabled={!canSendClick}
            onClick={() => void onClick()}
            className={cn(
              "relative z-10 flex h-56 w-56 flex-col items-center justify-center font-headline font-black uppercase transition-transform active:scale-90",
              "md:h-[17rem] md:w-[17rem] md:shrink-0",
              "rounded-full border-4 border-primary-container bg-surface-container md:rounded-none md:border-0 md:bg-primary-fixed md:text-on-primary-fixed md:neon-pulse",
              wrongChain && "ring-2 ring-amber-400/80"
            )}
          >
            <span className="absolute inset-0 bg-gradient-to-tr from-primary-container/20 to-transparent md:hidden" />
            <span className="relative z-20 font-headline text-5xl font-extrabold tracking-tighter text-white glitch-text md:text-6xl md:text-on-primary-fixed md:[text-shadow:none]">
              CLICK
            </span>
            <span className="relative z-20 mt-1 font-label text-[10px] font-medium tracking-[0.3em] text-primary-fixed md:hidden">
              EXECUTE
            </span>
          </button>
          {wrongChain && (
            <p className="max-w-xs text-center font-body text-[9px] uppercase tracking-wider text-amber-200/90">
              Wrong network — tap CLICK to switch to Base Sepolia, or use the header link.
            </p>
          )}
          <div className="border border-outline-variant/30 bg-surface-container-low px-4 py-2 font-label text-[10px] uppercase tracking-widest text-primary-fixed">
            <span className="inline-flex items-center gap-2">
              <span
                className="material-symbols-outlined text-xs"
                style={{ fontVariationSettings: `"FILL" 1, "wght" 400` } as CSSProperties}
              >
                bolt
              </span>
              {cooldownLabel !== null ? <>RATE LIMIT: {cooldownLabel}s</> : <>READY</>}
            </span>
          </div>
          {gasless.status === "ready" ? (
            <p className="max-w-md px-2 text-center font-body text-[10px] leading-snug text-secondary">
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
      </div>

      {/* Setup / economy alerts */}
      <section className="mx-auto flex w-full max-w-sm flex-col items-center space-y-10 md:max-w-lg">
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

      {/* Hourly POT clock + 15m window */}
      <section className="w-full max-w-xl border border-outline-variant/25 bg-surface-container-low/40 px-4 py-3 text-center md:px-5">
        <p className="font-label text-[9px] uppercase tracking-[0.2em] text-primary-fixed/90">Hourly POT</p>
        {potClock ? (
          <div className="mt-2 space-y-2 font-body text-[11px] leading-relaxed text-secondary md:text-xs">
            <p>
              <span className="text-on-surface/80">Game hour</span>{" "}
              <span className="font-mono text-primary-fixed">#{potClock.gameHourId.toString()}</span>
              <span className="mx-1.5 text-outline-variant">·</span>
              <span className="text-on-surface/80">Your clicks now land in</span>{" "}
              <span className="font-semibold text-primary-fixed">{utcQuarterLabel(potClock.currentQuarter)}</span>
            </p>
            <p className="font-headline text-sm font-bold tabular-nums text-white md:text-base">
              Next hour boundary:{" "}
              <span className="text-primary-fixed">{formatCountdown(potClock.secToHourEnd)}</span>
            </p>
            {prevHour !== undefined ? (
              <p>
                {prevFinalized ? (
                  <>
                    <span className="text-on-surface/80">Last settled hour #{prevHour.toString()} winning quarter:</span>{" "}
                    <span className="font-semibold text-primary-fixed">
                      {prevHourWinWindow !== undefined ? utcQuarterLabel(Number(prevHourWinWindow)) : "—"}
                    </span>
                    <span className="block pt-0.5 text-[10px] opacity-75">
                      (Only players who clicked in that quarter were eligible for that POT.)
                    </span>
                  </>
                ) : potClock.secUntilFinalizeGate !== null ? (
                  potClock.secUntilFinalizeGate > 0 ? (
                    <>
                      <span className="text-on-surface/80">Finalize for hour #{prevHour.toString()} unlocks in</span>{" "}
                      <span className="font-mono font-semibold text-primary-fixed">
                        {formatCountdown(potClock.secUntilFinalizeGate)}
                      </span>
                      <span className="block pt-0.5 text-[10px] opacity-75">
                        Winning 15-minute slot is chosen when the owner runs finalize — not known before then.
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="text-amber-200/90">Hour #{prevHour.toString()} ready to finalize</span>
                      <span className="block pt-0.5 text-[10px] opacity-75">
                        Owner: run Finalize below — the winning UTC quarter appears on-chain after that tx.
                      </span>
                    </>
                  )
                ) : null}
              </p>
            ) : null}
          </div>
        ) : (
          <p className="mt-2 font-body text-[11px] text-secondary">Loading on-chain hour…</p>
        )}
      </section>

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
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2 border border-outline-variant/20 bg-surface-container-low/50 px-3 py-2">
            <input
              value={earlyAmt}
              onChange={(e) => setEarlyAmt(e.target.value)}
              className="min-w-[5rem] flex-1 border-b border-outline bg-transparent py-1.5 font-body text-[11px] text-primary-fixed focus:border-primary-fixed focus:outline-none sm:max-w-[7rem] md:text-xs"
              placeholder="0"
              title="Amount of unvested $CLICK to early-liquidate (≤ Unvested)"
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
              Early spend
            </button>
          </div>
          {canAct && !parsedEarlySpend.ok && (
            <p className="mt-1 font-body text-[10px] text-amber-200/90 md:text-[11px]">
              Invalid amount — use a decimal number (wei parsed as ether).
            </p>
          )}
          {canAct && parsedEarlySpend.ok && earlySpendWei > unvestedCap && unvestedCap > 0n && (
            <p className="mt-1 font-body text-[10px] text-amber-200/90 md:text-[11px]">
              Amount exceeds unvested ({formatEther(unvestedCap)} $CLICK max). Try Max.
            </p>
          )}
          {canAct && unvestedCap === 0n && (
            <p className="mt-1 font-body text-[10px] text-secondary opacity-80 md:text-[11px]">
              No unvested balance — early spend will revert (wallet may show “User rejected”).
            </p>
          )}
        </div>
      </section>

      <section className="mx-auto w-full max-w-sm space-y-3">
        <div className="flex justify-between font-label text-[11px] uppercase tracking-widest text-secondary md:text-xs">
          <span className="text-left">Hourly POT · {potEthStr} ETH</span>
          <span className="text-primary-fixed">{potFillPct.toFixed(0)}%</span>
        </div>
        <div className="h-px w-full overflow-hidden bg-surface-container-highest">
          <div
            className="h-full bg-primary-fixed transition-all duration-700 shadow-[0_0_15px_#00fbfb]"
            style={{ width: `${potFillPct}%` }}
          />
        </div>
        <p className="text-center font-body text-[11px] text-secondary opacity-70 md:text-xs">
          <Link href="/documentation#pot" className="text-primary-fixed/90 underline-offset-2 hover:underline">
            How the POT works
          </Link>
        </p>
        <button
          type="button"
          disabled={!canAct || prevHour === undefined || !!prevFinalized}
          onClick={() => void onFinalize()}
          className="w-full font-label text-[10px] uppercase tracking-widest text-secondary opacity-60 hover:text-primary-fixed disabled:opacity-20 md:text-[11px]"
        >
          Finalize hour (ops)
        </button>
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
            <WinnerTable rows={potRows} />
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

      {/* Header */}
      <header className="fixed left-0 top-0 z-50 flex w-full flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-outline-variant/20 bg-surface/90 px-4 py-3 font-headline uppercase tracking-tighter backdrop-blur-sm md:flex-nowrap md:px-6 md:py-4">
        <div className="flex min-w-0 flex-col gap-0.5 md:block">
          <div className="flex min-w-0 items-center gap-2">
            <span className="material-symbols-outlined shrink-0 text-primary-fixed md:hidden">token</span>
            <span className="truncate text-lg font-black tracking-tighter text-white md:text-2xl">CLICKMINT</span>
            <Link
              href="/documentation"
              className="ml-2 shrink-0 font-label text-[9px] uppercase tracking-widest text-primary-fixed/75 hover:text-primary-fixed md:ml-3"
            >
              Docs
            </Link>
          </div>
          <p
            className="max-w-[min(100%,28rem)] font-label text-[7px] uppercase leading-tight tracking-widest text-secondary/90 md:text-[8px]"
            title={economyPresetHint()}
          >
            <span className="md:hidden">{economyPresetShortLabel()}</span>
            <span className="hidden md:inline">
              {economyPresetShortLabel()} — {economyPresetHint()}
            </span>
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1 md:gap-1.5">
          <button
            type="button"
            aria-expanded={depositOpen}
            aria-controls="header-deposit-panel"
            id="header-add-credits"
            title="Add ETH for click credits"
            onClick={() => setDepositOpen((o) => !o)}
            className={cn(
              "inline-flex items-center gap-1 border px-2 py-1 font-label text-[8px] font-bold tracking-widest transition-colors md:gap-1.5 md:px-2.5 md:text-[9px]",
              depositOpen
                ? "border-primary-fixed bg-primary-fixed/15 text-primary-fixed"
                : "border-primary-fixed/40 bg-primary-fixed/10 text-primary-fixed hover:bg-primary-fixed/20"
            )}
          >
            <Icon name="add_circle" className="text-sm opacity-90" />
            <span className="hidden sm:inline">Credits</span>
          </button>
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
        </div>
        <div className="flex min-w-0 flex-col items-end gap-1">
          {isConnected ? (
            <>
              <button
                type="button"
                onClick={() => disconnect()}
                className="max-w-[11rem] truncate bg-primary-container px-3 py-1.5 font-headline text-[11px] font-bold tracking-widest text-on-primary-fixed transition-all hover:brightness-110 active:scale-95 md:max-w-none md:px-4 md:text-xs"
              >
                {address?.slice(0, 6)}…{address?.slice(-4)}
              </button>
              {wrongChain && (
                <button
                  type="button"
                  disabled={switchPending}
                  onClick={() => switchChain({ chainId: baseSepolia.id })}
                  className="font-label text-[9px] uppercase tracking-widest text-primary-fixed underline"
                >
                  Switch Base Sepolia
                </button>
              )}
              {isPimlicoConfigured() ? (
                <div className="mt-1 flex max-w-[14rem] flex-col items-end gap-1 md:max-w-none">
                  <p className="text-right font-label text-[8px] uppercase leading-tight tracking-widest text-secondary">
                    {gasless.status === "ready"
                      ? "Gasless mode active"
                      : isConnected
                        ? "Wallet connected — enable gasless"
                        : "Connect wallet for gasless"}
                  </p>
                  <div className="flex flex-wrap justify-end gap-1">
                    {gasless.status === "ready" ? (
                      <button
                        type="button"
                        onClick={() => {
                          gasless.clear();
                          toast.message("Gasless session cleared");
                        }}
                        className="border border-outline-variant/60 px-2 py-0.5 font-label text-[8px] uppercase tracking-widest text-secondary hover:border-primary-fixed hover:text-primary-fixed"
                      >
                        Disable gasless
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={!isConnected || wrongChain || !walletClient || gasless.status === "enabling"}
                        onClick={() => setGaslessDialogOpen(true)}
                        className="border border-primary-fixed/40 bg-primary-fixed/10 px-2 py-0.5 font-label text-[8px] uppercase tracking-widest text-primary-fixed hover:bg-primary-fixed/20 disabled:opacity-40"
                      >
                        Enable gasless clicks
                      </button>
                    )}
                  </div>
                </div>
              ) : null}
            </>
          ) : (
            <button
              type="button"
              disabled={connectPending}
              onClick={() => setWalletOpen(true)}
              className="bg-primary-container px-4 py-1.5 font-headline text-[11px] font-bold tracking-widest text-on-primary-fixed transition-all hover:brightness-110 active:scale-95 md:px-6 md:text-xs"
            >
              <span className="hidden sm:inline">Connect Wallet</span>
              <span className="sm:hidden">Connect</span>
            </button>
          )}
        </div>
        {depositOpen ? (
          <div
            id="header-deposit-panel"
            role="region"
            aria-labelledby="header-add-credits"
            className="pointer-events-auto absolute left-0 right-0 top-full z-[60] max-h-[min(75vh,calc(100dvh-5rem))] overflow-y-auto border-b border-outline-variant/40 bg-surface/97 px-4 py-4 shadow-[0_16px_48px_rgba(0,0,0,0.45)] backdrop-blur-md md:px-8"
          >
            <p className="mb-3 text-center font-body text-[12px] leading-snug text-secondary md:text-sm">
              In-game Click Credits (not $CLICK). Bonuses apply on larger single deposits.
            </p>
            {clickCostCredits === 0n && (
              <p className="mb-3 text-center font-body text-[11px] text-secondary opacity-80">
                0 credits charged per click on this deployment.
              </p>
            )}
            <div className="mx-auto grid max-w-lg grid-cols-3 gap-2">
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
              <p className="mt-2 text-center font-body text-[10px] text-secondary opacity-80">
                *Credit count explodes when per-click cost is ~1 wei. Use repo{" "}
                <span className="font-mono text-primary-fixed/80">set-economy-round.ts</span>.
              </p>
            )}
            <p className="mt-3 text-center">
              <Link
                href="/documentation#click-credits"
                className="font-label text-[10px] uppercase tracking-widest text-primary-fixed/80 underline-offset-2 hover:underline"
              >
                How credits work
              </Link>
            </p>
          </div>
        ) : null}
      </header>

      {/* Desktop sidebar */}
      <aside className="fixed left-0 top-0 z-40 hidden h-full w-64 flex-col border-r border-outline-variant/30 bg-surface-container-lowest pt-24 md:flex">
        <div className="mb-8 px-6">
          <h3 className="font-label text-xs uppercase tracking-[0.15em] text-primary-fixed">Operations</h3>
          <p className="text-[10px] text-secondary opacity-50">BASE_NETWORK_ACTIVE</p>
        </div>
        <nav className="flex flex-col space-y-1">
          <div className="flex items-center gap-3 border-l-2 border-primary-container bg-surface-container-low px-6 py-3 font-label text-xs uppercase tracking-[0.15em] text-white">
            <Icon name="terminal" className="text-sm" />
            Terminal
          </div>
          <button
            type="button"
            onClick={() => setHistoryOpen(true)}
            className="flex items-center gap-3 px-6 py-3 text-left font-label text-xs uppercase tracking-[0.15em] text-secondary transition-all hover:bg-surface-container-low hover:text-white"
          >
            <Icon name="military_tech" className="text-sm" />
            Pot history
          </button>
          <button
            type="button"
            onClick={() => {
              setHistoryOpen(true);
            }}
            className="flex items-center gap-3 px-6 py-3 text-left font-label text-xs uppercase tracking-[0.15em] text-secondary transition-all hover:bg-surface-container-low hover:text-white"
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
        <div className="mt-auto px-6 py-8" aria-hidden />
      </aside>

      {/* Main */}
      <main
        className={cn(
          "relative z-10 mx-auto flex max-w-4xl flex-col items-center space-y-16 px-6 pb-32 pt-28 md:ml-64 md:mr-0 md:pb-24 md:pt-32",
          mobileTab !== "terminal" && "md:space-y-10"
        )}
      >
        {mobileTab === "terminal" && terminalBody}

        {mobileTab === "history" && (
          <section className="w-full max-w-md pt-4">
            <h2 className="mb-4 font-headline text-xs font-bold uppercase tracking-[0.2em] text-primary-fixed">
              POT history
            </h2>
            <WinnerTable rows={potRows} />
          </section>
        )}

        {mobileTab === "trophies" && (
          <section className="w-full max-w-md pt-4">
            <h2 className="mb-4 font-headline text-xs font-bold uppercase tracking-[0.2em] text-primary-fixed">
              Trophy room
            </h2>
            <p className="mb-4 font-body text-[10px] text-secondary opacity-80">
              POT winners from this session. Trophies mint on lucky clicks (game odds) or via escrow on the Terminal tab.
            </p>
            <WinnerTable rows={potRows} />
          </section>
        )}
      </main>

      {/* Desktop footer */}
      <footer className="pointer-events-none fixed bottom-0 left-0 z-50 hidden w-full items-end justify-between bg-gradient-to-t from-black/80 to-transparent px-8 py-6 md:flex">
        <div className="pointer-events-auto font-body text-[10px] uppercase tracking-widest text-secondary opacity-50">
          ©2026 CLICKMINT // SYSTEM_READY
        </div>
        <div className="pointer-events-auto flex gap-6">
          {["Terms", "Privacy", "Twitter", "Discord"].map((l) => (
            <a
              key={l}
              href="#"
              className="font-body text-[10px] uppercase tracking-widest text-secondary opacity-40 transition-all hover:text-primary-fixed hover:opacity-100"
            >
              {l}
            </a>
          ))}
        </div>
      </footer>

      {/* Mobile bottom nav */}
      <nav className="fixed bottom-0 left-0 z-50 flex h-20 w-full items-stretch justify-around border-t border-outline-variant/30 bg-surface pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1 shadow-[0_-4px_20px_rgba(0,251,251,0.05)] md:hidden">
        <button
          type="button"
          onClick={() => setMobileTab("terminal")}
          className={cn(
            "flex flex-1 flex-col items-center justify-center gap-1 font-headline text-[10px] font-bold uppercase tracking-[0.15em] transition-colors",
            mobileTab === "terminal"
              ? "border-t-2 border-primary-fixed text-primary-fixed"
              : "text-secondary opacity-50"
          )}
        >
          <Icon name="terminal" />
          Terminal
        </button>
        <button
          type="button"
          onClick={() => setMobileTab("history")}
          className={cn(
            "flex flex-1 flex-col items-center justify-center gap-1 font-headline text-[10px] font-bold uppercase tracking-[0.15em] transition-colors hover:opacity-100",
            mobileTab === "history" ? "border-t-2 border-primary-fixed text-primary-fixed" : "text-secondary opacity-50"
          )}
        >
          <Icon name="history" />
          History
        </button>
        <button
          type="button"
          onClick={() => setMobileTab("trophies")}
          className={cn(
            "flex flex-1 flex-col items-center justify-center gap-1 font-headline text-[10px] font-bold uppercase tracking-[0.15em] transition-colors hover:opacity-100",
            mobileTab === "trophies" ? "border-t-2 border-primary-fixed text-primary-fixed" : "text-secondary opacity-50"
          )}
        >
          <Icon name="emoji_events" />
          Trophies
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
