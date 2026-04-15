"use client";

import { useCallback, useEffect, useState } from "react";
import { useAccount, useChainId, useReadContract, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { formatEther, isAddress, parseEther, type Address } from "viem";
import { clickmintChainId, clickmintChainLabel } from "@/lib/clickmint-chain";
import { clickMintGameAbi, clickTokenAbi } from "@/lib/abi";
import { getClickAddress, getGameAddress, getTrophyNftAddress } from "@/lib/addresses";
import { getUiEconomyPreset, isExplicitTestnetDeployEconomy } from "@/lib/economy-preset";
import { formatWholeCredits } from "@/lib/game-display";

function TestnetMintClickSection({ clickAddr }: { clickAddr: Address }) {
  const mintUiEnabled = isExplicitTestnetDeployEconomy();
  const preset = getUiEconomyPreset();
  const { address } = useAccount();
  const chainId = useChainId();
  const wrongChain = chainId !== clickmintChainId();
  const [toInput, setToInput] = useState("");
  const [amountHuman, setAmountHuman] = useState("500000");
  const [localError, setLocalError] = useState<string | null>(null);

  const { data: owner } = useReadContract({
    address: clickAddr,
    abi: clickTokenAbi,
    functionName: "owner",
    query: { enabled: !!clickAddr },
  });

  const {
    data: mintForTestingOnChain,
    isError: mintFlagReadError,
  } = useReadContract({
    address: clickAddr,
    abi: clickTokenAbi,
    functionName: "mintForTestingEnabled",
    query: { enabled: !!clickAddr && mintUiEnabled, retry: false },
  });

  const isOwner =
    address !== undefined && owner !== undefined && address.toLowerCase() === owner.toLowerCase();

  useEffect(() => {
    if (address) setToInput(address);
  }, [address]);

  const { writeContract, data: hash, isPending, error: writeError, reset } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const onMint = useCallback(() => {
    setLocalError(null);
    reset();
    const to = toInput.trim() as Address;
    if (!isAddress(to)) {
      setLocalError("Recipient must be a valid address.");
      return;
    }
    let wei: bigint;
    try {
      wei = parseEther(amountHuman.trim() === "" ? "0" : amountHuman.trim());
    } catch {
      setLocalError("Amount must be a decimal number (CLICK uses 18 decimals).");
      return;
    }
    if (wei === 0n) {
      setLocalError("Amount must be greater than zero.");
      return;
    }
    if (wrongChain) {
      setLocalError(`Switch wallet to ${clickmintChainLabel()} (chain ${clickmintChainId()}).`);
      return;
    }
    writeContract({
      address: clickAddr,
      abi: clickTokenAbi,
      functionName: "mintForTesting",
      args: [to, wei],
    });
  }, [amountHuman, clickAddr, reset, toInput, writeContract, wrongChain]);

  if (!mintUiEnabled) {
    return (
      <div className="mt-6 rounded border border-outline-variant/30 bg-black/40 p-3 text-[11px] text-secondary">
        <p className="font-label uppercase tracking-wider text-primary-fixed/80">Testnet mint (hidden)</p>
        <p className="mt-2 leading-relaxed">
          Owner mint UI is enabled only when{" "}
          <strong className="text-on-surface/90">NEXT_PUBLIC_DEPLOY_ECONOMY=testnet</strong> is set explicitly (not
          merely unset). On mainnet, deployment mints <strong className="text-on-surface/90">10% of cap</strong> to the
          deployer in the CLICK constructor for LP bootstrap (see{" "}
          <code className="text-primary-fixed/90">deploy.ts</code>). Current UI preset:{" "}
          <strong className="text-on-surface/90">{preset}</strong>.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-6 rounded border border-primary-fixed/35 bg-primary-fixed/5 p-3 text-[11px] text-secondary">
      <p className="font-label uppercase tracking-wider text-primary-fixed">Mint CLICK (testnet owner)</p>
      <p className="mt-2 leading-relaxed">
        Calls <code className="text-primary-fixed/90">mintForTesting</code> on the deployed CLICK. Requires connected
        wallet to be <strong className="text-on-surface/90">owner()</strong>. Contract must include this function
        (redeploy after it was added).
      </p>
      <p className="mt-1 text-[10px] opacity-80">
        CLICK owner on-chain: {owner ?? "—"} · You: {address ?? "—"} ·{" "}
        {isOwner ? <span className="text-emerald-400/90">owner match</span> : <span className="text-amber-200/90">not owner</span>}
        {" · "}
        <span
          className={
            mintFlagReadError
              ? "text-amber-200/90"
              : mintForTestingOnChain
                ? "text-emerald-400/90"
                : "text-amber-200/90"
          }
        >
          mintForTestingEnabled:{" "}
          {mintFlagReadError
            ? "n/a (older bytecode)"
            : mintForTestingOnChain === undefined
              ? "…"
              : mintForTestingOnChain
                ? "yes"
                : "no"}
        </span>
        {wrongChain ? (
          <span className="text-amber-200/90"> · wrong chain (need Base Sepolia)</span>
        ) : null}
      </p>
      <label htmlFor="debug-mint-click-to" className="mt-3 block text-[10px] uppercase tracking-wider text-primary-fixed/70">
        Recipient (to)
      </label>
      <input
        id="debug-mint-click-to"
        value={toInput}
        onChange={(e) => setToInput(e.target.value)}
        className="mt-1 w-full border border-outline-variant/40 bg-black/60 px-2 py-1.5 font-mono text-[11px] text-primary-fixed"
        spellCheck={false}
        placeholder="0x…"
        autoComplete="off"
      />
      <label htmlFor="debug-mint-click-amount" className="mt-2 block text-[10px] uppercase tracking-wider text-primary-fixed/70">
        Amount (CLICK, human — e.g. 500000)
      </label>
      <input
        id="debug-mint-click-amount"
        value={amountHuman}
        onChange={(e) => setAmountHuman(e.target.value)}
        className="mt-1 w-full border border-outline-variant/40 bg-black/60 px-2 py-1.5 font-mono text-[11px] text-primary-fixed"
        spellCheck={false}
        placeholder="500000"
        inputMode="decimal"
        autoComplete="off"
      />
      <button
        type="button"
        disabled={
          !clickAddr ||
          !address ||
          !isOwner ||
          wrongChain ||
          (mintForTestingOnChain === false && !mintFlagReadError) ||
          isPending ||
          isConfirming
        }
        onClick={() => onMint()}
        className="mt-3 w-full border border-primary-fixed bg-primary-fixed/15 py-2 font-label text-[11px] font-bold uppercase tracking-widest text-primary-fixed hover:bg-primary-fixed/25 disabled:opacity-40"
      >
        {isPending || isConfirming ? "Confirm in wallet…" : "Mint CLICK (testnet)"}
      </button>
      {localError ? <p className="mt-2 text-amber-200/90">{localError}</p> : null}
      {writeError ? (
        <p className="mt-2 break-all text-amber-200/90">{writeError.message.slice(0, 280)}</p>
      ) : null}
      {isSuccess && hash ? (
        <p className="mt-2 break-all text-emerald-400/90">
          Sent: {hash}
        </p>
      ) : null}
    </div>
  );
}

/**
 * On-chain + wallet debug readout (moved off the main terminal for a minimal dashboard).
 */
export function DebugContractPanel() {
  const gameAddr = getGameAddress();
  const clickAddr = getClickAddress();
  const trophyAddr = getTrophyNftAddress();
  const { address } = useAccount();
  const chainId = useChainId();

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

  const { data: baseClickReward } = useReadContract({
    address: gameAddr,
    abi: clickMintGameAbi,
    functionName: "baseClickReward",
    query: { enabled: !!gameAddr },
  });

  const { data: clicksPerHashTier } = useReadContract({
    address: gameAddr,
    abi: clickMintGameAbi,
    functionName: "clicksPerHashTier",
    query: { enabled: !!gameAddr },
  });

  const { data: clickMaxSupply } = useReadContract({
    address: clickAddr,
    abi: clickTokenAbi,
    functionName: "maxSupply",
    query: { enabled: !!clickAddr },
  });

  const { data: clickTotalSupply } = useReadContract({
    address: clickAddr,
    abi: clickTokenAbi,
    functionName: "totalSupply",
    query: { enabled: !!clickAddr },
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

  const { data: unvestedWei } = useReadContract({
    address: clickAddr,
    abi: clickTokenAbi,
    functionName: "pendingVested",
    args: address ? [address] : undefined,
    query: { enabled: !!clickAddr && !!address },
  });

  const { data: claimable } = useReadContract({
    address: clickAddr,
    abi: clickTokenAbi,
    functionName: "claimable",
    args: address ? [address] : undefined,
    query: { enabled: !!clickAddr && !!address },
  });

  const { data: clickBalance } = useReadContract({
    address: clickAddr,
    abi: clickTokenAbi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!clickAddr && !!address },
  });

  const { data: gameHourNow } = useReadContract({
    address: gameAddr,
    abi: clickMintGameAbi,
    functionName: "gameHour",
    args: [BigInt(Math.floor(Date.now() / 1000))],
    query: { enabled: !!gameAddr },
  });

  const { data: potHourWei } = useReadContract({
    address: gameAddr,
    abi: clickMintGameAbi,
    functionName: "potEthByHour",
    args: gameHourNow !== undefined ? [gameHourNow] : undefined,
    query: { enabled: !!gameAddr && gameHourNow !== undefined },
  });

  const { data: potCarryWei } = useReadContract({
    address: gameAddr,
    abi: clickMintGameAbi,
    functionName: "potCarry",
    query: { enabled: !!gameAddr },
  });

  const gameLinkOk =
    gameClickTokenAddr !== undefined &&
    clickTokenLinkedGame !== undefined &&
    gameClickTokenAddr.toLowerCase() === clickAddr.toLowerCase() &&
    clickTokenLinkedGame.toLowerCase() === gameAddr.toLowerCase();

  const creditsWhole =
    credits !== undefined && clickCostCredits !== undefined && clickCostCredits > 0n
      ? formatWholeCredits(credits / clickCostCredits)
      : "—";

  return (
    <section className="mt-10 border border-outline-variant/40 bg-surface-container-low/80 p-4 font-mono text-[11px] leading-relaxed text-secondary md:text-xs">
      <h2 className="mb-3 font-label text-xs uppercase tracking-widest text-primary-fixed">On-chain / wallet</h2>
      <p>User: {address ?? "—"}</p>
      <p>ClickMintGame: {gameAddr}</p>
      <p>CLICK token: {gameClickTokenAddr ?? "—"}</p>
      <p>CLICK.game: {clickTokenLinkedGame ?? "(loading)"}</p>
      <p>Game link OK: {gameLinkOk ? "yes" : "NO — run CLICK.setGame(game)"}</p>
      <p>Credits (wei): {credits !== undefined ? credits.toString() : "—"}</p>
      <p>clickCostCredits (wei): {clickCostCredits !== undefined ? clickCostCredits.toString() : "—"}</p>
      <p>Click Credits (credits / cost): {creditsWhole}</p>
      <p>baseClickReward / click: {baseClickReward !== undefined ? `${formatEther(baseClickReward)} $CLICK` : "—"}</p>
      <p>clicksPerHashTier (game hour): {clicksPerHashTier !== undefined ? clicksPerHashTier.toString() : "—"}</p>
      <p>
        CLICK.maxSupply:{" "}
        {clickMaxSupply !== undefined
          ? `${formatEther(clickMaxSupply)} tokens · ${clickMaxSupply.toString()} wei`
          : "—"}
      </p>
      <p>CLICK.totalSupply: {clickTotalSupply !== undefined ? `${formatEther(clickTotalSupply)} $CLICK` : "—"}</p>
      <p>pendingVested (unvested): {unvestedWei !== undefined ? `${formatEther(unvestedWei)} $CLICK` : "—"}</p>
      <p>claimable: {claimable !== undefined ? `${formatEther(claimable)} $CLICK` : "—"}</p>
      <p>$CLICK balance (liquid): {clickBalance !== undefined ? `${formatEther(clickBalance)} $CLICK` : "—"}</p>
      <p>
        Chain: {clickmintChainLabel()} ({clickmintChainId()}) · connected {chainId}
      </p>
      <p title="Binary Trophy NFT (env)">
        Trophy NFT: {trophyAddr}
      </p>
      <p>
        potEthByHour (current game hour):{" "}
        {potHourWei !== undefined ? `${formatEther(potHourWei)} ETH · ${potHourWei.toString()} wei` : "—"}
      </p>
      <p>potCarry: {potCarryWei !== undefined ? `${formatEther(potCarryWei)} ETH` : "—"}</p>
      <p>gameHour (now): {gameHourNow?.toString() ?? "—"}</p>

      {clickAddr ? <TestnetMintClickSection clickAddr={clickAddr} /> : null}
    </section>
  );
}
