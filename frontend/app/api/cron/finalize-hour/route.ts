import { NextRequest, NextResponse } from "next/server";
import { BaseError, createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base, baseSepolia } from "viem/chains";
import { clickMintGameAbi } from "@/lib/abi";
import { getGameAddress } from "@/lib/addresses";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function formatKeeperError(e: unknown): string {
  if (e instanceof BaseError) {
    const walk = [e.shortMessage, e.details];
    let c: unknown = e.cause;
    let depth = 0;
    while (c instanceof Error && depth++ < 5) {
      walk.push(c.message);
      c = "cause" in c ? (c as Error & { cause?: unknown }).cause : undefined;
    }
    return walk.filter(Boolean).join(" — ");
  }
  if (e instanceof Error) return e.message;
  return String(e);
}

function isBenignFinalizeRejection(msg: string): boolean {
  return (
    /GameFinalizeEarly|FinalizeEarly|too early|before cutoff/i.test(msg) ||
    /GameAlreadyFinalized|already finalized/i.test(msg)
  );
}

/**
 * Vercel Cron: GET /api/cron/finalize-hour
 *
 * **Auth:** `Authorization: Bearer $CRON_SECRET` — Vercel injects this when `CRON_SECRET` exists on the
 * **same** deployment target as the cron (usually **Production**). If cron hits Production but secrets
 * are only set for Preview, you get 500 / Unauthorized.
 *
 * **Schedule:** `1,6,11,16,21,26,31,36,41,46,51,56 * * * *` — first tick **:01** past each hour, then every **5 minutes**
 * so the previous game hour has multiple chances to settle. Vercel cron is minute granularity only (UTC); see
 * https://vercel.com/docs/cron-jobs
 *
 * **Transactions:** When `finalizeHour` is sent, the **keeper address** pays gas — check that wallet on BaseScan
 * (e.g. internal txs / latest). If this route returns **200** with `skipped`, no tx was broadcast.
 *
 * `finalizeHour` for the *previous* game hour is only valid **after** that hour ends plus **`RESET_BUFFER` (20s)**.
 *
 * @see docs/LP_AERODROME_AND_AUTOMATION.md
 */
export async function GET(request: NextRequest) {
  try {
    const expected = process.env.CRON_SECRET?.trim();
    if (!expected) {
      return NextResponse.json(
        { error: "CRON_SECRET is not set on this deployment (add for Production if cron runs on prod)" },
        { status: 500 }
      );
    }
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${expected}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const pkRaw = process.env.POT_KEEPER_PRIVATE_KEY?.trim() ?? "";
    const pkBody = pkRaw.replace(/^0x/i, "");
    const pk = `0x${pkBody}`;
    if (!/^0x[0-9a-fA-F]{64}$/.test(pk)) {
      return NextResponse.json(
        { error: "POT_KEEPER_PRIVATE_KEY must be 32-byte hex (0x + 64 hex chars)" },
        { status: 500 }
      );
    }

    const useMainnet = process.env.NEXT_PUBLIC_CHAIN_ID?.trim() === "8453";
    const viemChain = useMainnet ? base : baseSepolia;
    const rpc =
      process.env.POT_KEEPER_RPC_URL?.trim() ||
      (useMainnet
        ? process.env.NEXT_PUBLIC_BASE_MAINNET_RPC?.trim() || process.env.BASE_MAINNET_RPC_URL?.trim()
        : process.env.NEXT_PUBLIC_QUICKNODE_RPC?.trim());
    const defaultRpc = useMainnet ? "https://mainnet.base.org" : "https://sepolia.base.org";
    const rpcUrl = rpc || defaultRpc;

    const gameAddr = getGameAddress();
    let account;
    try {
      account = privateKeyToAccount(pk as `0x${string}`);
    } catch {
      return NextResponse.json({ error: "Invalid POT_KEEPER_PRIVATE_KEY (failed to parse)" }, { status: 500 });
    }

    const transport = http(rpcUrl);
    const publicClient = createPublicClient({ chain: viemChain, transport });
    const walletClient = createWalletClient({ account, chain: viemChain, transport });

    const nowSec = BigInt(Math.floor(Date.now() / 1000));
    const gameHourNow = await publicClient.readContract({
      address: gameAddr,
      abi: clickMintGameAbi,
      functionName: "gameHour",
      args: [nowSec],
    });

    if (gameHourNow === 0n) {
      return NextResponse.json({
        ok: true,
        skipped: "no previous game hour yet",
        gameHourNow: gameHourNow.toString(),
        keeper: account.address,
      });
    }

    const targetHour = gameHourNow - 1n;
    const finalized = await publicClient.readContract({
      address: gameAddr,
      abi: clickMintGameAbi,
      functionName: "hourFinalized",
      args: [targetHour],
    });

    if (finalized) {
      return NextResponse.json({
        ok: true,
        skipped: "already finalized",
        targetHour: targetHour.toString(),
        keeper: account.address,
      });
    }

    try {
      const { request: req } = await publicClient.simulateContract({
        account,
        address: gameAddr,
        abi: clickMintGameAbi,
        functionName: "finalizeHour",
        args: [targetHour],
      });
      const hash = await walletClient.writeContract(req);
      return NextResponse.json({
        ok: true,
        targetHour: targetHour.toString(),
        txHash: hash,
        keeper: account.address,
      });
    } catch (e) {
      const detail = formatKeeperError(e);
      if (isBenignFinalizeRejection(detail)) {
        return NextResponse.json({
          ok: true,
          skipped: "finalize not applicable yet (or race on finalized)",
          targetHour: targetHour.toString(),
          detail: detail.slice(0, 800),
          keeper: account.address,
        });
      }
      return NextResponse.json(
        {
          ok: false,
          error: detail.slice(0, 800),
          targetHour: targetHour.toString(),
          keeper: account.address,
          hint: `Check keeper native ETH on ${useMainnet ? "Base mainnet" : "Base Sepolia"}, on-chain potKeeper matches this address, game not paused, and winner can receive ETH (EOA). See Vercel Logs.`,
        },
        { status: 502 }
      );
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `keeper crash: ${msg.slice(0, 400)}` }, { status: 500 });
  }
}
