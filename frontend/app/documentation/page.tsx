import type { ReactNode } from "react";
import Link from "next/link";

export const metadata = {
  title: "Game mechanics — ClickMint",
  description: "ClickMint rules, $CLICK token, POT, trophies, and testnet parameters.",
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
          ClickMint is a fair, addictive on-chain clicker game on Base. Deposit ETH, smash the glowing CLICK button up to 2 times
          per second, and turn every tap into real value.
        </p>

        <Section id="how-to-play" title="How to Play">
          <ol className="mt-3 list-decimal space-y-3 pl-5 font-body text-sm leading-relaxed text-secondary md:text-base">
            <li>
              <strong className="text-white">Deposit ETH</strong> using the quick-buy buttons (0.001 / 0.01 / 0.1 / 0.25 / 0.5 /
              1 ETH). You receive <strong className="text-primary-fixed">full advertised click credits instantly</strong>. The
              protocol quietly takes a 3% fee split behind the scenes.
            </li>
            <li>
              <strong className="text-white">Click the big glowing button</strong> (maximum 2 clicks per second per wallet).
              Each click consumes 1 credit and mints $CLICK tokens.
            </li>
            <li>
              <strong className="text-white">Watch for surprises</strong> — mystery Binary Trophy NFTs and hourly CLICK POT
              wins.
            </li>
          </ol>
        </Section>

        <Section id="click-token" title="$CLICK Token">
          <ul className="mt-3 list-disc space-y-2 pl-5 font-body text-sm leading-relaxed text-secondary md:text-base">
            <li>
              Base reward: <strong className="text-white">10 $CLICK per click</strong> (dynamically reduced by Clickhash Rate
              difficulty)
            </li>
            <li>
              Total supply cap: <strong className="text-white">1,000,000,000 $CLICK</strong>
            </li>
            <li>1% transfer tax on every $CLICK movement (goes to protocol treasury)</li>
            <li>
              Vesting: All newly minted $CLICK goes to your <strong className="text-white">pending balance</strong> and fully
              vests over <strong className="text-white">7 days</strong>
            </li>
          </ul>
          <h3 className="mt-6 font-headline text-sm uppercase tracking-widest text-primary-fixed">Early Spend Option</h3>
          <p className="mt-2 font-body text-sm leading-relaxed text-secondary md:text-base">
            You can spend a large portion of your pending $CLICK immediately to discount future ETH deposits. Split on spent
            amount:
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5 font-body text-sm text-secondary md:text-base">
            <li>30% burned</li>
            <li>30% to treasury</li>
            <li>20% added to liquidity pool</li>
            <li>20% sent instantly to your wallet</li>
          </ul>
        </Section>

        <Section id="click-credits" title="Click Credits & Deposits">
          <ul className="mt-3 list-disc space-y-2 pl-5 font-body text-sm leading-relaxed text-secondary md:text-base">
            <li>
              Click cost: ~<strong className="text-white">1 cent per click</strong> (tuned dynamically)
            </li>
            <li>You can buy credits in convenient packs: 0.001 / 0.01 / 0.1 / 0.25 / 0.5 / 1 ETH</li>
            <li>
              You always receive the <strong className="text-white">full number of credits</strong> shown — the 3% protocol fee
              is absorbed automatically
            </li>
            <li>Higher tiers may include extra credits (visible on the deposit buttons)</li>
          </ul>
        </Section>

        <Section id="pot" title="The CLICK POT (Hourly Prize)">
          <ul className="mt-3 list-disc space-y-2 pl-5 font-body text-sm leading-relaxed text-secondary md:text-base">
            <li>Receives 1% of every ETH deposit + a portion of minted $CLICK</li>
            <li>
              <strong className="text-white">Pays out once every hour</strong>
            </li>
            <li>Eligibility: Must have clicked at least 100 times during the hour</li>
            <li>
              Winner selection: The contract secretly picks a random 15-minute window within the hour and chooses a random
              eligible player who was active in that window
            </li>
            <li>Payout happens after minute 59, with a ~20-second buffer before the hour ends to reset the pot cleanly</li>
            <li>Live toast notification appears instantly when someone wins</li>
            <li>History icon shows all previous hourly winners</li>
          </ul>
        </Section>

        <Section id="trophies" title="Binary Trophy NFTs">
          <ul className="mt-3 list-disc space-y-2 pl-5 font-body text-sm leading-relaxed text-secondary md:text-base">
            <li>
              Maximum <strong className="text-white">10,000 NFTs</strong> will ever exist
            </li>
            <li>Drop randomly during clicks (chance decreases with global difficulty)</li>
            <li>Each NFT is a unique glowing binary trophy with your exact win stats permanently on-chain</li>
            <li>Every NFT you own earns a permanent revenue share from protocol fees</li>
            <li>
              Hidden in every NFT&apos;s metadata is <strong className="text-white">one secret cipher fragment</strong>
            </li>
          </ul>
        </Section>

        <Section id="cipher" title="The Secret Cipher Prize">
          <ul className="mt-3 list-disc space-y-2 pl-5 font-body text-sm leading-relaxed text-secondary md:text-base">
            <li>1% of all $CLICK ever minted + 1% of all protocol revenue flows automatically into a secret prize wallet</li>
            <li>The 10,000 cipher fragments (one per NFT) form a complete Ottendorf Cipher</li>
            <li>Whoever assembles the full cipher gains access to the prize wallet and claims the entire accumulated cache</li>
            <li>This mechanic is completely secret until clues are released</li>
          </ul>
        </Section>

        <Section id="difficulty" title="Dynamic Difficulty (Clickhash Rate)">
          <ul className="mt-3 list-disc space-y-2 pl-5 font-body text-sm leading-relaxed text-secondary md:text-base">
            <li>BTC-style difficulty curve that increases with global clicking activity</li>
            <li>Prevents the entire supply or all NFTs from being minted too quickly</li>
            <li>Guarantees the full 1B $CLICK and 10k NFTs will take ~12+ months under realistic usage</li>
          </ul>
        </Section>

        <Section id="endgame" title="Endgame">
          <p className="mt-3 font-body text-sm leading-relaxed text-secondary md:text-base">
            Minting of new $CLICK and new NFTs completely stops{" "}
            <strong className="text-white">only after BOTH</strong> conditions are met:
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5 font-body text-sm text-secondary md:text-base">
            <li>10,000 Binary Trophy NFTs have been minted, and</li>
            <li>1,000,000,000 $CLICK have been minted</li>
          </ul>
          <p className="mt-3 font-body text-sm text-secondary">Season 2 can be planned afterward.</p>
        </Section>

        <Section id="testnet" title="Testnet Section">
          <p className="mt-1 text-[11px] font-medium uppercase tracking-wider text-amber-200/90">
            This section is for testing only.
          </p>
          <p className="mt-3 font-body text-sm leading-relaxed text-secondary md:text-base">
            On Base Sepolia testnet we use heavily scaled numbers so you can experience the full game loop quickly:
          </p>
          <ul className="mt-3 list-disc space-y-2 pl-5 font-body text-sm text-secondary md:text-base">
            <li>
              $CLICK total supply: <strong className="text-white">1,000,000</strong> (instead of 1B)
            </li>
            <li>
              NFT cap: <strong className="text-white">10</strong> (instead of 10,000)
            </li>
            <li>
              Vesting period: <strong className="text-white">10 minutes</strong> (instead of 7 days)
            </li>
            <li>All other mechanics (POT, difficulty, early spend, fees, etc.) behave exactly like mainnet</li>
          </ul>
          <h3 className="mt-6 font-headline text-sm uppercase tracking-widest text-primary-fixed">How to test</h3>
          <ul className="mt-2 list-disc space-y-2 pl-5 font-body text-sm text-secondary md:text-base">
            <li>Use the same Vercel link (it automatically points to testnet)</li>
            <li>
              Get free test ETH from{" "}
              <a
                href="https://www.coinbase.com/faucet"
                className="text-primary-fixed underline underline-offset-2 hover:text-white"
                rel="noopener noreferrer"
                target="_blank"
              >
                Coinbase Base Sepolia Faucet
              </a>
            </li>
            <li>Deposit small amounts and click rapidly</li>
            <li>Watch for hourly POT wins and NFT drops within minutes instead of hours/days</li>
          </ul>
          <p className="mt-4 font-body text-sm leading-relaxed text-secondary md:text-base">
            When we move to mainnet, the economy numbers will automatically switch to the full 1B / 10k / 7-day values.
          </p>
        </Section>

        <p className="mt-12 border-t border-outline-variant/30 pt-8 font-body text-xs text-outline">
          Parameters on the live testnet deployment may differ from this specification until mainnet launch. Use the{" "}
          <Link href="/debug" className="text-primary-fixed hover:underline">
            Debug
          </Link>{" "}
          page for raw contract values.
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
