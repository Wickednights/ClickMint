# ClickMint — known issues & verification checklist

Use this as a living QA list. Update checkboxes as you verify. **Maintenance:** when you fix an item, check it off and add a one-line note + date in `DEVELOPMENT_LOG.md`.

---

## Legend

- [ ] Not verified / open  
- [x] Verified working (add date in log when marking)  
- [!] Known broken or limited  

---

## Core on-chain loop

| Status | Item | Notes |
|--------|------|--------|
| [ ] | POT shows 0 with many clicks | **Expected** if no `deposit()` in *current* game hour — only deposits add to `potEthByHour`; see Architecture. |
| [ ] | Hour / winner “auto” | **`finalizeHour` is not cron by default** — run manually or set **`potKeeper`** to a Gelato/Automation relay (see **`docs/LP_AERODROME_AND_AUTOMATION.md`**). VRF = randomness upgrade, not scheduling. |
| [ ] | `deposit()` credits user and splits fees | Verify on Base Sepolia with small ETH. |
| [ ] | `click()` deducts credits when `clickCostCredits > 0` | Deploy script used `0` in sample; retest if owner changes economy. |
| [ ] | `click()` grants vesting when `baseClickReward > 0` | If reward is `0`, UI correctly shows no unvested from clicks. |
| [ ] | `finalizeHour()` after buffer | Needs enough clicks + window eligibility; min clicks constant in contract. |
| [ ] | `CLICK.setGame(game)` matches deployed game | Run `set-game.ts` if needed; frontend “Game link OK” must be yes. |
| [ ] | Post-deploy script | Run **`npm run verify:base-sepolia`** (or `hardhat run scripts/verify-deployment.ts`) with deployed addresses; optional **`EXPECTED_MAX_SUPPLY_WEI`** for 100B mainnet cap — see **`docs/POST_DEPLOY_VERIFICATION.md`**. |

## CLICK token & vesting

| Status | Item | Notes |
|--------|------|--------|
| [ ] | `claimVested()` mints after time elapsed | Testnet vesting duration set in CLICK constructor (e.g. 10 min). |
| [ ] | `earlySpendPending` only when `amount <= pendingVested` | Wallets often show “User rejected” on revert; UI now validates and explains. |
| [ ] | POT winner receives **liquid** `mint`, not vault | Different path from `grantVested`. |

## Frontend

| Status | Item | Notes |
|--------|------|--------|
| [ ] | Connect modal: MetaMask / Coinbase / injected / WalletConnect | WC needs project ID in env. |
| [ ] | Network switch to Base Sepolia | CLICK button enabled on wrong chain to prompt switch. |
| [ ] | Plays / credits display readable | Uses `formatPlayCount` + `DISPLAY_PLAY_ETH`; not raw wei division for “plays”. |
| [ ] | Audio after user gesture | `/sounds/*.mp3` in `public/sounds/`. |
| [ ] | Debug panel matches chain state | Credits, `baseClickReward`, unvested, claimable, balance. |

## Build / tooling

| Status | Item | Notes |
|--------|------|--------|
| [ ] | `frontend/npm run build` | May warn on optional `@wagmi/connectors` re-exports (Safe/Porto/Base Account). |
| [ ] | `contracts/hardhat compile` | |

## Not implemented / out of scope (MVP)

| Item | Notes |
|------|--------|
| Gasless clicks | **In repo:** Pimlico + ZeroDev Kernel session + `clickFor` — see `frontend/lib/account-abstraction.ts`, **`docs/TESTNET_E2E_CHECKLIST.md`** Part B. |
| One signature for **many** clicks in one tx | Not supported; each gasless click is one sponsored UserOp. |
| On-click trophy drops | **`_click`** may mint via **`trophyDropWeight`** (deploy / `setTrophyDropWeight`). **Owner** can still use **`mintTrophyForPlayer`** or NFT **`mint`**. New game deploy: **`npm run deploy-game:base-sepolia`**. |
| Trophy **IPFS** metadata | **`tokenURI`** is on-chain **data URI** (JSON + SVG), not `ipfs://`. Optional IPFS/images are **post-MVP** if you change metadata design. |
| Production VRF | POT (and trophy roll entropy) use pseudo-random; upgrade for mainnet fairness. |
| Escrow | Standalone contract (not invoked by `ClickMintGame`). Terminal tab supports deposit/claim; set **`Escrow`** in env / `addresses.ts`. |

## Quick smoke test (manual)

1. [ ] Set env addresses to deployed Base Sepolia contracts.  
2. [ ] Connect wallet; switch to Base Sepolia if prompted.  
3. [ ] Deposit small ETH; credits increase.  
4. [ ] Click; credits decrease if cost > 0; unvested increases if `baseClickReward > 0`.  
5. [ ] Early spend: amount ≤ unvested, or expect clear UI error.  
6. [ ] Claim after vesting window if applicable.  

---

When closing items here, append to `docs/DEVELOPMENT_LOG.md`:

`### ISO8601 — QA: verified <short item>`
