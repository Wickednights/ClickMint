import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { clickMintGameAbi } from "@/lib/abi";
import { getGameAddress } from "@/lib/addresses";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Vercel Cron: GET /api/cron/finalize-hour
 *
 * **Auth:** `Authorization: Bearer $CRON_SECRET` — Vercel injects this when `CRON_SECRET` exists on the
 * **same** deployment target as the cron (usually **Production**). If cron hits Production but secrets
 * are only set for Preview, you get 500 / Unauthorized.
 *
 * **Schedule:** Vercel cron has **minute** granularity only (no “15 seconds before the hour”). Also,
 * `finalizeHour` for the *previous* game hour is only valid **after** that hour ends plus **`RESET_BUFFER`
 * (20s)** — running *before* the top of the hour will revert (`GameFinalizeEarly`). Use a **1–2 minute**
 * cadence (or every minute) so the first successful run lands after the window opens.
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
    const pk = pkRaw.startsWith("0x") ? pkRaw : `0x${pkRaw}`;
    if (!/^0x[0-9a-fA-F]{64}$/.test(pk)) {
      return NextResponse.json(
        { error: "POT_KEEPER_PRIVATE_KEY must be 32-byte hex (0x + 64 hex chars)" },
        { status: 500 }
      );
    }

    const rpc =
      process.env.POT_KEEPER_RPC_URL?.trim() || process.env.NEXT_PUBLIC_QUICKNODE_RPC?.trim();
    if (!rpc) {
      return NextResponse.json(
        { error: "No RPC (set POT_KEEPER_RPC_URL or NEXT_PUBLIC_QUICKNODE_RPC on this deployment)" },
        { status: 500 }
      );
    }

    const gameAddr = getGameAddress();
    let account;
    try {
      account = privateKeyToAccount(pk as `0x${string}`);
    } catch {
      return NextResponse.json({ error: "Invalid POT_KEEPER_PRIVATE_KEY (failed to parse)" }, { status: 500 });
    }

    const transport = http(rpc);
    const publicClient = createPublicClient({ chain: baseSepolia, transport });
    const walletClient = createWalletClient({ account, chain: baseSepolia, transport });

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
      });
    }

    try {
      const hash = await walletClient.writeContract({
        address: gameAddr,
        abi: clickMintGameAbi,
        functionName: "finalizeHour",
        args: [targetHour],
      });
      return NextResponse.json({
        ok: true,
        targetHour: targetHour.toString(),
        txHash: hash,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return NextResponse.json({ error: msg.slice(0, 500) }, { status: 502 });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `keeper crash: ${msg.slice(0, 400)}` }, { status: 500 });
  }
}
