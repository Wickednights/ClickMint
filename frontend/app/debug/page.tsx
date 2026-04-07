import Link from "next/link";
import { headers } from "next/headers";
import { baseSepoliaDeployed, getClickAddress, getGameAddress } from "@/lib/addresses";

export const dynamic = "force-dynamic";

export default async function DebugPage() {
  const h = await headers();
  const host = h.get("host") ?? "—";
  const vercelEnv = process.env.VERCEL_ENV ?? "—";
  const gitSha = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "—";

  const game = getGameAddress();
  const click = getClickAddress();

  return (
    <main className="min-h-screen bg-black p-6 font-mono text-xs text-primary-container">
      <h1 className="mb-6 font-headline text-lg font-bold text-white">ClickMint // debug</h1>
      <ul className="space-y-2 text-secondary [&_strong]:text-primary-fixed">
        <li>
          <strong>Host</strong> {host}
        </li>
        <li>
          <strong>VERCEL_ENV</strong> {vercelEnv}
        </li>
        <li>
          <strong>Git (Vercel)</strong> {gitSha}
        </li>
        <li>
          <strong>NODE_ENV</strong> {process.env.NODE_ENV}
        </li>
        <li>
          <strong>Game</strong> {game}
        </li>
        <li>
          <strong>CLICK</strong> {click}
        </li>
        <li>
          <strong>Treasury</strong> {baseSepoliaDeployed.treasury}
        </li>
        <li>
          <strong>NEXT_PUBLIC_QUICKNODE_RPC</strong>{" "}
          {process.env.NEXT_PUBLIC_QUICKNODE_RPC ? "set" : "unset (fallback RPC in wagmi)"}
        </li>
      </ul>
      <p className="mt-8 max-w-xl text-[10px] leading-relaxed text-outline">
        If this page loads but <code className="text-primary-fixed">/</code> 404s, check App Router and layout.
        If everything 404s, set Vercel <strong className="text-white">Root Directory</strong> to{" "}
        <code className="text-primary-fixed">frontend</code> (recommended) or rely on root{" "}
        <code className="text-primary-fixed">vercel.json</code> build commands.
      </p>
      <Link className="mt-6 inline-block text-primary-fixed underline" href="/">
        ← Terminal
      </Link>
    </main>
  );
}
