# ClickMint — Base Sepolia end-to-end checklist (ordered)

Work **top to bottom**. For each step, record **PASS / FAIL**, **tx hash** (if any), and **Basescan** links. Do **not** paste private keys, seeds, or full API keys into chat.

**Related:** [POST_DEPLOY_VERIFICATION.md](./POST_DEPLOY_VERIFICATION.md) (automated reads), [SYSTEM_VERIFICATION.md](./SYSTEM_VERIFICATION.md) (condensed tables).

---

## Part A — Preconditions (before UI testing)

| Step | Action | Pass? |
|------|--------|-------|
| A.1 | Confirm **`frontend/.env.local`** (or **`frontend/.env`**) has **`NEXT_PUBLIC_GAME_ADDRESS`**, **`NEXT_PUBLIC_CLICK_ADDRESS`**, and matches your deployment (defaults in `frontend/lib/addresses.ts` if unset). | |
| A.2 | Optional: set **`NEXT_PUBLIC_TREASURY_ADDRESS`**, **`NEXT_PUBLIC_SECRET_WALLET_ADDRESS`**, **`NEXT_PUBLIC_TROPHY_NFT_ADDRESS`**, **`NEXT_PUBLIC_ESCROW_ADDRESS`** for full explorer coverage. | |
| A.3 | **`NEXT_PUBLIC_QUICKNODE_RPC`** (or rely on public Base Sepolia RPC). Pimlico + wagmi need a reliable JSON-RPC. | |
| A.4 | From **`contracts/`**, run **`npm run verify:base-sepolia`** (or `hardhat run scripts/verify-deployment.ts`) with **`CLICK_ADDRESS`**, **`GAME_ADDRESS`**, **`TROPHY_ADDRESS`**, and testnet **`EXPECTED_MAX_SUPPLY_WEI=1000000000000000000000000`**. All checks must pass. | |
| A.5 | Fund your test wallet with **Base Sepolia ETH** (faucet). You need gas for: deposits, EOA clicks, **`setClickExecutor`** (one-time for gasless), claims, owner ops. | |
| A.6 | **New `ClickMintGame` only (same CLICK + trophy):** from **`contracts/`**, set **`CLICK_ADDRESS`**, **`TROPHY_ADDRESS`**, **`TREASURY_ADDRESS`**, **`SECRET_WALLET_ADDRESS`**, then **`npm run deploy-game:base-sepolia`**. Updates **`CLICK.game`**, **`trophy.clickMintGame`**, and **`game.setTrophyNft`**. **All player credits and hour/POT state on the old game are left behind** — testers re-deposit on the new game. Point **`NEXT_PUBLIC_GAME_ADDRESS`** at the new game and re-run **A.4**. | |

---

## Part B — Pimlico: sponsorship policy (gasless clicks)

The app sponsors **ERC-4337 UserOperations** through Pimlico. Your policy controls **who** gets free gas and **which contracts** may be called.

### B.1 Dashboard and API key

1. Open **[Pimlico Dashboard](https://dashboard.pimlico.io)** and create or select a project.
2. Create an **API key** (or use an existing one).
3. Put the key in **`frontend/.env.local`** as **`NEXT_PUBLIC_PIMLICO_API_KEY`** (rebuild / restart dev server after changes).

### B.2 Chain toggles (match your testing)

- Turn **Enable testnet chains** **ON** (required for **Base Sepolia**, chain id **84532**).
- If you are **only** testing Base Sepolia, consider turning **Enabled for all mainnet chains** **OFF** so you do not accidentally sponsor mainnet traffic under the same policy.

### B.3 Create the sponsorship policy (form you screenshotted)

1. **Name** — e.g. `ClickMint Base Sepolia`.
2. **Description** — short note: “Sponsor Kernel smart-account UserOps for ClickMint `clickFor` on Base Sepolia only.”
3. **Start / end dates** — optional; leave open for dev, or set an end date for safety.
4. **Limits (recommended)** — enable **Per User Operation Maximums** and/or **Global Maximums** with small testnet USD caps so a bug cannot drain sponsorship.
5. **Contract restrictions (security)**  
   - **First-time setup:** leave **Contract restrictions** **OFF** until you have completed **one full** gasless flow (deploy smart account + link executor + one sponsored `clickFor`). Restrictions are strict: the **first** UserOp may interact with **Kernel / factory** contracts, not only the game.  
   - **After it works:** turn **Contract restrictions** **ON** and add at least your deployed **`ClickMintGame`** address (the `clickFor` target). If sponsorship starts failing on **account deployment**, open Pimlico’s rejected UserOp logs and add any additional **to** addresses they show (often factory/bootstrap contracts), or temporarily widen the list.  
   - Do **not** assume IPFS or off-chain URLs matter here — restrictions are **contract addresses** on-chain.
6. Click **Create Policy** and copy the **policy id** into **`NEXT_PUBLIC_PIMLICO_SPONSORSHIP_POLICY_ID`** in **`frontend/.env.local`** (required if `pm_getPaymasterData` errors without context).

### B.4 Frontend env summary (gasless)

| Variable | Purpose |
|----------|---------|
| **`NEXT_PUBLIC_PIMLICO_API_KEY`** | Pimlico RPC (`api.pimlico.io/v2/84532/...`). |
| **`NEXT_PUBLIC_PIMLICO_SPONSORSHIP_POLICY_ID`** | Passed as paymaster **context** for sponsorship (from policy you created). |

### B.5 Verify gasless after policy exists

| Step | Action | Pass? |
|------|--------|-------|
| B.5.1 | Connect wallet on **Base Sepolia**. | |
| B.5.2 | Open **Enable gasless clicks** → **Sign & enable** → complete **smart account deploy** UserOp (wallet may prompt once). | |
| B.5.3 | Approve **EOA** tx **`setClickExecutor(smartAccount)`** on the game (uses normal gas). | |
| B.5.4 | Click **CLICK** with gasless active — should **not** prompt wallet for each click; Basescan shows txs from the **smart account** calling **`clickFor(your EOA)`**. | |
| B.5.5 | In Pimlico dashboard, confirm UserOps are **accepted** (not rejected by policy). | |

---

## Part C — Block explorer baseline (every contract)

Use **Base Sepolia** explorer: `https://sepolia.basescan.org/address/<0x…>`

| Step | Contract | Address source | What to verify |
|------|----------|----------------|----------------|
| C.1 | **CLICK** | `NEXT_PUBLIC_CLICK_ADDRESS` | Contract is verified (if you verified); **Read**: `game`, `maxSupply`, `vestingDuration`. |
| C.2 | **ClickMintGame** | `NEXT_PUBLIC_GAME_ADDRESS` | **Read**: `clickToken`, `paused` / `isPaused`, `trophyNft`, `treasury`, `secretWallet`, economy getters. |
| C.3 | **BinaryTrophyNFT** | trophy from game or env | **Read**: `clickMintGame`, `maxSupply`, royalty info. |
| C.4 | **Treasury** | env or deploy log | Contract exists; optional **Read** owner. |
| C.5 | **SecretPrizeWallet** | env or deploy log | Contract exists. |
| C.6 | **Escrow** | env or deploy log | Contract exists; Terminal tab includes **Escrow** (deposit / claim) when addresses are set. |
| C.7 | **Your EOA** | wallet | Native ETH balance decreases with txs; token balances for **CLICK** if applicable. |
| C.8 | **Smart account** (if gasless) | shown in UI after enable | Shows as **contract** address; has no CLICK credits — credits stay on **EOA** by design. |

---

## Part D — Site walkthrough (strict order)

### D.1 Landing / shell

| Step | Action | Expected | Pass? |
|------|--------|----------|-------|
| D.1.1 | Open `/` | Dashboard loads; no red error overlay. | |
| D.1.2 | Check header / network hint | Matches **testnet** if `NEXT_PUBLIC_DEPLOY_ECONOMY=testnet`. | |
| D.1.3 | Open **`/documentation`** | Mechanics page loads; note copy may describe **mainnet-style** numbers — **on-chain testnet** values come from deploy (`ECONOMY.md` / `economy.ts`). | |

### D.2 Connect and network

| Step | Action | Expected | Pass? |
|------|--------|----------|-------|
| D.2.1 | **Connect** (MetaMask / Coinbase / injected) | Modal works; address shows in UI. | |
| D.2.2 | Wrong chain | App prompts to switch to **Base Sepolia** (`84532`). | |
| D.2.3 | **WalletConnect** | Only if **`NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`** set **before build**; QR flow opens. | |
| D.2.4 | Disconnect and reconnect | Works without full page reload. | |

### D.3 On-chain “game link” sanity| Step | Action | Expected | Pass? |
|------|--------|----------|-------|
| D.3.1 | UI “CLICK token linked to game” (or equivalent) | **Yes** — `CLICK.game` == game address. If **no**, owner runs **`set-game.ts`** / `CLICK.setGame`. | |

### D.4 Deposits (ETH → credits)

| Step | Action | Expected | Pass? |
|------|--------|----------|-------|
| D.4.1 | Smallest deposit button (e.g. **0.001 ETH**) | Tx succeeds; **credits** increase after receipt. | |
| D.4.2 | Basescan | **`deposit`** on **game** contract; ETH moved per fee split. | |
| D.4.3 | Wrong network attempt | Deposit path blocked or prompts switch. | |

### D.5 Clicks (EOA path)

| Step | Action | Expected | Pass? |
|------|--------|----------|-------|
| D.5.1 | Single **CLICK** | Wallet signs **one** tx; after mining, credits decrease (if `clickCostCredits` > 0) and stats update. | |
| D.5.2 | Rapid double-click | Client **cooldown** ~500ms; chain allows **max 2 clicks per block** per wallet. | |
| D.5.3 | Basescan | **`click`** or **`clickWithHash`** (per ABI) on game from **EOA**. | |

### D.6 Gasless path (after Part B)

| Step | Action | Expected | Pass? |
|------|--------|----------|-------|
| D.6.1 | Enable session (Part B.5). | | |
| D.6.2 | Click with gasless **ready** | Sponsored UserOp; fallback to EOA if Pimlico fails (toast message). | |
| D.6.3 | Basescan | **`clickFor`** on game **from smart account**; `player` arg = your **EOA**. | |

### D.7 $CLICK vesting and claim

| Step | Action | Expected | Pass? |
|------|--------|----------|-------|
| D.7.1 | After clicks with **`baseClickReward` > 0** | **Unvested** / pending increases. If **`baseClickReward` == 0**, no vesting from clicks — tune with **`set-economy-round.ts`**. | |
| D.7.2 | Wait **vesting duration** (testnet often **10 minutes** in preset — confirm `CLICK.vestingDuration()` on explorer). | **Claimable** > 0 when vested. | |
| D.7.3 | **Claim vested** | Tx succeeds; wallet **CLICK** balance increases after receipt. | |
| D.7.4 | Basescan | Interaction on **CLICK** token (`claimVested` or equivalent per ABI). | |

### D.8 Early spend (if shown in UI)

| Step | Action | Expected | Pass? |
|------|--------|----------|-------|
| D.8.1 | Amount **>** unvested | Clear error or revert; no silent failure. | |
| D.8.2 | Amount **≤** unvested | Tx succeeds per token rules. | |

### D.9 Hourly POT and settlement

| Step | Action | Expected | Pass? |
|------|--------|----------|-------|
| D.9.1 | Note **POT** / hour display after deposits | Can be **zero** if no qualifying deposits in that hour — see `KNOWN_ISSUES.md`. | |
| D.9.2 | **`finalizeHour`** | **Owner-only** (connected wallet must be game **owner**). Non-owner sees revert. No automatic cron in MVP. | |

### D.10 Binary Trophy NFT — metadata and images (**no IPFS**)

| Step | Action | Expected | Pass? |
|------|--------|----------|-------|
| D.10.1 | Understand minting | **`ClickMintGame._click`** may call **`trophyNft.mintTrophyForPlayer`** with probability **`trophyDropBps`** / 10_000 (failures are swallowed so the click still succeeds). **Owner** may still call **`mintTrophyForPlayer`** on the game or **`mint`** on the NFT for QA. Redeploy or use **`contracts/scripts/deploy-game-and-relink.ts`** if your on-chain game predates `trophyDropBps`. | |
| D.10.2 | After a mint to your wallet | **`/debug`** or dashboard listens for **`Transfer`** mints; toast **“Trophy NFT received”** may fire. | |
| D.10.3 | Basescan → **Read Contract** → **`tokenURI(tokenId)`** | Returns **`data:application/json;base64,...`** (on-chain JSON), **not** `ipfs://`. Decode base64 JSON — **`image`** is **`data:image/svg+xml;base64,...`** (on-chain SVG). | |
| D.10.4 | Wallet / OpenSea test | NFT appears with **SVG** image from chain (marketplace support for data-URIs varies). | |
| D.10.5 | **IPFS** | **Not used** for Phase 1 trophies. Do not expect `ipfs://` metadata unless you change the contract. | |

### D.11 Debug page

| Step | Action | Expected | Pass? |
|------|--------|----------|-------|
| D.11.1 | Open **`/debug`** (manual URL) | Raw fields match Basescan reads (credits, rewards, pause, etc.). | |

### D.12 Audio and static assets

| Step | Action | Expected | Pass? |
|------|--------|----------|-------|
| D.12.1 | Click / deposit after page load | SFX plays (browser may require user gesture first). | |
| D.12.2 | Files exist under **`frontend/public/sounds/`** | See **`docs/HOWTO.md`**. | |

### D.13 Build quality

| Step | Action | Expected | Pass? |
|------|--------|----------|-------|
| D.13.1 | **`cd frontend && npm run build`** | Succeeds (warnings noted in `KNOWN_ISSUES.md` are OK). | |
| D.13.2 | **`cd frontend && npm run lint`** | No unexpected errors. | |

---

## Part E — Not implemented or not wired in UI (do not expect)

| Item | What to do if you need it |
|------|---------------------------|
| **IPFS / external trophy images** | Trophy **`tokenURI`** is **on-chain** (base64 JSON + SVG). IPFS or static hosting is **optional polish** after core flows pass; changing it needs a **new** metadata approach (not required for Phase 1 testing). |
| **VRF / trustless POT randomness** | MVP uses pseudo-random; documented in architecture. |
| **Permissionless `finalizeHour`** | Owner-only in current design. |
| **Trustless on-click trophy randomness** | Drops use the same block-entropy family as POT (miner-influenced); upgrade if you need VRF-level fairness. |

---

## Part F — What to send back after a full pass

- **Commit SHA** and environment (local / Vercel).
- **Wallet** (truncated): EOA + smart account if gasless.
- **Contract addresses** (game, CLICK, trophy).
- Filled **PASS/FAIL** for Parts A–D (or attach this file).
- **Basescan** links for: first deposit, first click, first gasless UserOp (tx hash), first claim, any trophy mint.

---

## Pimlico reference (ERC-4337)

- Entry Point **v0.7** (common address): `0x0000000071727De22E5E9d8BAf0edAc6f37da032` (verify on Base Sepolia explorer if needed).
- Paymaster RPC methods used by the stack include **`pimlico_getUserOperationGasPrice`** and **`pm_getPaymasterData`** / **`pm_getPaymasterStubData`** with your **sponsorship policy** context.
