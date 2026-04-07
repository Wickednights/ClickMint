# ClickMint — development log

Append-only record of substantive changes. **Maintenance:** after any change to contracts, frontend, scripts, or repo config, add a new entry at the bottom with UTC timestamp and a short bullet list.

Format:

```text
### YYYY-MM-DDTHH:MM:SSZ — short title
- ...
```

---

### 2026-04-07T08:06:37Z — Click Credits as whole numbers, $CLICK branding, on-chain deposit bonuses

- **`ClickMintGame.sol`:** `_depositBonusWei` — single-transaction deposit tiers add +1% … +10% extra credits (same wei unit as `credits`); `credits += v + bonus`; `Deposited` emits `creditsOut = v + bonus`.
- **`contracts/scripts/deploy.ts`:** `clickCostCredits = 1e18 / 350_000` (internal ~1¢/click at ~$3.5k ETH; tune via `setEconomy`); `baseClickReward = 5e18`.
- **`contracts/scripts/set-economy-round.ts`:** defaults aligned with deploy (`CLICK_COST` / `BASE_CLICK_REWARD`).
- **`frontend/lib/game-display.ts`:** `depositBonusWei`, `creditsGrantedOnDeposit`, `depositBonusLabel`, `clickCreditsFromDeposit`; `vestingVaultDisplay` / `claimableVaultDisplay` — whole-number $CLICK headlines/captions only (no fractional wei sublines); removed dust-step / deprecated helpers.
- **`clickmint-dashboard.tsx`:** primary stat = whole **Click Credits** (plays left); ETH only on deposit buttons + small “funded with … ETH equivalent” note; deposit grid shows ~credits + bonus label; CLICK hero above stats; larger body/labels in stats + POT block; toasts/table/debug token copy uses **$CLICK**; deposit success toast mentions tier bonus.
- **Note:** games deployed **before** this contract change do not grant bonuses on-chain until upgraded; UI bonus preview matches new contract logic.

### 2026-04-07T07:32:37Z — Open Graph / link preview (neon CLICK)

- Added `frontend/app/opengraph-image.tsx` (`next/og` ImageResponse) — 1200×630 preview matching neon CLICK tile; `dynamic = "force-dynamic"` to avoid prerender `Invalid URL` with `@vercel/og` on this stack.
- `frontend/app/layout.tsx`: `metadataBase`, `openGraph.images`, `twitter.card` + `twitter.images`; default site `https://clickmint-blue.vercel.app`, override with `NEXT_PUBLIC_SITE_URL`.
- `frontend/.env.example`: documented `NEXT_PUBLIC_SITE_URL`.

### 2026-04-07T07:20:18Z — Plays counter, pot copy, vesting display, economy script

- **Frontend `game-display.ts`:** `onChainPlaysRemaining` / `budgetStepsFromCredits` (bigint), `formatPlayCountBigint`, `formatClickWhole` (reward multiples + mCLICK + wei); removed float drift on “plays left”.
- **`clickmint-dashboard.tsx`:** optimistic `pendingClickDebit` so clicks countdown before refetch; “Click credits” primary stat; pot breakdown (`potEthByHour`, `potCarry`) + copy that clicks don’t fund pot; finalize note (no auto-settle; VRF ≠ scheduling); vesting uses `formatClickWhole`; `refetchPot` after deposit; debug pot lines.
- **`abi.ts`:** `potCarry`, `potEthByHour`.
- **Contracts:** `scripts/set-economy-round.ts` for owner `setEconomy` with round test defaults.
- **Docs:** `HOWTO.md`, `ARCHITECTURE.md` updated for POT funding and economy script.

### 2026-04-07T07:03:02Z — Documentation pack + README

- Added `docs/DEVELOPMENT_LOG.md` (this file), `docs/HOWTO.md`, `docs/ARCHITECTURE.md`, `docs/KNOWN_ISSUES.md`.
- Updated root `README.md` with links to docs and repo layout.
- Backfilled entries below summarize earlier work from prior sessions (timestamps approximate where not captured in git).

### 2026-04-06 … 2026-04-07 — Frontend UX, wallets, audio, vesting (summary)

- **Wagmi:** `metaMask`, `coinbaseWallet`, optional `walletConnect` (requires `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`), `injected` for browser wallets; single chain Base Sepolia.
- **Wallet UI:** `wallet-picker-dialog.tsx` — connect modal, sorted connectors, Base Sepolia `chainId` on connect.
- **Dashboard:** header BGM/SFX toggles; removed duplicate sidebar footer line; `WalletPickerDialog` wired; plays/credits copy via `lib/game-display.ts` (`DISPLAY_PLAY_ETH`, `formatPlayCount`); CLICK enabled on wrong chain to trigger network switch; all writes pass `chainId: baseSepolia.id`.
- **Audio:** `use-clickmint-audio.ts` switched to native `HTMLAudioElement` + paths under `/sounds/` (`button_click.mp3`, `cyberpunkbg.mp3`).
- **Peers:** added `@metamask/connect-evm`, `@walletconnect/ethereum-provider`, `@coinbase/wallet-sdk`; fixed Coinbase `preference` typing (removed invalid string).
- **Vesting / early spend:** clarified `pendingVested` = unvested (early-spend cap); reads for `baseClickReward`, `balanceOf`; client validation + `simulateContract` before `earlySpendPending`; refetches after click/claim/early-spend; banner when `baseClickReward === 0`; debug panel expanded.
- **Examples:** `frontend/.env.example` — `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` documented.

### Earlier (initial monorepo) — summary

- Hardhat project: `CLICK`, `ClickMintGame`, `Treasury`, `SecretPrizeWallet`, `BinaryTrophyNFT`, `Escrow`; deploy script `contracts/scripts/deploy.ts`; `set-game.ts` for CLICK↔game linking.
- Next.js 15 frontend: App Router, wagmi v3, dashboard, ABIs in `frontend/lib/abi.ts`, addresses from env.

---

## Index by area (manual)

| Area        | Notable files |
|------------|----------------|
| Contracts  | `contracts/contracts/*.sol`, `contracts/scripts/*.ts` |
| Frontend   | `frontend/components/clickmint-dashboard.tsx`, `frontend/lib/wagmi.ts`, `frontend/hooks/use-clickmint-audio.ts` |
| Config     | `contracts/hardhat.config.ts`, `frontend/.env.example`, root `.env.example` |
