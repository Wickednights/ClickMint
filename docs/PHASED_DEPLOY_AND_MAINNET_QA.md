# Phased deploy & mainnet QA runbook

Step-by-step checklist: **Base Sepolia smoke** first, then **Base mainnet** for real-ETH integration testing. Complete each phase before moving on; pause to update env, ledgers, and docs after deploys.

**Paths:** `<repo-root>` means the directory where you cloned this monorepo (any OS, any folder name). All `cd` examples assume you start at `<repo-root>`.

**Related:** [HOWTO.md](HOWTO.md), [DEPLOYMENT_ADDRESSES.md](DEPLOYMENT_ADDRESSES.md), [POST_DEPLOY_VERIFICATION.md](POST_DEPLOY_VERIFICATION.md), [LP_AERODROME_AND_AUTOMATION.md](LP_AERODROME_AND_AUTOMATION.md), [WHERE_WE_ARE_AND_NEXT_STEPS.md](WHERE_WE_ARE_AND_NEXT_STEPS.md).

---

## Phase 0 — Right now (one-time setup)

1. **Confirm tooling** — Node/npm installed; open a terminal at `<repo-root>` (clone directory).
2. **Clone / pull** — Repo matches the branch you intend to deploy from (e.g. `main`).
3. **Never commit secrets** — Private keys and RPC URLs with secrets stay in local `.env` files or the Vercel env UI only.

---

## Phase 1 — Local secrets (contracts)

1. **Create `contracts/.env`** — Copy from [`contracts/.env.example`](../contracts/.env.example).
2. **Set `DEPLOYER_KEY`** — 64 hex chars (optional `0x`). Fund this wallet with **ETH on the chain you will use** (Sepolia ETH for testnet; Base ETH for mainnet).
3. **Set RPC for Base Sepolia** — `QUICKNODE_RPC` (or `BASE_SEPOLIA_RPC_URL`) to a working Base Sepolia HTTPS endpoint.
4. **(Later, for mainnet)** Set **`BASE_MAINNET_RPC_URL`** or **`QUICKNODE_BASE_RPC`** for Base mainnet (see `contracts/hardhat.config.ts`).
5. **Optional root `.env`** — If your workflow expects it, mirror RPC/key in the monorepo root [`.env.example`](../.env.example) pattern only as needed.

---

## Phase 2 — Deploy / verify on Base Sepolia (smoke, cheap, `tCLICK`)

1. **Open terminal** at `<repo-root>`, then go to contracts (POSIX / macOS / Linux / Git Bash):

   ```bash
   cd contracts
   ```

   PowerShell (same result):

   ```powershell
   cd contracts
   ```

2. **Install deps** — `npm install` (if not already).
3. **Compile** — `npx hardhat compile` (should succeed).
4. **Deploy testnet preset**

   PowerShell (session env):

   ```powershell
   $env:DEPLOY_ECONOMY = "testnet"
   npx hardhat run scripts/deploy.ts --network baseSepolia
   ```

   bash / zsh (session env):

   ```bash
   export DEPLOY_ECONOMY=testnet
   npx hardhat run scripts/deploy.ts --network baseSepolia
   ```

   Or: `npm run deploy:base-sepolia` after setting `DEPLOY_ECONOMY=testnet` in `contracts/.env`.

5. **Save output** — All contract addresses (CLICK, game, treasury, secret wallet, trophy, escrow).
6. **Verify on explorer** — Use Hardhat verify / `npm run verify:base-sepolia` as in [HOWTO.md](HOWTO.md). Confirm token shows **ClickMint Test** / **`tCLICK`** and trophy **`tBTROPHY`** (for current `economy.ts` testnet branding).
7. **Run post-deploy checks** — e.g. `npm run verify:base-sepolia` or `npx hardhat run scripts/verify-deployment.ts --network baseSepolia` with any env the script expects (`GAME_ADDRESS`, `CLICK_ADDRESS`, `EXPECTED_MAX_SUPPLY_WEI` for 1M cap, etc.).
8. **Set `potKeeper` (optional on Sepolia)** — If you use Vercel cron on Sepolia: run [`scripts/set-pot-keeper.ts`](../contracts/scripts/set-pot-keeper.ts) so on-chain **`potKeeper`** equals the address that signs with **`POT_KEEPER_PRIVATE_KEY`**.

---

## Phase 3 — Point the frontend at Sepolia

1. **Create `frontend/.env.local`** — From [`frontend/.env.example`](../frontend/.env.example).
2. **Chain** — Leave **`NEXT_PUBLIC_CHAIN_ID`** unset or set **`84532`** for Base Sepolia.
3. **RPC** — Set **`NEXT_PUBLIC_QUICKNODE_RPC`** to your Sepolia HTTPS RPC.
4. **Contracts** — Set all **`NEXT_PUBLIC_*_ADDRESS`** values to the addresses from Phase 2.
5. **Preset label** — Set **`NEXT_PUBLIC_DEPLOY_ECONOMY=testnet`** (matches deploy).
6. **Build locally** — From `<repo-root>`:

   ```bash
   cd frontend
   npm install
   npm run build
   ```

   PowerShell:

   ```powershell
   cd frontend
   npm install
   npm run build
   ```

   Fix any env errors until the build passes.

7. **Smoke the app** — Connect wallet on Base Sepolia, deposit, click, exercise POT UI / history if applicable.

---

## Phase 4 — Vercel (Sepolia project, optional but typical)

1. **Create or use a Vercel project** linked to this repo.
2. **Env** — Add the same **`NEXT_PUBLIC_*`** variables as Phase 3 for Preview + Production as needed.
3. **Cron (optional)** — Set **`CRON_SECRET`** and **`POT_KEEPER_PRIVATE_KEY`** for a wallet funded on **84532**; ensure **`potKeeper`** on the game matches that address.
4. **Deploy** — Push or trigger deploy; confirm the site loads and the wallet targets **Base Sepolia**.

---

## Phase 5 — Ledger & docs (after Sepolia deploy)

1. **`docs/DEPLOYMENT_ADDRESSES.md`** — Move the previous Sepolia row to **Archive**; paste the new row under **Active** for Base Sepolia.
2. **`frontend/lib/addresses.ts`** — Update baked-in Sepolia defaults **if** you commit them (optional; env can override).
3. **`docs/DEVELOPMENT_LOG.md`** — Append a dated entry: addresses + “Sepolia redeploy” (or equivalent).

---

## Phase 6 — Base mainnet (production QA — real ETH)

1. **Fund a dedicated deployer** — Small amount of Base ETH; prefer a separate wallet from your personal hot wallet.
2. **Fund a dedicated keeper** — For **`finalizeHour`** gas on **8453** (can be the same as deployer only if you accept the risk).
3. **`contracts/.env`** — **`DEPLOY_ECONOMY=mainnet`**, mainnet RPC set (**`BASE_MAINNET_RPC_URL`** or **`QUICKNODE_BASE_RPC`**), **`DEPLOYER_KEY`** as chosen.
4. **Deploy** — From `<repo-root>/contracts`:

   PowerShell:

   ```powershell
   $env:DEPLOY_ECONOMY = "mainnet"
   npx hardhat run scripts/deploy.ts --network base
   ```

   bash / zsh:

   ```bash
   export DEPLOY_ECONOMY=mainnet
   npx hardhat run scripts/deploy.ts --network base
   ```

   Or: `npm run deploy:base` with `DEPLOY_ECONOMY=mainnet` in `contracts/.env`.

5. **Save all mainnet addresses.**
6. **Verify on Basescan** — e.g. `npm run verify:base` plus your usual Hardhat verify args for contracts.
7. **`verify-deployment.ts` on `base`** — `npm run verify:base` with mainnet expectations (e.g. 100B cap if that is your preset — see [POST_DEPLOY_VERIFICATION.md](POST_DEPLOY_VERIFICATION.md)).
8. **`setPotKeeper` on mainnet** — Keeper address = automation wallet you will use in Production (same as **`POT_KEEPER_PRIVATE_KEY`** if using Vercel cron).
9. **`docs/DEPLOYMENT_ADDRESSES.md`** — Fill the **Base mainnet** **Active** table (replace `_TBD_` placeholders).
10. **Second Vercel project (recommended)** — Production app pinned to **8453**:
    - **`NEXT_PUBLIC_CHAIN_ID=8453`**
    - **`NEXT_PUBLIC_BASE_MAINNET_RPC`**
    - All **`NEXT_PUBLIC_*_ADDRESS`** from the mainnet deploy
    - **`NEXT_PUBLIC_DEPLOY_ECONOMY=mainnet`**
    - **Separate** **`CRON_SECRET`** / keeper key from Sepolia so prod cron never hits test contracts.

---

## Phase 7 — Mainnet smoke & LP (when you are ready)

1. **Smoke** — Deposit, click, vesting, POT path on **8453** with **small** amounts.
2. **LP** — Follow [LP_AERODROME_AND_AUTOMATION.md](LP_AERODROME_AND_AUTOMATION.md) for real pool/router addresses; size liquidity conservatively at first.
3. **Pimlico (if gasless on mainnet)** — In the dashboard: enable chain **8453**; sponsorship policy must allow your **game** contract address.

---

## Phase 8 — Ongoing

1. **Any contract change** — Redeploy the full stack per your scripts (CLICK + trophy + game wiring), then repeat verify, **`potKeeper`**, env, deployment ledger, and dev log.
2. **Multisig / legal** — Before public marketing: owner multisig, terms, incident plan — see [WHERE_WE_ARE_AND_NEXT_STEPS.md](WHERE_WE_ARE_AND_NEXT_STEPS.md).

---

## Quick reference — npm scripts (contracts)

| Action | Command |
|--------|---------|
| Deploy Sepolia | `npm run deploy:base-sepolia` (with `DEPLOY_ECONOMY` in env) |
| Deploy Base mainnet | `npm run deploy:base` |
| Verify Sepolia | `npm run verify:base-sepolia` |
| Verify Base mainnet | `npm run verify:base` |
