# ClickMint — architecture (external review)

**Purpose:** Single document for third-party review (e.g. Grok, auditors, advisors). It reflects the repo as of the last update that touched this file. For day-to-day contributor notes, see [ARCHITECTURE.md](./ARCHITECTURE.md), [ECONOMY.md](./ECONOMY.md), and [DEVELOPMENT_LOG.md](./DEVELOPMENT_LOG.md).

---

## 1. Executive summary

ClickMint is an on-chain **click-to-earn** game deployed on **Base Sepolia** (cheap smoke tests, on-chain names **tCLICK** / **tBTROPHY**) and **Base mainnet** (primary QA for “go-live” integrations: real DEX/LP, explorers, keeper gas). Users deposit **ETH**, receive **click credits** (wei-sized), and **CLICK** to burn credits, pass a **dynamic difficulty hash gate**, and receive **$CLICK** into a **vesting vault**. Each deposit sends **1% ETH** to treasury, **1%** to a secret wallet, and **1%** into an **hourly POT** pool. **`finalizeHour`** pays the POT winner **native ETH** (not a CLICK mint). **`clickPerEthWei`** in storage is **legacy** (not used for POT payout). **Binary Trophy** NFTs (on-chain SVG) and **Escrow** exist alongside the core loop.

**Ops:** A **`potKeeper`** address may call **`finalizeHour`** (not only the owner). **Vercel Cron** hits **`/api/cron/finalize-hour`** with **`CRON_SECRET`**; the route uses **`POT_KEEPER_PRIVATE_KEY`** to submit txs, **`simulateContract`** before send, and returns **200 skipped** for benign “too early / already finalized” cases. Frontend: **PotWin** history (ETH amounts), click **in-flight** guard + gas headroom, **VICTORY_POT** / **NFT_WIN** audio.

**Account abstraction:** Optional **gasless clicks** use **ZeroDev Kernel** (`0.3.3`, **EntryPoint v0.7**) + **Pimlico** bundler/paymaster. The **EOA** remains the **player identity** on-chain (`credits`, POT stats, `CLICK` vesting): the smart account only calls **`clickFor(eoa)`** after the EOA has called **`setClickExecutor(smartAccount)`**.

---

## 2. Gas sponsorship: who pays Pimlico? (deposits vs developer billing)

### 2.1 Current implementation — **no** diversion of user deposits to Pimlico

Player **`deposit()`** flow in `ClickMintGame`:

- **3 × 1%** of `msg.value` is sent to **treasury**, **secret wallet**, and **POT ETH** (accumulated per UTC game hour).
- The user’s **credit balance** still increases by **`msg.value` + tier bonus** (full advertised credits in wei units).
- **None** of that ETH is forwarded to **Pimlico** or any bundler address.

**Gasless clicks** are sponsored because the **frontend** uses a **Pimlico API key** (`NEXT_PUBLIC_PIMLICO_API_KEY`). Under the hood, Pimlico’s **paymaster** pays the **L2 gas** for qualifying **UserOperations**, and **Pimlico bills the developer’s Pimlico account** (free-tier rate limits / API credits / paid plans per their dashboard), **not** the game’s deposit fee split.

So:

| Funding source | What it pays for |
|----------------|------------------|
| User ETH deposits | Protocol treasury, secret wallet, POT pool, user **credits** (in-contract). |
| **Developer ↔ Pimlico** | **Sponsored gas** for UserOps (subject to policy, quotas, plan). |

### 2.2 “Can we fund sponsorship from user deposits instead?”

**Yes, but it is a different architecture** and **not** in this repo today. Conceptually:

1. **Extra fee slice** on `deposit()` (e.g. additional BPS) routed to an on-chain **`GasSponsorVault`** (or operator multisig).
2. **Operational bridge:** periodically move accumulated ETH from that vault into whatever balance Pimlico (or a self-hosted **verifying paymaster**) requires, or deploy a **custom paymaster** that spends from your vault per UserOp.

That implies: product/legal decision on disclosure, accounting, monitoring, and engineering for **paymaster allowlisting**, **abuse limits**, and **reconciliation**. It is **orthogonal** to ERC-4337: the game contract does not need to “talk to” Pimlico directly.

### 2.3 Practical limits (Pimlico free tier)

Sponsorship is constrained by **Pimlico dashboard** settings (rate limits, sponsorship policy, API credits). Heavy traffic can hit **requests/minute** caps long before on-chain game limits bind; production usually means **paid plan** or **self-funded** paymaster strategy.

---

## 3. System diagram (value + control)

```mermaid
flowchart TB
  subgraph User
    EOA[User EOA]
    SCW[Kernel smart account]
  end

  subgraph Frontend
    UI[Next.js + wagmi]
    AA[account-abstraction.ts]
  end

  subgraph Chain
    Game[ClickMintGame]
    Click[CLICK ERC20]
    Treas[Treasury]
    Secret[SecretPrizeWallet]
    Trophy[BinaryTrophyNFT]
    EP[EntryPoint v0.7]
  end

  subgraph Infra
    Pim[Pimlico bundler + paymaster]
  end

  EOA --> UI
  UI --> Game
  UI --> Click
  EOA -->|deposit click gas| Game
  AA -->|UserOp| Pim
  Pim --> EP
  EP --> SCW
  SCW -->|clickFor(EOA)| Game

  Game -->|1% ETH| Treas
  Game -->|1% ETH| Secret
  Game -->|1% ETH POT slice| Game
  Game -->|grantVested mint| Click
  Game -.->|mintTrophyForPlayer / ops| Trophy
```

---

## 4. Contract inventory (Solidity)

| Contract | Role |
|----------|------|
| **ClickMintGame** | Credits, fee split, `click` / `clickFor`, `deposit` / `depositFor`, hourly POT (**ETH** accumulation + **`finalizeHour`** pays winner via **`call{value}`**), **`setPotKeeper`**, **`finalizeHour`** ( **`potKeeper` or owner** ), **`PotWin(hour, winner, ethPayoutWei)`**, **`pause` / `unpause`**, **`isPaused()`**, `setTrophyNft`, **`mintTrophyForPlayer`**, trophy wiring. Economy / fee-address updates emit events. |
| **CLICK** | Capped ERC-20 (`maxSupply` immutable); **strict pre-mint** `totalSupply() + amount <= maxSupply` via **`CLICKBadSupply`**; 1% transfer tax; vesting + early spend; **`ReentrancyGuard`** on minting externals; owner setters emit events. |
| **Treasury** | Receives fee ETH; owner sweeps. |
| **SecretPrizeWallet** | Receives fee ETH; owner sweeps. |
| **BinaryTrophyNFT** | ERC721 + EIP-2981; `maxSupply` immutable; owner **`mint`**; **`mintTrophyForPlayer`** only from **`clickMintGame`** (set by owner); O(1) ETH revenue on `receive`; `claimRevenue(tokenId)`. |
| **Escrow** | NFT hold / claim helper (optional game integration). |

### 4.1 Security / review hotspots

- **POT randomness:** `block.prevrandao` + salt — acceptable for testnet; production risk (miner/validator influence). **VRF** or commitment schemes recommended for high-stakes mainnet.
- **Owner / keeper:** `setEconomy`, `setAddresses`, **`setPotKeeper`**, **pause**, trophy **`mintTrophyForPlayer`**, CLICK owner setters — MVP centralization. **`finalizeHour`** may be called by **`potKeeper`** or **owner** (not permissionless to arbitrary callers). Use a **dedicated funded keeper** for automation; **`ownerSweepPotCarry`** remains an owner escape hatch when there is no eligible winner.
- **CLICK supply:** All mint entrypoints **`_requireSupplyRoom` before `_mint`** so `totalSupply` never exceeds `maxSupply` (final claim / early-spend / POT paths included). **`CLICKBadSupply`** = zero cap at constructor **or** any mint that would exceed cap.
- **Pause:** While paused, users cannot deposit, click, `setClickExecutor`, or finalize hours; **owner may still** `ownerSweepPotCarry` to recover rolled POT ETH.
- **`clickFor` / `clickExecutor`:** Executor may spend **player credits** and affect **POT stats** until EOA revokes (`setClickExecutor(0)`). Session key theft = grief for linked players only (not arbitrary EOAs).
- **Reentrancy:** `nonReentrant` on deposit/click/finalize paths — verify any new external calls stay safe.
- **Fee math:** `FEE_EACH_BPS` — three equal legs; credits use **full** `msg.value + bonus` (fees taken from sent ETH, not from credited amount).

---

## 5. Account abstraction (frontend) — precise flow

**Files:** `frontend/lib/account-abstraction.ts`, `frontend/hooks/use-gasless-click-session.ts`.

1. **Bootstrap (owner-signed UserOp):** ECDSA validator + deploy Kernel if needed; install **permission** validator with ephemeral **session key** (~30 min), policy allows only **`clickFor`** on the game contract.
2. **Link (EOA transaction):** `setClickExecutor(smartAccountAddress)` on **ClickMintGame** — EOA pays gas; required before `clickFor` succeeds.
3. **Gasless click:** Session client sends UserOp: **`clickFor(playerEOA)`**; Pimlico may sponsor gas per policy.

**Deposits:** UI uses **EOA** `deposit()` only (ETH from user wallet). Session key does **not** sponsor deposits in current design — avoids forcing users to fund the smart account for credits.

---

## 6. Economy (high level)

- **`clickCostCredits`:** Wei deducted from `credits` per successful click (Base Sepolia preset: **ultra-low** for cheap smoke tests; mainnet target ~1¢/click — see `economy.ts`).
- **`baseClickReward`:** $CLICK (18 decimals) into **vesting** per successful click (mainnet default **10**; testnet preset may be lower).
- **`maxSupply` (CLICK):** Mainnet-style deploy **100B**; testnet default **1M** — see `DEPLOY_ECONOMY` / `economy.ts`.
- **Token / NFT names:** Testnet deploy uses **ClickMint Test** / **tCLICK** and **tBTROPHY**; mainnet uses **ClickMint** / **CLICK** and **BTROPHY** (constructor args from preset **`branding`**).
- **POT:** Pool is **ETH** from the 1% deposit slice; **`finalizeHour`** transfers **`ethPayout`** wei to the winner (or carry / zero-address sentinel when no eligible winner). Legacy **`clickPerEthWei`** is not the POT payout mechanism.
- **`clicksPerHashTier`:** Hourly global click count drives **leading-zero bit** difficulty (capped at 4 bits).

Full nuance: [ECONOMY.md](./ECONOMY.md).

---

## 7. Deployment & configuration

- **Contracts:** Hardhat — **`baseSepolia`** and **`base`** (mainnet, chain id **8453**) in `hardhat.config.ts`. `npm run deploy:base-sepolia` / `npm run deploy:base`. Presets: **`DEPLOY_ECONOMY=testnet|mainnet`** (`economy.ts`).
- **Post-deploy:** `verify-deployment.ts` on the same **`--network`**; then **`setPotKeeper`** for cron (see `scripts/set-pot-keeper.ts`). See **`docs/POST_DEPLOY_VERIFICATION.md`**.
- **Frontend / Vercel:** **`NEXT_PUBLIC_CHAIN_ID`** — omit or **`84532`** for Sepolia; **`8453`** for Base mainnet. **`NEXT_PUBLIC_QUICKNODE_RPC`** (Sepolia) and **`NEXT_PUBLIC_BASE_MAINNET_RPC`** (mainnet wagmi default). **All `NEXT_PUBLIC_*` contract addresses are required on mainnet** (no baked-in defaults). **`POT_KEEPER_PRIVATE_KEY`**: 32-byte hex, **`0x` prefix optional** (normalized in code).
- **Cron:** Same app must use **`NEXT_PUBLIC_CHAIN_ID`**, matching RPC (**`POT_KEEPER_RPC_URL`** or per-network public RPC), and game address envs so **`/api/cron/finalize-hour`** targets the correct chain.
- **Pimlico:** Gasless path uses chain id from **`NEXT_PUBLIC_CHAIN_ID`**; enable **8453** in the dashboard when testing on Base mainnet (not only “testnet chains” for 84532).

---

## 8. Out of scope / known gaps (for reviewers)

- **Probabilistic trophy drop** inside `_click` is not implemented; **`mintTrophyForPlayer`** on the game (owner) forwards to the NFT so `msg.sender` is the game contract; future work is on-click randomness + cap checks.
- No automatic **deposit → Pimlico** funding pipeline.
- **Audits:** Treat as unaudited unless separately engaged.

---

## 9. Document map

| File | Use |
|------|-----|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Shorter internal diagram + tables |
| [ARCHITECTURE_FOR_GROK_REVIEW.md](./ARCHITECTURE_FOR_GROK_REVIEW.md) | This file — full reviewer pass |
| [WHERE_WE_ARE_AND_NEXT_STEPS.md](./WHERE_WE_ARE_AND_NEXT_STEPS.md) | Status + roadmap |
| [ECONOMY.md](./ECONOMY.md) | Wei credits, presets, revenue intuition |
| [DEVELOPMENT_LOG.md](./DEVELOPMENT_LOG.md) | Chronological changes |
| [POST_DEPLOY_VERIFICATION.md](./POST_DEPLOY_VERIFICATION.md) | Read-only checks after deploy |
