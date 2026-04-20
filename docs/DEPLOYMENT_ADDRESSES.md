# Deployment addresses

Ledgers for **Base Sepolia** (test / smoke) and **Base mainnet** (production QA + go-live).  
**Frontend:** `frontend/lib/addresses.ts` — Sepolia has baked-in fallbacks; **mainnet requires every `NEXT_PUBLIC_*` address** in env. See **`frontend/.env.example`**.

## Quick reference

| Environment | Status in this repo | Jump |
|-------------|---------------------|------|
| **Base Sepolia (84532)** — testnet | **Active addresses are filled** — use the table in [Current testnet deployment](#base-sepolia-84532--current-testnet-deployment) for `NEXT_PUBLIC_*` and local testing. | § Testnet below |
| **Base mainnet (8453)** | **Not filled** — deploy first, then paste addresses into the [Mainnet](#base-mainnet-8453--production--go-live) table and Vercel. | § Mainnet below |

---

## Maintenance — on every new full deploy

1. **Copy** the entire **Active deployment** table for that chain into **Archive** as a new dated subsection (keep newest archive entries near the top).
2. **Replace** **Active deployment** with the new addresses from `npx hardhat run scripts/deploy.ts --network baseSepolia` or `--network base`.
3. Update **`frontend/lib/addresses.ts`** (if you commit defaults), **`frontend/.env.example`**, root **`/.env.example`**, **`docs/DEVELOPMENT_LOG.md`**, and Vercel env for that deployment.

Do **not** delete archive rows — explorers, LP pools, and old txs stay tied to those contracts forever.

---

## Base Sepolia (`84532`) — current testnet deployment

Use these addresses when **`NEXT_PUBLIC_CHAIN_ID=84532`** (or unset with Sepolia defaults in `addresses.ts`). After you **redeploy** contracts (e.g. minute-round / Block Bet upgrade), replace this **Active** table with the new output and move the old row set into **Archive**.

### Active deployment

_Supersedes all entries in Archive._

| Role | Address |
|------|---------|
| **CLICK** | `0x0f1F23237a5BF6A7f3958795289AE82197fc3253` |
| **Treasury** | `0xF2d3A5C96Ff923E0892e337939226bbf8aecb864` |
| **SecretPrizeWallet** | `0xF6787fdDc65707860260812FdD16882247441B7B` |
| **ClickMintGame** | `0x31b62083176338a0A9d05c7d3A51557b28E3c6A6` |
| **BinaryTrophyNFT** | `0xe279ba6Bc919aa27E3EB761670f4F2AE6fa8B02c` |
| **Escrow** | `0x39556E85f90CC98b87341507BEAfcE7920B484e0` |

**Notes:** `DEPLOY_ECONOMY=testnet`; **`tCLICK`** / **`tBTROPHY`**. **Frontend env hints:** `NEXT_PUBLIC_GAME_GENESIS_UNIX=1776618714` (game deploy block time), `NEXT_PUBLIC_GAME_DEPLOY_BLOCK=40425213`, `NEXT_PUBLIC_TROPHY_DEPLOY_BLOCK=40425214`. Includes `trophyDropWeight` pacing (~75% CLICK supply), `POT_BPS=5000` (50% pot — BPS sum fix), CLICK `mintForTesting`, `SecretPrizeWallet` from `deploy.ts`.

### Base Sepolia — Uniswap v2 (test LP)

Use these when adding **v2-style** liquidity on Base Sepolia (factory createPair + router addLiquidity). Same pair math as canonical Uniswap v2.

| Contract | Address |
|----------|---------|
| **Factory** | `0x7Ae58f10f7849cA6F5fB71b7f45CB416c9204b1e` |
| **Router** | `0x1689E7B1F10000AE47eBfE339a4f69dECd19F602` |

Optional env (only if your app or scripts read them): **`NEXT_PUBLIC_UNISWAP_V2_FACTORY`**, **`NEXT_PUBLIC_UNISWAP_V2_ROUTER`**.

### Env vars to update after a full testnet redeploy

Copy/paste checklist for **local** `.env.local` and **Vercel** (Production / Preview). Rebuild the frontend after changing any **`NEXT_PUBLIC_*`**.

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_CHAIN_ID` | `84532` (Base Sepolia) |
| `NEXT_PUBLIC_DEPLOY_ECONOMY` | `testnet` — must match `DEPLOY_ECONOMY` used for `deploy.ts` |
| `NEXT_PUBLIC_CLICK_ADDRESS` | CLICK (tCLICK) |
| `NEXT_PUBLIC_GAME_ADDRESS` | ClickMintGame |
| `NEXT_PUBLIC_TREASURY_ADDRESS` | Treasury |
| `NEXT_PUBLIC_SECRET_WALLET_ADDRESS` | SecretPrizeWallet |
| `NEXT_PUBLIC_TROPHY_NFT_ADDRESS` | BinaryTrophyNFT |
| `NEXT_PUBLIC_ESCROW_ADDRESS` | Escrow |
| `NEXT_PUBLIC_GAME_GENESIS_UNIX` | Game contract deployment **time** (Unix seconds) from block explorer — drives “rounds since launch” |
| `NEXT_PUBLIC_GAME_DEPLOY_BLOCK` | Game contract **creation block** — for POT event indexing |
| `NEXT_PUBLIC_TROPHY_DEPLOY_BLOCK` | Trophy NFT **creation block** — for trophy mint log indexing |
| `NEXT_PUBLIC_SITE_URL` | Public URL, no trailing slash |
| `NEXT_PUBLIC_QUICKNODE_RPC` | Base Sepolia HTTPS RPC for wagmi / Pimlico |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | Optional WalletConnect |
| `NEXT_PUBLIC_PIMLICO_API_KEY` | Optional gasless |
| `NEXT_PUBLIC_PIMLICO_SPONSORSHIP_POLICY_ID` | Optional Pimlico policy |
| `CRON_SECRET` | Server: authorizes `POST /api/cron/finalize-round` |
| `POT_KEEPER_PRIVATE_KEY` | Server/cron: signs `finalizeRound` (fund with ETH; must match on-chain `potKeeper` after `setPotKeeper`) |
| `BASE_SEPOLIA_RPC_URL` / `QUICKNODE_RPC` | Contracts deploy + cron (can match public RPC) |

**Hardhat deploy:** set **`DEPLOYER_KEY`** in `contracts/.env` (or repo root `.env`). After deploy, call **`setPotKeeper`** with the same automation address you fund for cron (see `contracts/scripts/set-pot-keeper.ts`).

### Archive (superseded — Base Sepolia)

### 2026-04-12 — prior Base Sepolia set (pre–trophy weight + BPS sum fix)

| Role | Address |
|------|---------|
| **CLICK** | `0xeB4928cf96D10F47d76d5997Ef1179c242C95Dc1` |
| **Treasury** | `0x9869d1e0e4416b7e3B246D9C444a6355cA19344c` |
| **SecretPrizeWallet** | `0xeCB7132cc27e177f7028475f58Ee8b3D43F074E2` |
| **ClickMintGame** | `0x1EFf9a6c3F3C438a2929301d1AEeD9D048f04D6B` |
| **BinaryTrophyNFT** | `0xd190828F946659a1ff338AD6bC6BAF7C59f9eefD` |
| **Escrow** | `0x3F71C068aaC3359332E5c464E91F0c8b23dF590a` |

### 2026-04-07 — prior Base Sepolia set (“Phase 1” in repo history)

| Role | Address |
|------|---------|
| **CLICK** | `0x6CB127e069D98F6A0B1851585670495DA93cB5D5` |
| **Treasury** | `0x3B04A33D89F114185FF7194a1f8b13b086999471` |
| **SecretPrizeWallet** | `0xB4BD710d5691Dbb7BF02791ddAd9f818F4a47Af5` |
| **ClickMintGame** | `0xEA612843365Cc1B53f9FC6988d6edD54aeD84013` |
| **BinaryTrophyNFT** | `0xE367E485fF1C2946d4435bab6649C576Ca526476` |
| **Escrow** | `0x2457623b777DE271CDC9d9D37E3a93f19fcc5960` |

**Notes:** Logged in `DEVELOPMENT_LOG.md` under **2026-04-07T18:00:00Z**. Older bytecode (no `mintForTesting` / no LP bootstrap constructor arg).

---

## Base mainnet (`8453`) — production / go-live

**Hardhat:** `npx hardhat run scripts/deploy.ts --network base` with **`DEPLOY_ECONOMY=mainnet`**.  
**RPC env:** `BASE_MAINNET_RPC_URL` or `QUICKNODE_BASE_RPC` (see `contracts/hardhat.config.ts`).

There is **no** mainnet deployment recorded in this table until you run a mainnet deploy — unlike Sepolia, these rows stay **`_TBD_`** until then.

### Active deployment

_Fill after first mainnet deploy._

| Role | Address |
|------|---------|
| **CLICK** | _TBD_ |
| **Treasury** | _TBD_ |
| **SecretPrizeWallet** | _TBD_ |
| **ClickMintGame** | _TBD_ |
| **BinaryTrophyNFT** | _TBD_ |
| **Escrow** | _TBD_ |

**Post-deploy:** run **`verify-deployment.ts`**, call **`setPotKeeper`** with the automation wallet (e.g. Vercel cron signer), fund that wallet with **ETH**, set **`NEXT_PUBLIC_CHAIN_ID=8453`** and all contract env vars on the **mainnet** Vercel project.

### Archive (superseded — Base mainnet)

_(None yet.)_
