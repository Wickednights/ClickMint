# Aerodrome LP, initial price, and hourly settlement automation

## Where to add LP: mainnet vs Base Sepolia

### Base mainnet — Aerodrome vs Uniswap

**Aerodrome** is the dominant ve(3,3) DEX ecosystem on **Base**; liquidity and routing are strong for native Base projects. **Uniswap v3** is also deployed on Base and is a safe default if you prefer canonical tooling.

For ClickMint on **mainnet**, **either works** — choose based on where you want depth, incentives, and operational familiarity. This repo does not ship a DEX integration yet; the **CLICK** token only **mints** the early-claim “LP” share to `lpRecipient` until you point it at a router, vault, or helper contract.

### Base Sepolia (testnet) — use DapDap Uniswap V3

**Aerodrome** front-ends and pool flows on **Base Sepolia** are often incomplete or painful for custom testnet tokens. In practice, the most reliable place to **pick arbitrary testnet tokens** (e.g. **CLICK** + **WETH**) and add **Uniswap v3** liquidity is **DapDap’s Base testnet Uniswap UI**:

- **Add liquidity:** [testnet.base.dapdap.net — Uniswap pools / add liquidity](https://testnet.base.dapdap.net/uniswap/pools-add-liquidity)

Use that flow for **fee tier**, **concentrated range** (low/high price per token — watch **token0/token1** ordering vs the UI’s “per [token]” labels), and deposit amounts. If a mint or multicall reverts (e.g. tick range vs spot price, slippage), adjust the range or seed a **full-range** / wider band first, then tighten after the pool has a clear price.

**Mainnet** guidance below (Aerodrome router addresses, helper contract sketch) still applies on **Base**; on **Sepolia**, prefer the DapDap Uniswap path above unless you script positions yourself.

---

## Initial $CLICK price (starting ratio)

There is **no on-chain “correct” first price** — the pool price is whatever ratio of **CLICK : WETH** you deposit at seed time.

Reasonable approaches:

1. **Match product economics (sanity check)**  
   Relate implied price to **cost to acquire CLICK via gameplay** (deposits, clicks, vesting). Example: if users effectively pay ~\$X of economic value per CLICK from deposits/clicks, avoid seeding the pool at a wildly different implied FDV unless intentional.

2. **Target FDV / float**  
   Pick a **fully diluted valuation** or **circulating supply** story, then choose reserves so  
   `price ≈ (WETH in pool) / (CLICK in pool)` matches that narrative.

3. **Thin seed, then deepen**  
   Start with **small** balanced liquidity to reduce impermanent loss risk, monitor the pool, and **add** liquidity as the market forms.

4. **Single-sided seeding**  
   Some teams use **Aerodrome** or **Arrakis**-style tools for managed liquidity; that is optional and adds integration work.

**Important:** The contract **does not** pull ETH from treasury automatically to pair with CLICK — any **ETH + CLICK** add must come from wallets or a **helper contract** you fund and approve.

---

## Automatic LP “helper” contract (outline)

A typical pattern:

1. **`CLICK.setLpRecipient(helper)`** so early-claim and protocol CLICK land on the helper (or a vault that forwards to it).
2. Helper holds **ERC20 CLICK** and **ETH** (or WETH), with **`onlyOwner`** / **`onlyRole`** to:
   - Approve **Aerodrome router** (exact router address from [Aerodrome docs](https://aerodrome.finance/docs) for Base).
   - Call **`addLiquidity` / `addLiquidityETH`** with min amounts and deadline.
3. Optionally **sweep** dust or **schedule** adds when balances exceed thresholds.

**Security:** restrict who can trigger adds, use slippage bounds, and avoid infinite approvals unless you trust the router contract version.

This repository **does not** include that helper yet; it is a small dedicated contract plus tests and an owner deploy script.

---

## How hourly POT settlement works today

1. **`finalizeHour(hourId)`** on **ClickMintGame** runs **after** the game hour ends and the **`RESET_BUFFER`** (20s) has passed — see `GameFinalizeEarly` in the contract.
2. It derives **pseudo-random** entropy from **`block.prevrandao`** and other fields, picks a **winning 15-minute UTC span** with a **random start minute 0–44** (so the span stays inside the hour), then **eligible** players (min clicks + at least one click whose **minute-of-hour** falls in that span). Mints CLICK POT payout if there is a winner; otherwise carries ETH forward.
3. Previously **only `owner`** could call `finalizeHour` (MEV/grief mitigation in comments).

### Automatic settlement (no manual owner click)

**Deployments:** The **`potKeeper`** field exists only in contract versions that include **`setPotKeeper`**. Older **`ClickMintGame`** deployments are still **owner-only** for `finalizeHour` until you **redeploy** the game (or upgrade via proxy, if you use one) and point the frontend at the new address.

The contract supports an optional **`potKeeper`** address:

- **`setPotKeeper(address)`** — **owner** only; set to **`address(0)`** to disable (only owner can finalize).
- **`finalizeHour`** may be called by **`owner`** **or** **`potKeeper`** (when non-zero).

**Typical setup:**

1. Create a **dedicated wallet** (or use the vendor’s **relay** address) that will submit `finalizeHour`.
2. **`setPotKeeper(thatAddress)`** on the game (owner). **`finalizeHour`** may then be sent by **owner** or **`potKeeper`**.
3. Schedule a job that runs **after** each game hour boundary (see below), and calls **`finalizeHour(hourId)`** for the **previous** on-chain hour — the same `hourId` the dashboard uses as “last round to settle.”

**`hourId` for the keeper (match the UI):**

- On-chain time buckets use **`RESET_BUFFER` = 20 seconds** (see `ClickMintGame` / `GAME_RESET_BUFFER_SEC` in the frontend). The **current** game hour is `gameHour(timestamp)`; the hour to finalize is **`gameHour(now) - 1`** once that previous hour has ended and the buffer has passed.
- Practically: run your job **every minute** (or every few minutes) after the top of each wall-clock hour, or **once per hour ~30–60s after** `:00:20` UTC to stay safely past the buffer. Each run should:
  1. Read **`gameHour`** for “now” (or compute the same bucket from Unix time and `RESET_BUFFER`).
  2. Let **`targetHour = gameHourNow - 1`**. Skip if `targetHour` is absent or zero.
  3. If **`hourFinalized(targetHour)`** is already true, exit.
  4. Else send **`finalizeHour(targetHour)`** from the **`potKeeper`** key.

Idempotent behavior: repeating the job is safe once the hour is finalized (the tx will revert or you skip on the read).

---

### Recommended automation (no Supabase required)

**Gelato (Cloud vs legacy):** **[app.gelato.network](https://app.gelato.network/)** Web3 Functions / “Create Task” is **deprecated** for new work; **[Gelato Cloud](https://app.gelato.cloud/)** focuses on **Paymaster & Bundler, Relay, and Gas Tank**. Scheduled keeper-style **tasks** are often no longer available there after migrating accounts. You can still drive **Relay** from your own cron (your server calls Gelato), but `finalizeHour` must execute as **`potKeeper`**, so you still need that identity funded and signing — the options below are usually simpler.

**Default for this repo (Vercel):** **Vercel Cron → `GET /api/cron/finalize-hour`**  
Route Handler in **`frontend/app/api/cron/finalize-hour/route.ts`**: requires **`Authorization: Bearer $CRON_SECRET`**, uses **`POT_KEEPER_PRIVATE_KEY`** (must match on-chain **`potKeeper`**; fund with ETH), runs **`gameHour` → `targetHour = gameHourNow - 1` → `hourFinalized` → `finalizeHour`** (idempotent). **`frontend/vercel.json`** uses **once per minute** (`* * * * *`) — Vercel cron has **no second-level schedule**; **`finalizeHour`** must run **after** the prior game hour ends plus **`RESET_BUFFER` (20s)**, not “15 seconds before” the wall-clock hour. Optional **`POT_KEEPER_RPC_URL`**; otherwise **`NEXT_PUBLIC_QUICKNODE_RPC`**.

**Production vs Preview:** Cron jobs run against your **production deployment** by default. **`CRON_SECRET`**, **`POT_KEEPER_PRIVATE_KEY`**, and **`NEXT_PUBLIC_QUICKNODE_RPC`** must exist on **Production** in Vercel → Settings → Environment Variables, then redeploy. If they are only set for Preview, the cron **500s** immediately (often before any RPC call).

**Strong alternative: [OpenZeppelin Defender](https://defender.openzeppelin.com/) — Relayer + Autotask**  
Scheduled serverless task that submits **`finalizeHour`** from a Defender **Relayer** you set as **`potKeeper`**.

**Simpler but rougher: GitHub Actions `schedule`**  
Workflow every few minutes + viem/ethers + **`POT_KEEPER`** in repo **secrets**. Fine for testnet; lock down repo access for mainnet.

**Usually skip for this job:** **Chainlink Automation** unless you already run LINK upkeeps — more setup and LINK economics for a single hourly `eth_call` + occasional tx.

**Optional later:** **Supabase Edge Function + cron** — same pattern as Vercel (serverless + secrets + schedule); use only if you already standardize on Supabase for this product.

---

**Options at a glance:**

| Option | Notes |
|--------|--------|
| **Vercel Cron + `/api/cron/finalize-hour`** | **Shipped in repo** — `CRON_SECRET` + `POT_KEEPER_PRIVATE_KEY`; see `frontend/vercel.json` + `.env.example`. |
| **OpenZeppelin Defender** | Relayer + Autotask; turnkey UI and logs. |
| **GitHub Actions schedule** | OK for testnet; protect secrets on mainnet. |
| **Gelato Relay + your cron** | Only if execution satisfies **`msg.sender == potKeeper`**. |
| **Chainlink Automation** | Powerful; usually heavier than needed here unless already in use. |
| **Self-hosted cron** | Works; you own uptime and key handling. |
| **Supabase Edge Function + cron** | Same idea as Vercel; only if you adopt Supabase for this app. |

Any of these can hold or use the **`potKeeper`** key; the contract only checks **`msg.sender == potKeeper`**.

You still pay **gas** for each finalization (or sponsor via your own paymaster). This does **not** require VRF — VRF is a separate upgrade for **stronger randomness**, not for scheduling.

---

## Related code

- **POT logic:** `contracts/contracts/ClickMintGame.sol` — `finalizeHour`, `potKeeper`, `RESET_BUFFER`.
- **Vercel keeper:** `frontend/app/api/cron/finalize-hour/route.ts`, `frontend/vercel.json`.
- **Keeper `hourId` (frontend parity):** `frontend/lib/game-genesis.ts` — `GAME_RESET_BUFFER_SEC`, `gameHourIndexFromUnixSec`; `frontend/components/clickmint-dashboard.tsx` — `gameHourReadTs`, `prevHour = gameHourNow - 1n`.
- **Early-claim LP mint:** `contracts/contracts/CLICK.sol` — `earlySpendPending`, `lpRecipient`, `setLpRecipient`.
