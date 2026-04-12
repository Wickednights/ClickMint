"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import type { Address } from "viem";
import { useAccount, usePublicClient, useReadContracts, useWriteContract } from "wagmi";
import { baseSepolia } from "wagmi/chains";
import { binaryTrophyAbi, escrowAbi } from "@/lib/abi";
import { explainRevertData, extractRevertData } from "@/lib/revert-reason";
import { cn } from "@/lib/utils";

type Props = {
  escrowAddr: Address;
  trophyAddr: Address;
};

const HOLD_SCAN_CAP = 24n;

export function EscrowPanel({ escrowAddr, trophyAddr }: Props) {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient({ chainId: baseSepolia.id });
  const { writeContractAsync } = useWriteContract();

  const { data: nextHold } = useReadContracts({
    contracts: [{ address: escrowAddr, abi: escrowAbi, functionName: "nextHoldId" }],
    query: { enabled: !!escrowAddr },
  });
  const nextHoldId = nextHold?.[0]?.status === "success" ? (nextHold[0].result as bigint) : undefined;

  const holdIds = useMemo(() => {
    if (nextHoldId === undefined || nextHoldId <= 1n) return [] as bigint[];
    const last = nextHoldId - 1n;
    const start = last > HOLD_SCAN_CAP ? last - (HOLD_SCAN_CAP - 1n) : 1n;
    const out: bigint[] = [];
    for (let i = start; i <= last; i += 1n) out.push(i);
    return out;
  }, [nextHoldId]);

  const { data: holdsData, refetch: refetchHolds } = useReadContracts({
    contracts: holdIds.map((id) => ({
      address: escrowAddr,
      abi: escrowAbi,
      functionName: "holds",
      args: [id],
    })),
    query: { enabled: holdIds.length > 0 && !!address },
  });

  const myOpenHolds = useMemo(() => {
    if (!address || !holdsData) return [];
    const out: { id: bigint; tokenId: bigint }[] = [];
    for (let i = 0; i < holdsData.length; i++) {
      const r = holdsData[i];
      if (r.status !== "success") continue;
      const [token, tokenId, , beneficiary, released] = r.result as unknown as readonly [
        Address,
        bigint,
        Address,
        Address,
        boolean,
      ];
      if (released) continue;
      if (beneficiary.toLowerCase() !== address.toLowerCase()) continue;
      if (token.toLowerCase() !== trophyAddr.toLowerCase()) continue;
      const id = holdIds[i];
      if (id !== undefined) out.push({ id, tokenId });
    }
    return out;
  }, [address, holdsData, holdIds, trophyAddr]);

  const [depositBeneficiary, setDepositBeneficiary] = useState("");
  const [depositTokenId, setDepositTokenId] = useState("");

  const canAct = isConnected && !!address;

  const onApproveAndDeposit = async () => {
    if (!address || !publicClient) return;
    const ben = (depositBeneficiary.trim() || address) as Address;
    let tid: bigint;
    try {
      tid = BigInt(depositTokenId.trim());
    } catch {
      toast.error("Token ID", { description: "Enter a numeric trophy token ID." });
      return;
    }
    try {
      const owner = await publicClient.readContract({
        address: trophyAddr,
        abi: binaryTrophyAbi,
        functionName: "ownerOf",
        args: [tid],
      });
      if ((owner as Address).toLowerCase() !== address.toLowerCase()) {
        toast.error("Not your NFT", { description: "You must own the trophy to escrow it." });
        return;
      }
      const aHash = await writeContractAsync({
        chainId: baseSepolia.id,
        address: trophyAddr,
        abi: binaryTrophyAbi,
        functionName: "approve",
        args: [escrowAddr, tid],
      });
      await publicClient.waitForTransactionReceipt({ hash: aHash });

      const dHash = await writeContractAsync({
        chainId: baseSepolia.id,
        address: escrowAddr,
        abi: escrowAbi,
        functionName: "deposit",
        args: [trophyAddr, tid, ben],
      });
      await publicClient.waitForTransactionReceipt({ hash: dHash });
      void refetchHolds();
      setDepositTokenId("");
      toast.success("Escrow deposit", { description: `Hold created — beneficiary ${ben.slice(0, 8)}…` });
    } catch (e) {
      const data = extractRevertData(e);
      const msg = data ? explainRevertData(data) : (e as Error).message;
      toast.error("Escrow deposit failed", { description: msg.slice(0, 220) });
    }
  };

  const onClaim = async (holdId: bigint) => {
    if (!publicClient) return;
    try {
      const hash = await writeContractAsync({
        chainId: baseSepolia.id,
        address: escrowAddr,
        abi: escrowAbi,
        functionName: "claim",
        args: [holdId],
      });
      await publicClient.waitForTransactionReceipt({ hash });
      void refetchHolds();
      toast.success("Escrow claimed", { description: `Hold #${holdId.toString()}` });
    } catch (e) {
      const data = extractRevertData(e);
      const msg = data ? explainRevertData(data) : (e as Error).message;
      toast.error("Claim failed", { description: msg.slice(0, 220) });
    }
  };

  return (
    <section
      className={cn(
        "w-full max-w-xl space-y-3 border border-outline-variant/25 bg-surface-container-low/30 px-4 py-4"
      )}
    >
      <h3 className="text-center font-label text-[10px] uppercase tracking-[0.2em] text-primary-fixed">
        Trophy escrow
      </h3>
      <p className="text-center font-body text-[10px] leading-relaxed text-secondary">
        Lock a Binary Trophy in escrow; only the beneficiary (or contract owner) can release it.
      </p>

      {myOpenHolds.length > 0 ? (
        <div className="space-y-2">
          <p className="font-label text-[9px] uppercase tracking-widest text-secondary">Your open holds (this trophy)</p>
          <ul className="space-y-1">
            {myOpenHolds.map((h) => (
              <li
                key={h.id.toString()}
                className="flex flex-wrap items-center justify-between gap-2 border border-outline-variant/20 bg-surface-container/40 px-2 py-2 font-mono text-[10px]"
              >
                <span>
                  Hold #{h.id.toString()} · token #{h.tokenId.toString()}
                </span>
                <button
                  type="button"
                  disabled={!canAct}
                  onClick={() => void onClaim(h.id)}
                  className="font-label text-[9px] uppercase tracking-widest text-primary-fixed hover:underline disabled:opacity-30"
                >
                  Claim
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-center font-body text-[10px] text-secondary opacity-70">
          No open holds for you on this trophy (last {HOLD_SCAN_CAP.toString()} holds scanned).
        </p>
      )}

      <div className="border-t border-outline-variant/20 pt-3">
        <p className="mb-2 font-label text-[9px] uppercase tracking-widest text-secondary">Deposit a trophy</p>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
          <label className="flex flex-1 flex-col gap-1 font-body text-[10px] text-secondary">
            Token ID
            <input
              value={depositTokenId}
              onChange={(e) => setDepositTokenId(e.target.value)}
              className="border-b border-outline-variant/40 bg-transparent py-1 font-mono text-primary-fixed focus:border-primary-fixed focus:outline-none"
              placeholder="1"
            />
          </label>
          <label className="flex flex-1 flex-col gap-1 font-body text-[10px] text-secondary">
            Beneficiary (default: you)
            <input
              value={depositBeneficiary}
              onChange={(e) => setDepositBeneficiary(e.target.value)}
              className="border-b border-outline-variant/40 bg-transparent py-1 font-mono text-[10px] text-primary-fixed focus:border-primary-fixed focus:outline-none"
              placeholder="0x…"
            />
          </label>
          <button
            type="button"
            disabled={!canAct}
            onClick={() => void onApproveAndDeposit()}
            className="border border-primary-fixed/40 px-3 py-2 font-label text-[9px] font-bold uppercase tracking-widest text-primary-fixed hover:bg-primary-fixed/10 disabled:opacity-30"
          >
            Approve + deposit
          </button>
        </div>
      </div>
    </section>
  );
}
