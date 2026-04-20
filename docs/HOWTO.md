# ClickMint — how-to

## Prerequisites

- Node.js 20+ (recommended)
- npm
- A funded wallet for the network you deploy to:
  - **Base Sepolia** (chain id **`84532`**) — cheap smoke tests; on-chain token names include **“Test”** / **tCLICK**.
  - **Base mainnet** (chain id **`8453`**) — production economics and **recommended** for DEX/LP / integration QA.
- RPC URLs: [QuickNode](https://www.quicknode.com/) or public `https://sepolia.base.org` / `https://mainnet.base.org`.

### Network selection (frontend + cron)

1. Set **`NEXT_PUBLIC_CHAIN_ID`** in **`frontend/.env.local`** (and Vercel):
   - **`84532`** — Base Sepolia (default if unset).
   - **`8453`** — Base mainnet.
2. Set RPC:
   - Sepolia: **`NEXT_PUBLIC_QUICKNODE_RPC`** (optional; falls back to public Sepolia RPC).
   - Mainnet: **`NEXT_PUBLIC_BASE_MAINNET_RPC`** (optional; falls back to `https://mainnet.base.org`).
3. **Mainnet:** set **every** **`NEXT_PUBLIC_*`** contract address (there are no baked-in mainnet defaults).
4. **Cron / keeper:** use the **same** **`NEXT_PUBLIC_CHAIN_ID`** on Vercel; set **`POT_KEEPER_RPC_URL`** or the matching public RPC; fund the keeper with **native ETH** on that chain.

## Repository layout

| Path | Purpose |
|------|---------|
| `contracts/` | Hardhat — Solidity, deploy scripts |
| `frontend/` | Next.js 15 — game UI, wagmi |
| `docs/` | Architecture, issues, this guide, dev log |

## Contracts

### Install and compile

```bash
cd contracts
npm install
npx hardhat compile
```

### Deploy (local or network per `hardhat.config.ts`)

```bash
cd contracts
npx hardhat run scripts/deploy.ts --network <networkName>
```

Deploy preset: **`DEPLOY_ECONOMY=testnet`** (default) or **`mainnet`**. **Testnet:** 1M **tCLICK** cap, 10 trophies, **10 min** vesting, **ultra-low** `clickCostCredits`, **`minPotClicks = 5`**. **Mainnet:** **10B** cap, 10k trophies, **30d** vesting, ~**$0.10/click** at default `MAINNET_ETH_USD`. See **`docs/ECONOMY.md`** and **`contracts/scripts/config/economy.ts`**.

**Networks (Hardhat):** `--network baseSepolia` or **`--network base`** (mainnet). Shortcuts: **`npm run deploy:base-sepolia`**, **`npm run deploy:base`**.

Match the frontend header hint: **`NEXT_PUBLIC_DEPLOY_ECONOMY=testnet`** or **`mainnet`** in **`frontend/.env`** (must match how **`CLICK` / game** were deployed).

Note the printed addresses for **CLICK**, **ClickMintGame**, **Treasury**, **SecretPrizeWallet**, **BinaryTrophyNFT**, **Escrow**.

### Link CLICK token to the game

After deploy, `deploy.ts` normally calls `CLICK.setGame(gameAddress)`. If you deploy manually or reset state:

```bash
cd contracts
npx hardhat run scripts/set-game.ts --network <networkName>
```

(Adjust `set-game.ts` env / Hardhat vars so it knows CLICK and game addresses.)

### Post-deploy verification (read-only)

After redeploy, confirm wiring before updating frontend `.env`:

```bash
cd contracts
CLICK_ADDRESS=0x... GAME_ADDRESS=0x... TROPHY_ADDRESS=0x... npm run verify:base-sepolia
# Base mainnet:
CLICK_ADDRESS=0x... GAME_ADDRESS=0x... TROPHY_ADDRESS=0x... npm run verify:base
```

After deploy on any network, set **`potKeeper`** for cron (owner signer):

```bash
cd contracts
GAME_ADDRESS=0x... POT_KEEPER_ADDRESS=0x... npx hardhat run scripts/set-pot-keeper.ts --network baseSepolia
# or --network base
```

Optional: set **`EXPECTED_MAX_SUPPLY_WEI`** to the deployed cap (mainnet **10B** tokens: `10000000000000000000000000000`; testnet **1M**: `1000000000000000000000000`). Full checklist: **`docs/POST_DEPLOY_VERIFICATION.md`**, **`docs/SYSTEM_VERIFICATION.md`**.

### Economy tuning (owner)

On **ClickMintGame**, owner can call:

- `setEconomy(clickPerEthWei, clickCostCredits, baseClickReward)` — **`clickPerEthWei` is legacy** (kept for ABI / deploy compat); the **minute POT** pays accumulated **native ETH**, not minted $CLICK. **`clickCostCredits`** and **`baseClickReward`** still tune per-click credits and vested CLICK grants.

If **`baseClickReward`** is `0`, clicks do not add to users’ CLICK vesting vault; early spend will have no unvested balance.

**Readable testnet numbers** (or switch an existing game to mainnet-style pricing): run with `GAME_ADDRESS` and owner key in `.env`:

```bash
cd contracts
GAME_ADDRESS=0xYourGame ECONOMY=testnet npx hardhat run scripts/set-economy-round.ts --network baseSepolia
```

Defaults: `baseClickReward = 5` CLICK, `clickCostCredits = 0.001` ETH-worth of credits per click. Override with env vars documented in the script header.

## Frontend

### Install

```bash
cd frontend
npm install
```

### Environment

Copy `frontend/.env.example` → `frontend/.env.local` (or use root `.env` if your setup loads it). Set at minimum:

- `NEXT_PUBLIC_GAME_ADDRESS` — ClickMintGame proxy/impl address  
- `NEXT_PUBLIC_CLICK_ADDRESS` — CLICK token address  
- Optional: `NEXT_PUBLIC_TROPHY_NFT_ADDRESS`, treasury/secret/escrow if the UI references them  
- `NEXT_PUBLIC_QUICKNODE_RPC` — optional RPC (else public Base Sepolia endpoint in `wagmi.ts`)  
- `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` — optional; enables WalletConnect QR in the connect modal  
- **`NEXT_PUBLIC_PIMLICO_API_KEY`** — optional; **gasless clicks** (Pimlico bundler + paymaster on Base Sepolia).  
- **`NEXT_PUBLIC_PIMLICO_SPONSORSHIP_POLICY_ID`** — optional; paste **policy id** from Pimlico after you create a **sponsorship policy** (required if paymaster calls fail without context). Full walkthrough: **`docs/PIMLICO_SPONSORSHIP_SETUP.md`**.

### Dev server

```bash
cd frontend
npm run dev
```

Open the shown localhost URL.

### Production build

```bash
cd frontend
npm run build
npm start
```

### Audio assets

Place files under `frontend/public/sounds/`:

- `button_click.mp3` — click SFX  
- `cyberpunkbg.mp3` — optional loop for BGM  

Browsers require a user gesture (click/key) before audio unlocks.

### Custom domain (production + preview, fewer wallet warnings)

Generic **`*.vercel.app`** URLs are often flagged by browser wallets until they gain reputation. Using a domain you control (e.g. **`clickmint.app`**) usually helps.

**Recommended Vercel setup**

1. **Production:** Add **`clickmint.app`** (and optionally **`www.clickmint.app`**) in the Vercel project → Domains, assigned to the **Production** deployment. Point DNS per Vercel’s instructions (A/AAAA or CNAME).
2. **Preview / staging:** Add a second hostname on the **same** registrable domain, e.g. **`preview.clickmint.app`**, and assign it to **Preview** deployments (or to a specific branch such as `develop`). That gives testers a stable URL that is not a random `*.vercel.app` host.
3. **Environment variables:** In Vercel, set **`NEXT_PUBLIC_SITE_URL`** with **no trailing slash** per environment — e.g. Production: `https://clickmint.app`, Preview: `https://preview.clickmint.app`. Redeploy after changes (`NEXT_PUBLIC_*` is inlined at build time).
4. **WalletConnect (Reown):** In the project dashboard, add **both** origins to the allowed app/domain list (exactly the `https://…` URLs users open). Same project ID can back prod and preview if both hosts are allowlisted.

**Path-only “preview” (`/preview`)** on the production deployment is a separate idea: it does **not** replace Vercel’s per-branch preview builds, and everyone would still share one deployment and one set of env vars unless you add custom logic. For eliminating hostname-based warnings, **subdomains under `clickmint.app`** are the straightforward approach.

Canonical URL resolution in the app: **`frontend/lib/site-url.ts`** (`NEXT_PUBLIC_SITE_URL` → else production default `https://clickmint.app` → else `VERCEL_URL` → else localhost).

## Wallet behavior

- **One wallet signature per EOA transaction** is normal: each `deposit()`, `click()`, `claimVested()`, `earlySpendPending()`, etc. is its own tx.
- **Gasless clicks (optional):** with Pimlico + a Kernel **session**, the **smart account** submits sponsored UserOps for **`clickFor(your EOA)`** so you skip **per-click** gas; you still pay gas for **`setClickExecutor`** once and for **deposits** from the EOA. Setup: **`docs/TESTNET_E2E_CHECKLIST.md`** Part B.

## Troubleshooting

| Symptom | Things to check |
|--------|------------------|
| “Wrong network” / mainnet prompt | Ensure wallet on Base Sepolia; header / CLICK flow should request switch. |
| Early spend fails / “rejected” | Unvested must be ≥ amount; see `docs/ARCHITECTURE.md` and `docs/KNOWN_ISSUES.md`. |
| No CLICK from clicks | Read `baseClickReward` on game; if zero, owner must `setEconomy` or rewards come from POT only. |
| WalletConnect missing | Set `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`. |
| Gasless errors (`pm_*`, policy, `zd_*`) | Create Pimlico **sponsorship policy**, set **`NEXT_PUBLIC_PIMLICO_SPONSORSHIP_POLICY_ID`**; ensure **testnet chains** enabled; see **`docs/PIMLICO_SPONSORSHIP_SETUP.md`** and **`docs/TESTNET_E2E_CHECKLIST.md`** Part B. |
| Connector build warnings | Optional peers for unused wagmi connector exports; core MetaMask/CB/WC paths install the packages added in `frontend/package.json`. |

## Related docs

- `docs/ARCHITECTURE.md` — contract relationships  
- `docs/POST_DEPLOY_VERIFICATION.md` — automated read-only checks after deploy  
- `docs/KNOWN_ISSUES.md` — checklist  
- `docs/TESTNET_E2E_CHECKLIST.md` — Pimlico policy + ordered full testnet QA (explorers, vesting, gasless, NFT metadata)  
- `docs/DEVELOPMENT_LOG.md` — change history  
