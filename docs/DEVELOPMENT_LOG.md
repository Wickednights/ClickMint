# ClickMint — development log

Append-only record of substantive changes. **Maintenance:** after any change to contracts, frontend, scripts, or repo config, add a new entry at the bottom with UTC timestamp and a short bullet list.

Format:

```text
### YYYY-MM-DDTHH:MM:SSZ — short title
- ...
```

---

### 2026-04-07T18:00:00Z — Base Sepolia redeploy (TESTNET_PRESET)

- **`DEPLOY_ECONOMY=testnet`** via Hardhat on **Base Sepolia**; RPC: **`QUICKNODE_RPC`** in `contracts/.env` (see `hardhat.config.ts` `baseSepolia.url`).
- **Addresses:** `CLICK` **0x6CB127e069D98F6A0B1851585670495DA93cB5D5**, `Treasury` **0x3B04A33D89F114185FF7194a1f8b13b086999471**, `SecretPrizeWallet` **0xB4BD710d5691Dbb7BF02791ddAd9f818F4a47Af5**, `ClickMintGame` **0xEA612843365Cc1B53f9FC6988d6edD54aeD84013**, `BinaryTrophyNFT` **0xE367E485fF1C2946d4435bab6649C576Ca526476**, `Escrow` **0x2457623b777DE271CDC9d9D37E3a93f19fcc5960**.
- **`frontend/.env.example`** + **`frontend/lib/addresses.ts`** defaults updated to match.
- **`deploy.ts`:** post-CLICK-deploy wait/retry so `maxSupply()` read succeeds on QuickNode (brief empty `eth_call` after create).

### 2026-04-06T12:00:00Z — Economy presets: explicit TESTNET vs MAINNET in `economy.ts`

- **`contracts/scripts/config/economy.ts`:** **`TESTNET_PRESET`** / **`MAINNET_PRESET`** — documented caps (`1M * 1e18` vs `100B * 1e18`), trophy supply (10 vs 10_000), vesting (600s vs 604_800s), `clicksPerHashTier`, and game economy fields; **`deployPresetFromEnv()`** for **`DEPLOY_ECONOMY`** with unknown-value warning; **`TESTNET_ECONOMY` / `MAINNET_ECONOMY`** derived from presets for **`set-economy-round.ts`**.
- **`deploy.ts`:** Uses **`deployPresetFromEnv()`**; comment lists preset summary.
- **`CLICK.sol` / `ClickMintGame.sol`:** NatSpec points at **`economy.ts`** presets.
- **Docs:** **`ECONOMY.md`**, **`POST_DEPLOY_VERIFICATION.md`**, **`HOWTO.md`**, **`contracts/scripts/config/README.md`** — tables for both modes; verification **`EXPECTED_MAX_SUPPLY_WEI`** for 1M vs 100B.
- **Frontend:** **`lib/economy-preset.ts`**, **`NEXT_PUBLIC_DEPLOY_ECONOMY`** in **`.env.example`**, header line on dashboard; **`game-display.ts`** module comment.
- **Build:** `npm run build` — **PASS** in **`contracts/`** and **`frontend/`** after this change.

### 2026-04-06T23:45:00Z — Redeploy polish: pause events, `isPaused`, verification script, docs

- **`ClickMintGame.sol`:** **`GamePaused` / `GameUnpaused`** (in addition to OZ **`Paused`/`Unpaused`**); **`isPaused()`** alias of **`paused()`**; NatSpec on **`finalizeHour`** expanded (owner-only MVP: MEV/grief + pseudo-random entropy; production → multisig/keeper/VRF); **`TrophyMintedViaGame`** after owner **`mintTrophyForPlayer`**.
- **`BinaryTrophyNFT.sol`:** NatSpec on **`setClickMintGame`** — documents **`ClickMintGameSet`** emission (event was already present).
- **Owner-facing events:** Confirmed **`CLICK`** setters (**`GameSet`**, **`TreasurySet`**, **`LpRecipientSet`**, **`VestingDurationSet`**), game admin events above, trophy **`ClickMintGameSet` / `TrophyMinted`**, treasury/secret **`Swept`**, escrow **`EscrowCreated` / `Claimed` / `Confetti`**.
- **`contracts/scripts/verify-deployment.ts`:** Read-only post-deploy checks (`maxSupply`, `CLICK.game`, game pause, token/trophy wiring); optional **`EXPECTED_MAX_SUPPLY_WEI`**; **`npm run verify:base-sepolia`** in **`contracts/package.json`**.
- **Docs:** **`POST_DEPLOY_VERIFICATION.md`**; updates across **`HOWTO`**, **`SYSTEM_VERIFICATION`**, **`ARCHITECTURE`**, **`ARCHITECTURE_FOR_GROK_REVIEW`**, **`WHERE_WE_ARE`**, **`KNOWN_ISSUES`**, **`ECONOMY`** (links + wording). Fixed **`SYSTEM_VERIFICATION`** typo and **`finalizeHour`** permission note (**owner-only**).
- **Grok (second pass):** Reviewer called out **strict supply cap** + **richer events** as materially improved; remaining production caveats unchanged (**VRF**, **audits**, **`finalizeHour`** ops model).
- **Build:** `npm run build` — **PASS** in **`contracts/`** and **`frontend/`** (2026-04-06).

### 2026-04-06T20:30:00Z — Grok follow-up: CLICK cap, events, pause, trophies, finalize

- **`CLICK.sol`:** Removed **`CLICKCap`**; **`CLICKBadSupply`** on **any** mint that would exceed **`maxSupply`** (strict **`_requireSupplyRoom` before every `_mint`**: sync vesting, claim, early spend, POT **`mint`**). **`ReentrancyGuard`** on **`grantVested`**, **`claimVested`**, **`earlySpendPending`**, **`mint`**. Events: **`GameSet`**, **`TreasurySet`**, **`LpRecipientSet`**, **`VestingDurationSet`**.
- **`ClickMintGame.sol`:** **`Pausable`** (`pause` / `unpause`), **`whenNotPaused`** on deposit / click / `setEconomy` / `setAddresses` / `setClickExecutor` / **`finalizeHour`**; **`EconomyUpdated`**, indexed **`AddressesUpdated`**, **`TrophyNftSet`**, **`PotCarrySwept`**. **`finalizeHour`** → **`onlyOwner`**. **`trophyNft`** + **`setTrophyNft`**; **`mintTrophyForPlayer`** (owner) → NFT. **`ownerSweepPotCarry`** stays callable when paused.
- **`BinaryTrophyNFT.sol`:** **`clickMintGame`** + **`setClickMintGame`**; **`mintTrophyForPlayer` onlyClickMintGame**; **`TrophyMinted`**, **`ClickMintGameSet`**; NatSpec on mint model.
- **`deploy.ts`:** **`setClickMintGame(game)`** + **`setTrophyNft(trophy)`** after deploy.
- **`frontend/lib/revert-reason.ts`:** **`CLICKCap` → `CLICKBadSupply`**, **`TrophyNotGame`**.
- **Docs:** **`ARCHITECTURE_FOR_GROK_REVIEW.md`**, **`ARCHITECTURE.md`** updated.

### 2026-04-06T18:10:00Z — Reviewer docs: Grok architecture + roadmap

- **`docs/ARCHITECTURE_FOR_GROK_REVIEW.md`:** End-to-end architecture for external review; clarifies **Pimlico is developer-billed** (user deposits are **not** diverted to Pimlico); optional future **protocol-funded sponsor vault** outline; diagrams, contract inventory, AA flow, hotspots.
- **`docs/WHERE_WE_ARE_AND_NEXT_STEPS.md`:** Current capability snapshot + suggested next steps (audit, VRF, deploy/env, Pimlico scale, optional gas vault, trophy, mainnet checklist).
- **`README.md`:** Links to both docs.

### 2026-04-06T16:45:00Z — Gasless clicks credit the EOA (`clickFor` + `setClickExecutor`)

- **`ClickMintGame.sol`:** Refactored `_click(player)` / `_deposit(creditTo, v)`; added **`clickFor(address player)`** (caller must be **`clickExecutor[player]`**), **`depositFor(address player)`**, **`setClickExecutor(address executor)`**, **`clickExecutor`** mapping, **`ClickExecutorSet`** event, **`GameBadExecutor`**.
- **`frontend/lib/account-abstraction.ts`:** Session call policy allows only **`clickFor`**; **`sendGaslessClick(client, game, player)`** encodes **`clickFor(player)`**; **`linkClickExecutor`** runs the EOA `setClickExecutor` tx after kernel bootstrap; removed sponsored **`deposit`** from the session (deposits stay normal EOA `deposit()` so users do not fund the smart account).
- **`use-gasless-click-session.ts`:** After Kernel + session install, **`waitForTransactionReceipt`** on **`setClickExecutor(smartAccount)`** before `ready`; **`gaslessClick(player)`** passes EOA address.
- **`clickmint-dashboard.tsx`:** On-chain reads always use **`address`** (EOA), not the smart account; gasless hero copy explains executor vs beneficiary; deposits always wagmi **`deposit()`**.
- **`gasless-session-dialog.tsx`**, **`revert-reason.ts`**, **`abi.ts`:** Copy + ABI + **`GameBadExecutor`** hint.

### 2026-04-09T20:00:00Z — Gasless clicks (ERC-4337): ZeroDev Kernel + session key + Pimlico

- **`lib/account-abstraction.ts`:** Kernel `0.3.3`, EntryPoint 0.7, `signerToEcdsaValidator` (owner) + `toPermissionValidator` / `toCallPolicy` / `toTimestampPolicy` (~30m) for **`click`** + **`deposit`**; `setPimlicoAsProvider` bundler URL; `serializePermissionAccount` → `deserializePermissionAccount` for session signing; sponsored `createKernelAccountClient` (`paymaster: true`).
- **`hooks/use-gasless-click-session.ts`:** session lifecycle, expiry sweep, `gaslessClick` / `gaslessDeposit`.
- **`components/gasless-session-dialog.tsx`:** one-shot enable copy.
- **`components/clickmint-dashboard.tsx`:** header status + Enable / Disable (superseded 2026-04-06: reads always EOA; gasless = `clickFor` only; no gasless deposit).
- **`next.config.ts` + `lib/wagmi-*-stub.ts`:** webpack replacements for unused **`baseAccount`** / **`porto`** wagmi exports so Next build does not pull `@base-org/account` / `porto`.
- **`.env.example`:** `NEXT_PUBLIC_PIMLICO_API_KEY`.
- **Note:** `@pimlico/sdk` is not an npm package; Pimlico is used via HTTPS RPC + provider flag per ZeroDev docs.

### 2026-04-06T22:30:00Z — Economy presets: testnet readable counts, mainnet ~1¢/click

- **`contracts/scripts/config/economy.ts`:** **TESTNET** default `clickCostCredits = 1e13` wei (~100 clicks per 0.001 ETH); **MAINNET** = `1e18/(MAINNET_ETH_USD×100)` (~1¢/click at $3.5k ETH). Shared **`DEFAULT_CLICK_PER_ETH_WEI`** / **`DEFAULT_BASE_CLICK_REWARD`**.
- **`contracts/scripts/deploy.ts`:** **`DEPLOY_ECONOMY=mainnet`** for production-style params; default **testnet**.
- **`contracts/scripts/set-economy-round.ts`:** **`ECONOMY=testnet|mainnet`** presets + optional raw overrides.
- **`docs/ECONOMY.md`:** Explains wei credits, why 1 wei blows up the UI, $1M nuance vs token cap, file pointers.

### 2026-04-06T18:00:00Z — Production polish: credits UX, debug unlinked, verification doc

- **`clickmint-dashboard.tsx`:** Removed optimistic debit race; **Click Credits** follow `credits / clickCostCredits` after `waitForTransactionReceipt` + batched refetch; **claimVested** waits for receipt then refetches; dropped **post-click 500ms cooldown** (kept 500ms client guard + `writePending` to avoid misleading “RATE LIMIT” spike after a successful click); deposit footnote points to **`set-economy-round.ts`**; **`keepPreviousData`** on vesting reads to reduce claimable flicker; hero **CLICK** above collapsible deposit; no Debug in sidebar/footer (prior change).
- **`wallet-picker-dialog.tsx`:** Connect buttons **`disabled={isPending}`** only; **`DialogDescription`**; **`console.error`** on connect failure (connectors no longer blocked when `ready === false`).
- **`app/documentation/page.tsx`:** No **`Link` to `/debug`** — text-only note that `/debug` is typed manually.
- **`docs/SYSTEM_VERIFICATION.md`:** Owner/player checklist (config, deposit, click, vesting, POT, wallets, economy tuning) + template for what to paste back after deploy.

### 2026-04-07T08:21:10Z — Minimal terminal UI, /documentation mechanics, Debug panel, credit formatting

- **`game-display.ts`:** `formatWholeCredits` (full grouped integers, no `T+`); `isTinyClickCostWei` — flag when `clickCostCredits` is far below cent-scale (typical 1-wei test misconfig); `formatPlayCountBigint` kept for non-credit abbreviations.
- **`app/documentation/page.tsx`:** public mechanics doc (user-provided rules: play flow, $CLICK, POT, trophies, cipher, difficulty, endgame, testnet).
- **`components/debug-contract-panel.tsx`:** client wagmi readout (credits, costs, vesting, pot lines, game link); embedded from **`app/debug/page.tsx`** with links to Terminal + Documentation.
- **`clickmint-dashboard.tsx`:** deposit as **collapsible** “Add credits (ETH)”; stripped stats/POT/footer copy; removed main-page debug block; sidebar **Documentation** + **Debug** (`Link` to `/documentation`, `/debug`); header **Docs**; `formatWholeCredits` for all credit counts; banner when tiny click cost; removed unused POT hour/refetch noise + `balanceOf` read; POT bar + “How the POT works” link; localStorage last-click timestamp removed.

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
