"use client";

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
} from "wagmi";
import { baseSepolia } from "wagmi/chains";
import { formatEther, parseEther, type Address } from "viem";
import { toast } from "sonner";
import { Trophy } from "lucide-react";
import { clickMintGameAbi, clickTokenAbi } from "@/lib/abi";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

const QUICK_BUY = ["0.001", "0.01", "0.1", "0.25", "0.5", "1"] as const;

type PotRow = {
  hourId: bigint;
  winner: Address;
  payout: bigint;
  window: number;
  entropy?: `0x${string}`;
};

function envAddr(name: string): Address | undefined {
  const v = process.env[name];
  if (!v || !v.startsWith("0x")) return undefined;
  return v as Address;
}

export function ClickMintDashboard() {
  const gameAddr = envAddr("NEXT_PUBLIC_GAME_ADDRESS");
  const clickAddr = envAddr("NEXT_PUBLIC_CLICK_ADDRESS");

  const { address, isConnected, chain } = useAccount();
  const chainId = useChainId();
  const { connect, connectors, isPending: connectPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: switchPending } = useSwitchChain();

  const { writeContractAsync, isPending: writePending } = useWriteContract();

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

  const { data: liquid } = useReadContract({
    address: clickAddr,
    abi: clickTokenAbi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!clickAddr && !!address, refetchInterval: 10_000 },
  });

  const [potRows, setPotRows] = useState<PotRow[]>([]);
  const [earlyAmt, setEarlyAmt] = useState("1");
  const [tick, setTick] = useState(0);
  const lastClientClick = useRef(0);
  const [cooldownMs, setCooldownMs] = useState(0);

  useEffect(() => {
    const i = setInterval(() => setTick((t) => t + 1), 1_000);
    return () => clearInterval(i);
  }, []);

  useEffect(() => {
    if (cooldownMs <= 0) return;
    const t = setInterval(() => {
      setCooldownMs((c) => Math.max(0, c - 50));
    }, 50);
    return () => clearInterval(t);
  }, [cooldownMs]);

  const pushPotRow = useCallback((row: PotRow) => {
    setPotRows((r) => [row, ...r].slice(0, 32));
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
        if (!args?.winner || args.winner === "0x0000000000000000000000000000000000000000") {
          toast.message("POT round: no eligible winner — carried forward.");
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
        toast.success("POT WIN", {
          description: `${args.winner.slice(0, 10)}… +${formatEther(args.clickPayout)} CLICK`,
          duration: 8_000,
        });
        void refetchPot();
      }
    },
    enabled: !!gameAddr,
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
      toast.success(`Deposited ${eth} ETH`);
    } catch (e) {
      toast.error("Deposit failed", { description: (e as Error).message?.slice(0, 120) });
    }
  };

  const onClick = async () => {
    if (!gameAddr || wrongChain || !address) return;
    const now = Date.now();
    if (now - lastClientClick.current < 500) {
      setCooldownMs(500 - (now - lastClientClick.current));
      toast.message("500ms cooldown");
      return;
    }
    lastClientClick.current = now;
    setCooldownMs(500);
    try {
      await writeContractAsync({
        address: gameAddr,
        abi: clickMintGameAbi,
        functionName: "click",
      });
    } catch (e) {
      toast.error("Click failed", { description: (e as Error).message?.slice(0, 120) });
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
      toast.success("Claimed vested CLICK");
    } catch (e) {
      toast.error("Claim failed", { description: (e as Error).message?.slice(0, 120) });
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
      toast.success("Early spend executed (30/30/20/20 split)");
    } catch (e) {
      toast.error("Early spend failed", { description: (e as Error).message?.slice(0, 120) });
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
      toast.message(`Finalizing hour ${prevHour.toString()}`);
    } catch (e) {
      toast.error("Finalize failed", { description: (e as Error).message?.slice(0, 120) });
    }
  };

  const mysteryPct = useMemo(() => {
    const base =
      potWei !== undefined ? Math.min(95, 25 + Number(formatEther(potWei)) * 40) : 28;
    const wave = Math.sin((typeof performance !== "undefined" ? performance.now() : tick * 1000) / 900) * 12;
    return Math.min(99, Math.max(12, base + wave));
  }, [potWei, tick]);

  if (!gameAddr || !clickAddr) {
    return (
      <main className="mx-auto flex max-w-lg flex-col gap-4 p-6 pt-16 text-center">
        <h1 className="text-2xl font-bold text-cyan-300">ClickMint</h1>
        <p className="text-zinc-400">
          Set <code className="text-cyan-200">NEXT_PUBLIC_GAME_ADDRESS</code> and{" "}
          <code className="text-cyan-200">NEXT_PUBLIC_CLICK_ADDRESS</code> in{" "}
          <code className="text-fuchsia-200">.env.local</code>, then restart{" "}
          <code className="text-fuchsia-200">npm run dev</code>.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-6 px-4 pb-16 pt-10 md:max-w-lg">
      <header className="flex items-start justify-between gap-2">
        <div>
          <h1 className="bg-gradient-to-r from-cyan-300 to-fuchsia-400 bg-clip-text text-2xl font-bold tracking-tight text-transparent">
            CLICKMINT
          </h1>
          <p className="text-xs text-zinc-500">Base Sepolia · testnet MVP</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          {isConnected ? (
            <>
              <button
                type="button"
                onClick={() => disconnect()}
                className="max-w-[10rem] truncate text-right text-xs text-zinc-400 underline-offset-2 hover:underline"
              >
                {address}
              </button>
              {wrongChain && (
                <Button
                  size="sm"
                  variant="neon"
                  disabled={switchPending}
                  onClick={() => switchChain({ chainId: baseSepolia.id })}
                >
                  Switch to Base Sepolia
                </Button>
              )}
            </>
          ) : (
            <Button
              size="sm"
              variant="neon"
              disabled={connectPending || !connectors[0]}
              onClick={() => connect({ connector: connectors[0] })}
            >
              Connect
            </Button>
          )}
        </div>
      </header>

      <section className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">Quick buy</p>
        <div className="grid grid-cols-3 gap-2">
          {QUICK_BUY.map((e) => (
            <Button
              key={e}
              variant="buy"
              size="sm"
              disabled={!isConnected || wrongChain || writePending}
              onClick={() => onDeposit(e)}
            >
              {e}
            </Button>
          ))}
        </div>
      </section>

      <section className="flex flex-col items-center gap-3">
        <Button
          variant="neon"
          size="giant"
          disabled={!isConnected || wrongChain || writePending}
          onClick={() => void onClick()}
          className={cn(
            "animate-pulse-neon border-2 text-lg font-bold",
            cooldownMs > 0 && "opacity-60"
          )}
        >
          CLICK
        </Button>
        <p className="text-center text-xs text-zinc-500">
          Max ~2 clicks/block on-chain · client 500ms cooldown
        </p>
        {cooldownMs > 0 && (
          <p className="text-sm text-fuchsia-300">Cooldown: {(cooldownMs / 1000).toFixed(2)}s</p>
        )}
      </section>

      <section className="rounded-xl border border-white/10 bg-zinc-950/60 p-4 backdrop-blur">
        <p className="text-xs uppercase tracking-wider text-zinc-500">Balances</p>
        <div className="mt-2 grid gap-2 font-mono text-sm">
          <div className="flex justify-between">
            <span className="text-zinc-400">Credits</span>
            <span className="text-cyan-200">
              {credits !== undefined ? formatEther(credits) : "—"} wei
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-400">$CLICK liquid</span>
            <span className="text-emerald-200">
              {liquid !== undefined ? formatEther(liquid) : "—"}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-400">$CLICK claimable</span>
            <span className="text-cyan-200">
              {claimable !== undefined ? formatEther(claimable) : "—"}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-400">$CLICK pending</span>
            <span className="text-fuchsia-200">
              {pending !== undefined ? formatEther(pending) : "—"}
            </span>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" disabled={!isConnected || wrongChain || writePending} onClick={() => void onClaim()}>
            Claim vested
          </Button>
          <div className="flex flex-1 items-center gap-2">
            <input
              value={earlyAmt}
              onChange={(e) => setEarlyAmt(e.target.value)}
              className="h-8 w-24 rounded-md border border-zinc-700 bg-zinc-900 px-2 font-mono text-xs text-cyan-100"
              placeholder="CLICK"
              title="Whole CLICK amount (18 decimals)"
            />
            <Button
              size="sm"
              variant="ghost"
              disabled={!isConnected || wrongChain || writePending}
              onClick={() => void onEarlySpend()}
            >
              Early spend
            </Button>
          </div>
        </div>
      </section>

      <section className="space-y-2 rounded-xl border border-fuchsia-500/20 p-4">
        <div className="flex items-center justify-between">
          <p className="text-xs uppercase tracking-wider text-fuchsia-300/90">Mystery POT</p>
          <span className="font-mono text-xs text-zinc-400">
            {potWei !== undefined ? `${formatEther(potWei)} ETH` : "—"}
          </span>
        </div>
        <div className="animate-shimmer-bar rounded-full p-[1px]">
          <Progress value={mysteryPct} />
        </div>
        <p className="text-[11px] leading-snug text-zinc-500">
          Hourly pseudo-random window + min 100 clicks. VRF upgrade path on mainnet.
        </p>
        <Button
          size="sm"
          variant="ghost"
          className="w-full"
          disabled={!isConnected || wrongChain || writePending || prevHour === undefined || prevFinalized}
          onClick={() => void onFinalize()}
        >
          Finalize previous hour (if ready)
        </Button>
      </section>

      <section className="flex justify-center">
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="ghost" size="sm" className="gap-2 text-zinc-300">
              <Trophy className="h-4 w-4 text-amber-300" />
              Winner history
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>POT winners</DialogTitle>
            </DialogHeader>
            <div className="max-h-72 overflow-auto font-mono text-xs">
              {potRows.length === 0 ? (
                <p className="text-zinc-500">Listen for on-chain wins in this session, or refresh after events.</p>
              ) : (
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-zinc-500">
                      <th className="pb-2 pr-2">Hr</th>
                      <th className="pb-2 pr-2">Winner</th>
                      <th className="pb-2">CLICK</th>
                    </tr>
                  </thead>
                  <tbody>
                    {potRows.map((r) => (
                      <tr key={`${r.hourId}-${r.entropy ?? ""}`} className="border-t border-white/5">
                        <td className="py-2 pr-2 text-cyan-300">{r.hourId.toString()}</td>
                        <td className="max-w-[8rem] truncate py-2 pr-2 text-fuchsia-200">{r.winner}</td>
                        <td className="py-2 text-emerald-200">{formatEther(r.payout)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </section>

      <p className="text-center text-[10px] text-zinc-600">
        Chain: {chain?.name ?? "—"} · Game:{" "}
        <span className="break-all text-zinc-500">{gameAddr}</span>
      </p>
    </main>
  );
}
