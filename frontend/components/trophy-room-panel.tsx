"use client";

import { useQuery } from "@tanstack/react-query";
import type { Address } from "viem";
import { usePublicClient } from "wagmi";
import { clickmintChainId } from "@/lib/clickmint-chain";
import { binaryTrophyAbi } from "@/lib/abi";
import type { TrophyMintLogRow } from "@/lib/trophy-mints";
import { cn } from "@/lib/utils";

const BASE_SEPOLIA_NFT = "https://sepolia.basescan.org/nft";

function decodeTokenImage(dataUri: string): string | null {
  if (!dataUri.startsWith("data:application/json")) return null;
  const i = dataUri.indexOf("base64,");
  if (i === -1) return null;
  try {
    const json = JSON.parse(atob(dataUri.slice(i + 7))) as { image?: string };
    return typeof json.image === "string" ? json.image : null;
  } catch {
    return null;
  }
}

export function TrophyThumbnail({
  trophyAddr,
  tokenId,
  className,
}: {
  trophyAddr: Address;
  tokenId: bigint;
  className?: string;
}) {
  const publicClient = usePublicClient({ chainId: clickmintChainId() });

  const { data: src = null } = useQuery({
    queryKey: ["trophyTokenUri", trophyAddr, tokenId.toString()],
    queryFn: async () => {
      if (!publicClient) return null;
      const uri = await publicClient.readContract({
        address: trophyAddr,
        abi: binaryTrophyAbi,
        functionName: "tokenURI",
        args: [tokenId],
      });
      return decodeTokenImage(uri);
    },
    enabled: !!publicClient,
    staleTime: Number.POSITIVE_INFINITY,
  });

  if (!src) {
    return (
      <div
        className={cn(
          "flex h-full w-full items-center justify-center bg-surface-container-high/80 font-mono text-[10px] text-secondary",
          className
        )}
      >
        …
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- data: URLs from on-chain metadata; next/image unsuitable
    <img
      src={src}
      alt=""
      className={cn("h-full w-full object-cover", className)}
      loading="lazy"
      decoding="async"
    />
  );
}

/** Full trophy grid for Trophy room tab (on-chain history). */
export function TrophyRoomGrid({ trophyAddr, rows }: { trophyAddr: Address; rows: TrophyMintLogRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="font-body text-[11px] leading-relaxed text-secondary opacity-80">
        No Binary Trophy mints found in the indexed block range. If your RPC limits logs, set{" "}
        <code className="text-primary-fixed/90">NEXT_PUBLIC_TROPHY_DEPLOY_BLOCK</code> in env to the contract creation
        block on Base Sepolia.
      </p>
    );
  }

  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {rows.map((r) => (
        <li
          key={r.key}
          className="overflow-hidden rounded border border-amber-500/30 bg-black/40 shadow-[0_0_20px_rgba(251,191,36,0.06)]"
        >
          <a
            href={`${BASE_SEPOLIA_NFT}/${trophyAddr}/${r.tokenId.toString()}`}
            target="_blank"
            rel="noreferrer"
            aria-label={`Binary Trophy #${r.tokenId.toString()} — view on BaseScan`}
            className="block aspect-square w-full overflow-hidden bg-[#0b0f14]"
          >
            <TrophyThumbnail trophyAddr={trophyAddr} tokenId={r.tokenId} />
          </a>
          <div className="space-y-1 p-2 font-mono text-[10px] leading-tight text-secondary">
            <div className="font-label uppercase tracking-wider text-amber-200/90">#{r.tokenId.toString()}</div>
            <div className="truncate text-primary-fixed/90" title={r.to}>
              {r.to.slice(0, 6)}…{r.to.slice(-4)}
            </div>
            <div className="text-[9px] opacity-80">
              {r.totalClicks.toString()} clicks · frag {r.fragmentSlot}
              {r.viaGame ? "" : " · admin"}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Sidebar: last N trophy winners (on-chain). */
export function SidebarRecentTrophies({
  trophyAddr,
  rows,
  max = 5,
}: {
  trophyAddr: Address;
  rows: TrophyMintLogRow[];
  max?: number;
}) {
  const shown = rows.slice(0, max);
  return (
    <div className="border-t border-outline-variant/20 pt-4">
      <h3 className="mb-2 text-center font-headline text-xs font-bold uppercase tracking-[0.2em] text-amber-200/90">
        Recent trophies
      </h3>
      {shown.length === 0 ? (
        <p className="text-center font-body text-[11px] leading-snug text-secondary">
          No trophies in range yet — mint from lucky clicks.
        </p>
      ) : (
        <ul className="space-y-2">
          {shown.map((r) => (
            <li
              key={r.key}
              className="flex items-center gap-2 rounded border border-amber-500/25 bg-amber-500/[0.06] px-2 py-2"
            >
              <div className="h-10 w-10 shrink-0 overflow-hidden rounded border border-amber-500/20 bg-[#0b0f14]">
                <TrophyThumbnail trophyAddr={trophyAddr} tokenId={r.tokenId} className="!h-10 !w-10" />
              </div>
              <div className="min-w-0 flex-1 text-left">
                <div className="font-label text-[9px] uppercase tracking-wider text-secondary">
                  Token #{r.tokenId.toString()}
                </div>
                <div className="truncate font-mono text-[10px] text-amber-100/95" title={r.to}>
                  {r.to.slice(0, 6)}…{r.to.slice(-4)}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
