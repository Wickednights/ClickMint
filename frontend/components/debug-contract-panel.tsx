"use client";

import { useAccount, useChainId, useReadContract } from "wagmi";
import { formatEther } from "viem";
import { baseSepolia } from "wagmi/chains";
import { clickMintGameAbi, clickTokenAbi } from "@/lib/abi";
import { getClickAddress, getGameAddress, getTrophyNftAddress } from "@/lib/addresses";
import { formatWholeCredits } from "@/lib/game-display";

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
      <p>Click Credits (credits ÷ cost): {creditsWhole}</p>
      <p>baseClickReward / click: {baseClickReward !== undefined ? `${formatEther(baseClickReward)} $CLICK` : "—"}</p>
      <p>pendingVested (unvested): {unvestedWei !== undefined ? `${formatEther(unvestedWei)} $CLICK` : "—"}</p>
      <p>claimable: {claimable !== undefined ? `${formatEther(claimable)} $CLICK` : "—"}</p>
      <p>$CLICK balance (liquid): {clickBalance !== undefined ? `${formatEther(clickBalance)} $CLICK` : "—"}</p>
      <p>
        Chain: Base Sepolia ({baseSepolia.id}) · connected {chainId}
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
    </section>
  );
}
