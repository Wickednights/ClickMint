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
 * @see docs/LP_AERODROME_AND_AUTOMATION.md
 */
export async function GET(request: NextRequest) {
  const expected = process.env.CRON_SECRET?.trim();
  if (!expected) {
    return NextResponse.json({ error: "CRON_SECRET is not set" }, { status: 500 });
  }
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const pk = process.env.POT_KEEPER_PRIVATE_KEY?.trim();
  if (!pk?.startsWith("0x") || pk.length < 64) {
    return NextResponse.json({ error: "POT_KEEPER_PRIVATE_KEY missing or invalid" }, { status: 500 });
  }

  const rpc =
    process.env.POT_KEEPER_RPC_URL?.trim() || process.env.NEXT_PUBLIC_QUICKNODE_RPC?.trim();
  if (!rpc) {
    return NextResponse.json(
      { error: "No RPC (set POT_KEEPER_RPC_URL or NEXT_PUBLIC_QUICKNODE_RPC)" },
      { status: 500 }
    );
  }

  const gameAddr = getGameAddress();
  const account = privateKeyToAccount(pk as `0x${string}`);
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
}
