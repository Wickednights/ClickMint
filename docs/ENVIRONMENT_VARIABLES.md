# Environment variables — local, Vercel, and Hardhat

Single reference for **contracts deploy**, **Next.js frontend**, and **cron / keeper**. Never commit real private keys or RPC URLs that embed secrets; use `contracts/.env`, `frontend/.env.local`, and the Vercel dashboard.

**Deploy order:** set contracts env → deploy → copy addresses into frontend + Vercel → optional `set-pot-keeper` → set cron secrets.

---

## 1. Contracts (`contracts/.env`)

Copy from [`contracts/.env.example`](../contracts/.env.example).

| Variable | Required | Purpose |
|----------|----------|---------|
| `DEPLOYER_KEY` | **Yes** (deploy / most scripts) | Hex private key of deployer (with `0x` or without). |
| `QUICKNODE_RPC` | **Yes** (recommended) | Base Sepolia HTTPS RPC; Hardhat tries this first for `baseSepolia`. |
| `BASE_SEPOLIA_RPC_URL` | Optional | Alias some configs read after `QUICKNODE_RPC`. |
| `BASE_MAINNET_RPC_URL` | For mainnet | Base mainnet HTTPS RPC for `--network base`. |
| `QUICKNODE_BASE_RPC` | Optional | Alias after `BASE_MAINNET_RPC_URL`. |
| `DEPLOY_ECONOMY` | Optional | `testnet` (default) or `mainnet` — must match [`economy.ts`](../contracts/scripts/config/economy.ts) preset used by `deploy.ts`. |

**After deploy (scripts only):** `CLICK_ADDRESS`, `GAME_ADDRESS`, `TROPHY_ADDRESS`, `POT_KEEPER_ADDRESS`, `EXPECTED_MAX_SUPPLY_WEI` — see [`POST_DEPLOY_VERIFICATION.md`](POST_DEPLOY_VERIFICATION.md).

---

## 2. Frontend — public (`frontend/.env.local` & Vercel)

All **`NEXT_PUBLIC_*`** vars are inlined at **build time**. Changing them on Vercel requires a **new deployment**.

### 2.1 Chain & URLs

| Variable | Example | Purpose |
|----------|---------|---------|
| `NEXT_PUBLIC_CHAIN_ID` | `84532` or `8453` | Base Sepolia vs Base mainnet. Omit → app defaults to **84532**. |
| `NEXT_PUBLIC_QUICKNODE_RPC` | `https://…base-sepolia…` | Wagmi + read paths on Sepolia; falls back to public Sepolia RPC if unset. |
| `NEXT_PUBLIC_BASE_MAINNET_RPC` | `https://…base-mainnet…` | When `CHAIN_ID=8453`; falls back to `https://mainnet.base.org`. |
| `NEXT_PUBLIC_SITE_URL` | `https://your-domain.com` | Metadata / OG; no trailing slash. |

### 2.2 Economy label (display / debug)

| Variable | Value | Purpose |
|----------|-------|---------|
| `NEXT_PUBLIC_DEPLOY_ECONOMY` | `testnet` or `mainnet` | Must match **`DEPLOY_ECONOMY`** used when contracts were deployed. |

### 2.3 Contract addresses (set after every full deploy)

| Variable | Maps to |
|----------|---------|
| `NEXT_PUBLIC_CLICK_ADDRESS` | `CLICK` ERC-20 |
| `NEXT_PUBLIC_GAME_ADDRESS` | `ClickMintGame` (optional alias `NEXT_PUBLIC_CLICKMINT_GAME_ADDRESS`) |
| `NEXT_PUBLIC_TREASURY_ADDRESS` | `Treasury` |
| `NEXT_PUBLIC_SECRET_WALLET_ADDRESS` | `SecretPrizeWallet` (deployed by `deploy.ts`; **not** wired into current game deposit split — ledger / future use) |
| `NEXT_PUBLIC_TROPHY_NFT_ADDRESS` | `BinaryTrophyNFT` |
| `NEXT_PUBLIC_ESCROW_ADDRESS` | `Escrow` |

### 2.4 Indexing / “rounds since launch” (strongly recommended)

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_GAME_GENESIS_UNIX` | Unix **seconds** at game contract deployment (from explorer). |
| `NEXT_PUBLIC_GAME_DEPLOY_BLOCK` | Game contract **creation block** — POT / `PotWin` log scans. |
| `NEXT_PUBLIC_TROPHY_DEPLOY_BLOCK` | Trophy contract creation block — mint history. |

### 2.5 Optional integrations

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | WalletConnect Cloud project. |
| `NEXT_PUBLIC_PIMLICO_API_KEY` | Gasless / ERC-4337 (see `PIMLICO_SPONSORSHIP_SETUP.md`). |
| `NEXT_PUBLIC_PIMLICO_SPONSORSHIP_POLICY_ID` | Pimlico policy id if paymaster requires it. |
| `NEXT_PUBLIC_UNISWAP_V2_FACTORY` | Only if UI/scripts need Sepolia v2 factory. |
| `NEXT_PUBLIC_UNISWAP_V2_ROUTER` | Only if UI/scripts need Sepolia v2 router. |

---

## 3. Frontend — server-only (Vercel / local for API routes)

These are **not** prefixed with `NEXT_PUBLIC_`. Set in Vercel for the same project that serves **`/api/cron/finalize-round`**.

| Variable | Purpose |
|----------|---------|
| `CRON_SECRET` | Bearer token Vercel Cron sends; route rejects missing/wrong secret. |
| `POT_KEEPER_PRIVATE_KEY` | Signs **`finalizeRound`** txs; wallet must hold ETH on the target chain. |
| `POT_KEEPER_RPC_URL` | Optional dedicated RPC for keeper; else route uses `NEXT_PUBLIC_QUICKNODE_RPC` or `NEXT_PUBLIC_BASE_MAINNET_RPC` per chain. |

**On-chain:** game’s **`potKeeper`** must equal the address derived from `POT_KEEPER_PRIVATE_KEY`. Run [`contracts/scripts/set-pot-keeper.ts`](../contracts/scripts/set-pot-keeper.ts) as owner if needed.

---

## 4. Vercel checklist (per environment)

Use **separate** Production vs Preview values if you test multiple chains.

**Preview / testnet (84532):**

- [ ] `NEXT_PUBLIC_CHAIN_ID=84532`
- [ ] `NEXT_PUBLIC_QUICKNODE_RPC`
- [ ] `NEXT_PUBLIC_DEPLOY_ECONOMY=testnet`
- [ ] All `NEXT_PUBLIC_*_ADDRESS` from latest Sepolia deploy
- [ ] `NEXT_PUBLIC_GAME_GENESIS_UNIX`, `NEXT_PUBLIC_GAME_DEPLOY_BLOCK`, `NEXT_PUBLIC_TROPHY_DEPLOY_BLOCK`
- [ ] `NEXT_PUBLIC_SITE_URL` (preview URL or custom domain)
- [ ] Optional: WalletConnect, Pimlico keys
- [ ] Optional cron: `CRON_SECRET`, `POT_KEEPER_PRIVATE_KEY`, matching `potKeeper`

**Production mainnet (8453):**

- [ ] `NEXT_PUBLIC_CHAIN_ID=8453`
- [ ] `NEXT_PUBLIC_BASE_MAINNET_RPC`
- [ ] `NEXT_PUBLIC_DEPLOY_ECONOMY=mainnet`
- [ ] **Every** contract address (no reliable baked-in mainnet defaults)
- [ ] Separate `CRON_SECRET` / keeper key from testnet

---

## 5. After Phase 0 (fresh testnet deploy)

1. Paste addresses into [`DEPLOYMENT_ADDRESSES.md`](DEPLOYMENT_ADDRESSES.md) (**Active** row; archive the old set).
2. Update `frontend/.env.local` and Vercel with the same addresses.
3. Optionally update baked-in Sepolia fallbacks in [`frontend/lib/addresses.ts`](../frontend/lib/addresses.ts).
4. Set genesis / deploy blocks from Basescan.
5. Run `npm run verify:base-sepolia` with `EXPECTED_MAX_SUPPLY_WEI` for **1M** testnet cap.
6. Call `set-pot-keeper` if using cron; fund keeper with Sepolia ETH.

See [`PHASED_DEPLOY_AND_MAINNET_QA.md`](PHASED_DEPLOY_AND_MAINNET_QA.md) for the full phase list.
