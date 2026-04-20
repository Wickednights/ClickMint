import type { ReactNode } from "react";
import Link from "next/link";

export const metadata = {
  title: "Game mechanics — ClickMint",
  description: "ClickMint rules, $CLICK token, minute POT, Block Bet, trophies, and parameters.",
};

export default function DocumentationPage() {
  return (
    <div className="min-h-screen bg-black text-on-surface">
      <div className="pointer-events-none fixed inset-0 grid-accent opacity-30" />
      <header className="sticky top-0 z-10 border-b border-outline-variant/30 bg-black/85 px-4 py-4 backdrop-blur-md md:px-8">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3">
          <Link
            href="/"
            className="font-headline text-sm font-bold uppercase tracking-[0.2em] text-primary-fixed transition-colors hover:text-white"
          >
            ← Terminal
          </Link>
          <span className="font-label text-[10px] uppercase tracking-widest text-secondary opacity-70">
            Documentation
          </span>
        </div>
      </header>

      <article className="relative z-[1] mx-auto max-w-3xl px-4 py-10 pb-24 md:px-8 md:py-14">
        <h1 className="font-headline text-3xl font-black uppercase tracking-tight text-white md:text-4xl">
          ClickMint Game Mechanics
        </h1>
        <p className="mt-4 font-headline text-lg text-primary-fixed md:text-xl">Click Fast. Earn Real. Win Epic.</p>
        <p className="mt-4 font-body text-sm leading-relaxed text-secondary md:text-base">
          Target product (see repo <span className="font-mono text-primary-fixed/90">docs/GAME_MECHANICS.md</span> for the full
          canonical spec): minute-long rounds on Base, ETH Click Pot, Block Bet on 46 fifteen-second windows per minute, and optional gasless
          clicks via Pimlico. Until your deployment catches up, treat on-chain values as{" "}
          <strong className="text-white">live</strong> and this page as <strong className="text-white">roadmap-aligned</strong>{" "}
          copy.
        </p>

        <Section id="how-to-play" title="How to Play">
          <ol className="mt-3 list-decimal space-y-3 pl-5 font-body text-sm leading-relaxed text-secondary md:text-base">
            <li>
              <strong className="text-white">Deposit ETH</strong> using the quick-buy buttons. You receive{" "}
              <strong className="text-primary-fixed">full advertised click credits</strong> (wei-based bookkeeping plus tier
              bonuses). Incoming ETH is split by on-chain BPS: <strong className="text-white">50%</strong> Click Pot accrual,{" "}
              <strong className="text-white">30%</strong> treasury, <strong className="text-white">10%</strong> Block Bet for that
              minute, <strong className="text-white">10%</strong> Binary Trophy <span className="font-mono">receive()</span> (NFT holder
              revshare; or treasury if unset).
            </li>
            <li>
              <strong className="text-white">Click the glowing button</strong>. Each click burns{" "}
              <span className="font-mono text-primary-fixed/90">clickCostCredits</span> and mints vesting $CLICK. On-chain pacing
              is per <strong className="text-white">L2 block</strong> (burst-friendly); the UI may add a short cooldown.
            </li>
            <li>
              <strong className="text-white">Block Bet (optional)</strong> — stake ETH on window{" "}
              <span className="font-mono text-primary-fixed/90">0..45</span> (slot <span className="font-mono">k</span> = seconds{" "}
              <span className="font-mono">k–(k+14)</span> in the minute).{" "}
              <span className="font-mono text-primary-fixed/90">finalizeRound</span> picks a winning window for the block bet
              separately from the POT’s four click quadrants.
            </li>
            <li>
              <strong className="text-white">Watch for trophies</strong> — random Binary Trophy NFT mints; holders accrue ETH
              via the NFT contract (<span className="font-mono text-primary-fixed/90">claimRevenue</span>).
            </li>
          </ol>
        </Section>

        <Section id="click-token" title="$CLICK Token">
          <ul className="mt-3 list-disc space-y-2 pl-5 font-body text-sm leading-relaxed text-secondary md:text-base">
            <li>
              Base reward (mainnet target): <strong className="text-white">1 $CLICK</strong> (
              <span className="font-mono">1e18</span> wei) per successful click into vesting; Clickhash difficulty can reject
              low-quality hashes.
            </li>
            <li>
              Total supply cap (mainnet target):{" "}
              <strong className="text-white">10,000,000,000 (10 billion) $CLICK</strong>
            </li>
            <li>1% transfer tax on every $CLICK movement (protocol treasury pattern)</li>
            <li>
              Vesting (mainnet target): newly minted $CLICK vests over <strong className="text-white">30 days</strong> (testnet
              uses short windows).
            </li>
          </ul>
          <h3 id="early-claim" className="mt-6 scroll-mt-24 font-headline text-sm uppercase tracking-widest text-primary-fixed">
            Early claim
          </h3>
          <p className="mt-2 font-body text-sm leading-relaxed text-secondary md:text-base">
            You can convert part of your <strong className="text-white">unvested</strong> balance into liquid tokens early.
            The amount is split 30 / 30 / 20 / 20 (burn / treasury / liquidity address / you) — see on-chain{" "}
            <span className="font-mono text-primary-fixed/90">CLICK</span> for exact rules.
          </p>
        </Section>

        <Section id="click-credits" title="Click Credits & Deposits">
          <ul className="mt-3 list-disc space-y-2 pl-5 font-body text-sm leading-relaxed text-secondary md:text-base">
            <li>
              Click cost is set from deploy economics (mainnet targets roughly <strong className="text-white">~$0.10 per click</strong>{" "}
              via ETH/USD assumptions in <span className="font-mono text-primary-fixed/90">economy.ts</span>).
            </li>
            <li>Quick-buy packs: 0.001 / 0.01 / 0.1 / 0.25 / 0.5 / 1 ETH</li>
            <li>Credits are wei-based; larger single deposits can earn bonus credits (tier table on-chain).</li>
          </ul>
        </Section>

        <Section id="pot" title="The CLICK POT (minute prize)">
          <ul className="mt-3 list-disc space-y-2 pl-5 font-body text-sm leading-relaxed text-secondary md:text-base">
            <li>Funded from the Pot BPS slice of each deposit (plus carry when no one wins).</li>
            <li>
              <strong className="text-white">Settlement</strong> — anyone authorized (owner or <span className="font-mono">potKeeper</span>)
              calls <span className="font-mono text-primary-fixed/90">finalizeRound(roundId)</span> after the minute ends plus a
              short buffer.
            </li>
            <li>
              Eligibility: at least <span className="font-mono">minPotClicks</span> in that round and at least one click in the{" "}
              <strong className="text-white">winning 15-second slot</strong> (0–3).
            </li>
            <li>Payout is native ETH to the winner; pseudo-randomness today — plan VRF for high-stakes production.</li>
          </ul>
        </Section>

        <Section id="block-bet" title="Block Bet">
          <ul className="mt-3 list-disc space-y-2 pl-5 font-body text-sm leading-relaxed text-secondary md:text-base">
            <li>
              Pool = carry-forward + 10% deposit slice for the round + explicit <span className="font-mono">placeBet</span>{" "}
              stakes on slots <span className="font-mono">0..45</span> (46 independent pools).
            </li>
            <li>
              Winning block-bet slot is <span className="text-white">0..45</span> (one 15s window). POT still uses four click
              quadrants <span className="font-mono">0..3</span>. Winners on the winning window split pro-rata; if unstaked,
              the pool carries.
            </li>
            <li>v1 is ETH-only on the game contract.</li>
            <li>
              If a winner payout cannot be pushed during settlement, ETH sits in{" "}
              <span className="font-mono text-primary-fixed/90">blockBetClaimableEth</span> until they call{" "}
              <span className="font-mono text-primary-fixed/90">claimBlockBetEth()</span>.
            </li>
          </ul>
        </Section>

        <Section id="trophies" title="Binary Trophy NFTs">
          <ul className="mt-3 list-disc space-y-2 pl-5 font-body text-sm leading-relaxed text-secondary md:text-base">
            <li>
              Capped collection (10k target); random drops from clicks use
              <span className="font-mono"> trophyDropWeight / TROPHY_ROLL_DENOM</span> (1e9 scale), tuned for ~75% supply
              pacing.
            </li>
            <li>On-chain metadata; revenue from royalties plus a small deposit share to <span className="font-mono">receive()</span>.</li>
          </ul>
        </Section>

        <Section id="difficulty" title="Dynamic Difficulty (Clickhash)">
          <ul className="mt-3 list-disc space-y-2 pl-5 font-body text-sm leading-relaxed text-secondary md:text-base">
            <li>Difficulty scales with global clicks per round (leading zero bits, capped).</li>
            <li>Tunes emission and NFT pace together with supply caps.</li>
          </ul>
        </Section>

        <Section id="endgame" title="Endgame">
          <p className="mt-3 font-body text-sm leading-relaxed text-secondary md:text-base">
            New $CLICK and trophy minting stop when protocol caps are reached (10B CLICK and trophy cap on-chain).
          </p>
        </Section>

        <Section id="testnet" title="Testnet">
          <p className="mt-1 text-[11px] font-medium uppercase tracking-wider text-amber-200/90">
            Base Sepolia — scaled parameters for fast iteration.
          </p>
          <ul className="mt-3 list-disc space-y-2 pl-5 font-body text-sm text-secondary md:text-base">
            <li>Lower supply cap, shorter vesting, and permissive click costs vs mainnet targets.</li>
            <li>Get ETH from the Coinbase Base Sepolia faucet and use the app with chain id 84532.</li>
          </ul>
        </Section>

        <p className="mt-12 border-t border-outline-variant/30 pt-8 font-body text-xs text-outline">
          Canonical numbers and BPS live in <span className="font-mono text-outline">docs/GAME_MECHANICS.md</span>. Operators can
          open <span className="font-mono text-outline">/debug</span> for raw contract values.
        </p>
      </article>
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="mt-12 scroll-mt-24">
      <h2 className="font-headline text-xl font-bold uppercase tracking-[0.12em] text-primary-fixed md:text-2xl">{title}</h2>
      {children}
    </section>
  );
}
