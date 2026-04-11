# ClickMint — how-to

## Prerequisites

- Node.js 20+ (recommended)
- npm
- A wallet on **Base Sepolia** (chain id `84532`)
- Optional: [QuickNode](https://www.quicknode.com/) or other RPC URL for Base Sepolia

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

Deploy preset: **`DEPLOY_ECONOMY=testnet`** (default) or **`mainnet`**. **Testnet:** 1M CLICK cap, 10 trophies, 10m vesting, readable click costs. **Mainnet:** 100B cap, 10k trophies, 7d vesting, ~1¢/click at default `MAINNET_ETH_USD`. See **`docs/ECONOMY.md`** and **`contracts/scripts/config/economy.ts`** (`TESTNET_PRESET` / `MAINNET_PRESET`).

Match the frontend header hint: **`NEXT_PUBLIC_DEPLOY_ECONOMY=testnet`** or **`mainnet`** in **`frontend/.env`**.

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
```

Optional: set **`EXPECTED_MAX_SUPPLY_WEI`** to the deployed cap (mainnet-style **100B** tokens: `100000000000000000000000000000`; testnet **1M**: `1000000000000000000000000`). Full checklist: **`docs/POST_DEPLOY_VERIFICATION.md`**, **`docs/SYSTEM_VERIFICATION.md`**.

### Economy tuning (owner)

On **ClickMintGame**, owner can call:

- `setEconomy(clickPerEthWei, clickCostCredits, baseClickReward)` — POT mint rate, per-click credit cost, per-click vested CLICK grant.

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
- **`NEXT_PUBLIC_PIMLICO_SPONSORSHIP_POLICY_ID`** — optional; paste **policy id** from Pimlico after you create a **sponsorship policy** (required if paymaster calls fail without context).

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
| Gasless errors (`pm_*`, policy, `zd_*`) | Create Pimlico **sponsorship policy**, set **`NEXT_PUBLIC_PIMLICO_SPONSORSHIP_POLICY_ID`**; ensure **testnet chains** enabled; see **`docs/TESTNET_E2E_CHECKLIST.md`** Part B. |
| Connector build warnings | Optional peers for unused wagmi connector exports; core MetaMask/CB/WC paths install the packages added in `frontend/package.json`. |

## Related docs

- `docs/ARCHITECTURE.md` — contract relationships  
- `docs/POST_DEPLOY_VERIFICATION.md` — automated read-only checks after deploy  
- `docs/KNOWN_ISSUES.md` — checklist  
- `docs/TESTNET_E2E_CHECKLIST.md` — Pimlico policy + ordered full testnet QA (explorers, vesting, gasless, NFT metadata)  
- `docs/DEVELOPMENT_LOG.md` — change history  
