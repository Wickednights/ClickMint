"use client";

import type { CSSProperties } from "react";
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
} from "wagmi";
import { baseSepolia } from "wagmi/chains";
import { formatEther, parseEther, type Address } from "viem";
import { toast } from "sonner";
import { binaryTrophyAbi, clickMintGameAbi, clickTokenAbi } from "@/lib/abi";
import { explainRevertData, extractRevertData } from "@/lib/revert-reason";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { getClickAddress, getGameAddress, getTrophyNftAddress } from "@/lib/addresses";
import { useClickMintAudio } from "@/hooks/use-clickmint-audio";

const QUICK_BUY = ["0.001", "0.01", "0.1", "0.25", "0.5", "1"] as const;

/** Pot bar fills to 100% at this on-chain pot size (display only; tune for your campaign). */
const POT_BAR_DISPLAY_MAX = parseEther("0.05");

const LAST_CLICK_KEY = "clickmint-last-click-ts";

const ZERO_ADDR = "0x0000000000000000000000000000000000000000" as const;

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
            <th className="pb-2 pr-2">Winner</th>
            <th className="pb-2">CLICK</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.hourId}-${r.entropy ?? ""}`} className="border-t border-outline-variant/20">
              <td className="py-2 pr-2 text-primary-fixed">{r.hourId.toString()}</td>
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

  const {
    audioUnlocked,
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
  const chainId = useChainId();
  const { connect, connectors, isPending: connectPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: switchPending } = useSwitchChain();

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

  const { data: credits } = useReadContract({
    address: gameAddr,
    abi: clickMintGameAbi,
    functionName: "credits",
    args: address ? [address] : undefined,
    query: { enabled: !!gameAddr && !!address },
  });

  const { data: clickCostCredits } = useReadContract({
    address: gameAddr,
    abi: clickMintGameAbi,
    functionName: "clickCostCredits",
    query: { enabled: !!gameAddr },
  });

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

  const { data: totalClicksThisHour } = useReadContract({
    address: gameAddr,
    abi: clickMintGameAbi,
    functionName: "totalClicksInHour",
    args: gameHourNow !== undefined ? [gameHourNow] : undefined,
    query: { enabled: !!gameAddr && gameHourNow !== undefined, refetchInterval: 15_000 },
  });

  const { data: potWei, refetch: refetchPot } = useReadContract({
    address: gameAddr,
    abi: clickMintGameAbi,
    functionName: "currentPotEth",
    query: { enabled: !!gameAddr, refetchInterval: 12_000 },
  });

  const { data: claimable } = useReadContract({
    address: clickAddr,
    abi: clickTokenAbi,
    functionName: "claimable",
    args: address ? [address] : undefined,
    query: { enabled: !!clickAddr && !!address, refetchInterval: 10_000 },
  });

  const { data: pending } = useReadContract({
    address: clickAddr,
    abi: clickTokenAbi,
    functionName: "pendingVested",
    args: address ? [address] : undefined,
    query: { enabled: !!clickAddr && !!address, refetchInterval: 10_000 },
  });

  const [potRows, setPotRows] = useState<PotRow[]>([]);
  const [earlyAmt, setEarlyAmt] = useState("1");
  const [mobileTab, setMobileTab] = useState<MobileTab>("terminal");
  const [historyOpen, setHistoryOpen] = useState(false);
  const lastClientClick = useRef(0);
  const [cooldownMs, setCooldownMs] = useState(0);
  const [lastOnchainClickTs, setLastOnchainClickTs] = useState<number | null>(null);

  const gameLinkOk = useMemo(() => {
    if (!gameAddr || clickTokenLinkedGame === undefined) return false;
    return clickTokenLinkedGame.toLowerCase() === gameAddr.toLowerCase();
  }, [gameAddr, clickTokenLinkedGame]);

  const gameLinkPending = !!gameClickTokenAddr && clickTokenLinkedGame === undefined;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem(LAST_CLICK_KEY);
    if (!raw) return;
    const n = Number(raw);
    if (Number.isFinite(n)) setLastOnchainClickTs(n);
  }, []);

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
          description: `${args.winner.slice(0, 10)}… +${formatEther(args.clickPayout)} CLICK`,
          duration: 8000,
        });
        void refetchPot();
      }
    },
    enabled: !!gameAddr,
  });

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
    if (!gameAddr || wrongChain || !address) return;
    try {
      await writeContractAsync({
        address: gameAddr,
        abi: clickMintGameAbi,
        functionName: "deposit",
        value: parseEther(eth),
      });
      toast.success(`Credits +${eth} ETH`);
    } catch (e) {
      sfxRef.current.playError();
      const data = extractRevertData(e);
      const msg = data ? explainRevertData(data) : (e as Error).message;
      console.error("deposit() failed", e);
      toast.error("Deposit failed", { description: msg.slice(0, 220) });
    }
  };

  const onClick = async () => {
    if (!gameAddr || wrongChain || !address) return;
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
    setCooldownMs(500);
    try {
      if (!publicClient) throw new Error("No RPC client for Base Sepolia");
      const { request } = await publicClient.simulateContract({
        address: gameAddr,
        abi: clickMintGameAbi,
        functionName: "click",
        account: address,
      });
      await writeContractAsync(request);
      const ts = Date.now();
      setLastOnchainClickTs(ts);
      if (typeof window !== "undefined") window.localStorage.setItem(LAST_CLICK_KEY, String(ts));
      sfxRef.current.playClickSuccess();
      toast.success("Click sent");
    } catch (e) {
      sfxRef.current.playError();
      const data = extractRevertData(e);
      const msg = data ? explainRevertData(data) : (e as Error).message;
      console.error("click() failed", { error: e, revertData: data, explained: msg });
      toast.error("Click failed", { description: msg.slice(0, 280), duration: 12_000 });
    }
  };

  const onClaim = async () => {
    if (!clickAddr || wrongChain) return;
    try {
      await writeContractAsync({
        address: clickAddr,
        abi: clickTokenAbi,
        functionName: "claimVested",
      });
      toast.success("Vested CLICK claimed");
    } catch (e) {
      sfxRef.current.playError();
      const data = extractRevertData(e);
      const msg = data ? explainRevertData(data) : (e as Error).message;
      console.error("claimVested() failed", e);
      toast.error("Claim failed", { description: msg.slice(0, 220) });
    }
  };

  const onEarlySpend = async () => {
    if (!clickAddr || wrongChain) return;
    try {
      const amt = parseEther(earlyAmt);
      await writeContractAsync({
        address: clickAddr,
        abi: clickTokenAbi,
        functionName: "earlySpendPending",
        args: [amt],
      });
      toast.success("Early spend (30/30/20/20)");
    } catch (e) {
      sfxRef.current.playError();
      const data = extractRevertData(e);
      const msg = data ? explainRevertData(data) : (e as Error).message;
      console.error("earlySpendPending() failed", e);
      toast.error("Early spend failed", { description: msg.slice(0, 220) });
    }
  };

  const onFinalize = async () => {
    if (!gameAddr || wrongChain || prevHour === undefined) return;
    try {
      await writeContractAsync({
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

  const clicksAccounting = useMemo(() => {
    if (clickCostCredits === undefined)
      return { left: undefined as bigint | null | undefined, perEth: undefined as bigint | null | undefined };
    if (clickCostCredits === 0n) return { left: null, perEth: null };
    const left = credits !== undefined ? credits / clickCostCredits : undefined;
    const perEth = parseEther("1") / clickCostCredits;
    return { left, perEth };
  }, [credits, clickCostCredits]);

  const cooldownLabel = cooldownMs > 0 ? (cooldownMs / 1000).toFixed(1) : "0.0";

  const pendingDisplay = useMemo(() => {
    const p = pending ?? 0n;
    const c = claimable ?? 0n;
    return { main: fmtToken(p, 0), sub: c > 0n ? `${fmtToken(c, 2)} claimable` : null };
  }, [pending, claimable]);

  const canAct = isConnected && !wrongChain && !writePending;
  const canSendClick = canAct && !gameLinkPending && gameLinkOk;

  const terminalBody = (
    <>
      {/* Deposit */}
      <div className="flex w-full max-w-sm flex-col items-center gap-4">
        <div className="flex w-full flex-col gap-2 border-t border-primary-fixed/40 bg-surface-container-low pt-4">
          <div className="flex items-center justify-center gap-3 border border-primary-fixed/30 bg-surface-container-low px-4 py-3 font-headline text-sm font-bold uppercase tracking-[0.2em] text-primary-fixed">
            <Icon name="add_circle" className="text-lg" />
            <span>Deposit</span>
          </div>
          <p className="text-center font-label text-[10px] uppercase tracking-widest text-secondary opacity-50">
            Select amount to buy credits
          </p>
          {clickCostCredits !== undefined && clickCostCredits > 0n && clicksAccounting.perEth !== undefined && clicksAccounting.perEth !== null && (
            <p className="text-center font-body text-[9px] text-primary-fixed/80">
              ~{clicksAccounting.perEth.toString()} clicks per 1 ETH credit at current cost ({formatEther(clickCostCredits)} ETH /
              click)
            </p>
          )}
          {clickCostCredits === 0n && (
            <p className="text-center font-body text-[9px] text-secondary opacity-70">Clicks are free on-chain (cost = 0).</p>
          )}
          <div className="grid grid-cols-3 gap-2">
            {QUICK_BUY.map((e) => (
              <button
                key={e}
                type="button"
                disabled={!canAct}
                onClick={() => void onDeposit(e)}
                className={cn(
                  "flex flex-col items-center justify-center border border-outline-variant/30 bg-surface-container py-3 font-label text-[10px] font-bold uppercase tracking-widest text-on-surface transition-colors",
                  "hover:border-primary-fixed/50 hover:text-primary-fixed active:scale-[0.98] disabled:opacity-30"
                )}
              >
                <span>{e} ETH</span>
                {clickCostCredits !== undefined && clickCostCredits > 0n && (
                  <span className="mt-1 font-body text-[8px] normal-case tracking-normal text-secondary opacity-80">
                    ~{(parseEther(e) / clickCostCredits).toString()} clicks
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

        {/* Stats */}
      <section className="flex w-full max-w-sm flex-col items-center space-y-10">
        {!gameLinkPending && !gameLinkOk && (
          <div className="w-full border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-center font-body text-[10px] text-amber-200">
            On-chain misconfiguration: CLICK.game is not this ClickMintGame. Owner must call{" "}
            <span className="font-mono text-amber-100">setGame({gameAddr})</span> on the CLICK token (see{" "}
            <span className="font-mono">contracts/scripts/set-game.ts</span>).
          </div>
        )}
        <div className="w-full text-center">
          <div className="flex items-center justify-center gap-8 md:gap-10">
            <div className="text-center">
              <p className="mb-1 font-label text-[10px] uppercase tracking-widest text-secondary">Credits</p>
              <p className="font-headline text-3xl font-black text-white md:text-4xl">{fmtCreditsEth(credits)}</p>
              {clicksAccounting.left !== undefined && (
                <p className="mt-1 font-body text-[9px] text-primary-fixed/90">
                  {clicksAccounting.left === null
                    ? "Clicks left: unlimited (zero cost)"
                    : `~${clicksAccounting.left.toString()} clicks left at this credit balance`}
                </p>
              )}
            </div>
            <div className="h-10 w-px bg-outline-variant/30" aria-hidden />
            <div className="text-center">
              <p className="mb-1 font-label text-[10px] uppercase tracking-widest text-secondary">Pending $CLICK</p>
              <p className="font-headline text-3xl font-black text-primary-fixed text-glow md:text-4xl">
                {pendingDisplay.main}
              </p>
            </div>
          </div>
          {pendingDisplay.sub && (
            <p className="mt-1 font-body text-[8px] uppercase tracking-wider text-outline opacity-80">
              {pendingDisplay.sub}
            </p>
          )}
          <p className="mt-3 font-body text-[10px] tracking-wide text-secondary opacity-50">
            10 min vesting (testnet) · early spend ·{" "}
            <button
              type="button"
              className="text-primary-fixed/80 underline-offset-2 hover:underline"
              disabled={!canAct}
              onClick={() => void onClaim()}
            >
              claim vested
            </button>
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2 border border-outline-variant/20 bg-surface-container-low/50 px-3 py-2">
            <input
              value={earlyAmt}
              onChange={(e) => setEarlyAmt(e.target.value)}
              className="w-20 border-b border-outline bg-transparent py-1 font-body text-[10px] text-primary-fixed focus:border-primary-fixed focus:outline-none"
              placeholder="amt"
              title="CLICK (whole tokens)"
            />
            <button
              type="button"
              disabled={!canAct}
              onClick={() => void onEarlySpend()}
              className="font-label text-[10px] font-bold uppercase tracking-widest text-primary-fixed hover:text-white"
            >
              Early spend
            </button>
          </div>
        </div>

        {/* Click control */}
        <div className="relative flex flex-col items-center space-y-6">
          <div className="absolute inset-0 flex items-center justify-center opacity-10 md:hidden">
            <div className="pulse-ring h-64 w-64 rounded-full border border-primary-container" />
          </div>
          <button
            type="button"
            disabled={!canSendClick}
            onClick={() => void onClick()}
            className={cn(
              "relative z-10 flex h-56 w-56 flex-col items-center justify-center font-headline font-black uppercase transition-transform active:scale-90",
              "rounded-full border-4 border-primary-container bg-surface-container md:rounded-none md:border-0 md:bg-primary-fixed md:text-on-primary-fixed md:neon-pulse"
            )}
          >
            <span className="absolute inset-0 bg-gradient-to-tr from-primary-container/20 to-transparent md:hidden" />
            <span className="relative z-20 font-headline text-5xl font-extrabold tracking-tighter text-white glitch-text md:text-5xl md:text-on-primary-fixed md:[text-shadow:none]">
              CLICK
            </span>
            <span className="relative z-20 mt-1 font-label text-[10px] font-medium tracking-[0.3em] text-primary-fixed md:hidden">
              EXECUTE
            </span>
          </button>
          <div className="border border-outline-variant/30 bg-surface-container-low px-4 py-2 font-label text-[10px] uppercase tracking-widest text-primary-fixed">
            <span className="inline-flex items-center gap-2">
              <span
                className="material-symbols-outlined text-xs"
                style={{ fontVariationSettings: `"FILL" 1, "wght" 400` } as CSSProperties}
              >
                bolt
              </span>
              COOLDOWN ACTIVE: {cooldownLabel}s
            </span>
          </div>
        </div>

        {/* POT */}
        <div className="w-full max-w-sm space-y-3">
          <div className="flex justify-between font-label text-[10px] uppercase tracking-widest text-secondary">
            <span className="text-left">
              POT (this hour + carry): {potEthStr} ETH
            </span>
            <span className="text-primary-fixed">{potFillPct.toFixed(0)}%</span>
          </div>
          <p className="font-body text-[8px] uppercase tracking-wider text-outline opacity-60">
            Bar = pot size vs {formatEther(POT_BAR_DISPLAY_MAX)} ETH display cap (on-chain value from currentPotEth)
          </p>
          <div className="h-px w-full overflow-hidden bg-surface-container-highest">
            <div
              className="h-full bg-primary-fixed transition-all duration-700 shadow-[0_0_15px_#00fbfb]"
              style={{ width: `${potFillPct}%` }}
            />
          </div>
          {totalClicksThisHour !== undefined && (
            <p className="font-body text-[8px] text-secondary opacity-70">
              Global clicks this game hour (hash tier ramps every 5k): {totalClicksThisHour.toString()}
            </p>
          )}
          <button
            type="button"
            disabled={!canAct || prevHour === undefined || !!prevFinalized}
            onClick={() => void onFinalize()}
            className="w-full font-label text-[9px] uppercase tracking-widest text-secondary opacity-60 hover:text-primary-fixed disabled:opacity-20"
          >
            Finalize previous hour (ops)
          </button>
        </div>
      </section>

      {/* Info */}
      <section className="max-w-lg space-y-8 text-center">
        <div className="flex flex-col items-center gap-2">
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => setMusicOn(!musicOn)}
              className={cn(
                "border border-outline-variant/40 px-3 py-1.5 font-label text-[9px] uppercase tracking-widest transition-colors",
                musicOn ? "border-primary-fixed text-primary-fixed" : "text-secondary opacity-70 hover:text-primary-fixed"
              )}
            >
              {musicOn ? "Music on" : "Music off"}
            </button>
            <button
              type="button"
              onClick={() => setSfxOn(!sfxOn)}
              className={cn(
                "border border-outline-variant/40 px-3 py-1.5 font-label text-[9px] uppercase tracking-widest transition-colors",
                sfxOn ? "border-primary-fixed text-primary-fixed" : "text-secondary opacity-70 hover:text-primary-fixed"
              )}
            >
              {sfxOn ? "Click sounds on" : "Click sounds off"}
            </button>
          </div>
          <span className="max-w-md font-body text-[8px] leading-relaxed text-secondary opacity-50">
            Loops <span className="font-mono">/sounds/ambient.mp3</span> after you interact · SFX from{" "}
            <span className="font-mono">/sounds/</span> · prefs saved in this browser
          </span>
          {!audioUnlocked && (
            <span className="font-body text-[8px] text-amber-200/80">Tap or keypress anywhere to unlock audio (browser policy).</span>
          )}
        </div>
        <p className="font-label text-[10px] uppercase leading-loose tracking-[0.25em] text-secondary opacity-60">
          Each on-chain click is a transaction (wallet signature). Gasless UX needs a relayer / session scheme later.
        </p>
        <p className="font-label text-[10px] uppercase leading-loose tracking-[0.25em] text-secondary opacity-60">
          Max ~2 clicks per block · Hourly POT · Binary Trophy NFTs with revenue share
        </p>
        <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
          <DialogTrigger asChild>
            <button
              type="button"
              className="group inline-flex items-center gap-3 text-primary-fixed transition-colors hover:text-white"
            >
              <Icon name="workspace_premium" className="text-xl" />
              <span className="border-b border-primary-fixed/20 font-label text-xs uppercase tracking-[0.2em] transition-all group-hover:border-primary-fixed">
                View winner history
              </span>
            </button>
          </DialogTrigger>
          <DialogContent className="border-outline-variant/40">
            <DialogHeader>
              <DialogTitle>POT winners</DialogTitle>
            </DialogHeader>
            <WinnerTable rows={potRows} />
          </DialogContent>
        </Dialog>

        <div className="w-full max-w-lg border border-outline-variant/30 bg-surface-container-low/80 p-4 text-left font-mono text-[10px] leading-relaxed text-secondary">
          <p className="mb-2 font-label text-[10px] uppercase tracking-widest text-primary-fixed">Debug info</p>
          <p>User: {address ?? "—"}</p>
          <p>ClickMintGame: {gameAddr}</p>
          <p>CLICK token: {gameClickTokenAddr ?? "—"}</p>
          <p>CLICK.game: {clickTokenLinkedGame ?? "(loading)"}</p>
          <p title="Must match game address or grantVested reverts">
            Game link OK: {gameLinkPending ? "loading…" : gameLinkOk ? "yes" : "NO — run CLICK.setGame(game)"}
          </p>
          <p>Credits (wei): {credits !== undefined ? credits.toString() : "—"}</p>
          <p>clickCostCredits: {clickCostCredits !== undefined ? `${clickCostCredits.toString()} wei` : "—"}</p>
          <p>
            Last click (client, after success):{" "}
            {lastOnchainClickTs ? `${new Date(lastOnchainClickTs).toISOString()} · ${lastOnchainClickTs}` : "—"}
          </p>
          <p>Chain: Base Sepolia ({baseSepolia.id}) · connected {chainId}</p>
        </div>
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
      <header className="fixed left-0 top-0 z-50 flex w-full items-center justify-between border-b border-outline-variant/20 bg-surface/90 px-6 py-4 font-headline uppercase tracking-tighter backdrop-blur-sm">
        <div className="flex items-center gap-2 md:block">
          <span className="material-symbols-outlined text-primary-fixed md:hidden">token</span>
          <span className="text-xl font-black tracking-tighter text-white md:text-2xl">CLICKMINT</span>
        </div>
        <div className="flex flex-col items-end gap-1">
          {isConnected ? (
            <>
              <button
                type="button"
                onClick={() => disconnect()}
                className="bg-primary-container px-4 py-1.5 font-headline text-xs font-bold tracking-widest text-on-primary-fixed transition-all hover:brightness-110 active:scale-95"
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
            </>
          ) : (
            <button
              type="button"
              disabled={connectPending || !connectors[0]}
              onClick={() => connect({ connector: connectors[0] })}
              className="bg-primary-container px-6 py-1.5 font-headline text-xs font-bold tracking-widest text-on-primary-fixed transition-all hover:brightness-110 active:scale-95 md:px-6"
            >
              <span className="hidden md:inline">Connect Wallet</span>
              <span className="md:hidden">Connect</span>
            </button>
          )}
        </div>
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
          <a
            href="https://github.com"
            className="flex items-center gap-3 px-6 py-3 font-label text-xs uppercase tracking-[0.15em] text-secondary transition-all hover:bg-surface-container-low hover:text-white"
            rel="noopener noreferrer"
            target="_blank"
          >
            <Icon name="description" className="text-sm" />
            Documentation
          </a>
        </nav>
        <div className="mt-auto px-6 py-8 font-body text-[10px] uppercase tracking-widest text-secondary opacity-50">
          ©2026 CLICKMINT // SYSTEM_READY
        </div>
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
              Winner log from this session. Binary Trophy NFT claims ship in a later phase.
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
    </div>
  );
}

function fmtCreditsEth(credits: bigint | undefined) {
  if (credits === undefined) return "—";
  const n = Number(formatEther(credits));
  if (!Number.isFinite(n)) return "—";
  if (n >= 1000) return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  return n.toLocaleString("en-US", { maximumFractionDigits: 6 });
}
