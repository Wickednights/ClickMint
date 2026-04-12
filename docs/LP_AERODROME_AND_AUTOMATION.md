# Aerodrome LP, initial price, and hourly settlement automation

## Aerodrome vs Uniswap on Base

**Aerodrome** is the dominant ve(3,3) DEX ecosystem on **Base**; liquidity and routing are strong for native Base projects. **Uniswap v3** is also deployed on Base and is a safe default if you prefer canonical tooling.

For ClickMint, **either works** — choose based on where you want depth, incentives, and operational familiarity. This repo does not ship a DEX integration yet; the **CLICK** token only **mints** the early-claim “LP” share to `lpRecipient` until you point it at a router, vault, or helper contract.

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
2. It derives **pseudo-random** entropy from **`block.prevrandao`** and other fields, picks a **winning 15-minute window**, then **eligible** players (min clicks + clicked in that window). Mints CLICK POT payout if there is a winner; otherwise carries ETH forward.
3. Previously **only `owner`** could call `finalizeHour` (MEV/grief mitigation in comments).

### Automatic settlement (no manual owner click)

**Deployments:** The **`potKeeper`** field exists only in contract versions that include **`setPotKeeper`**. Older **`ClickMintGame`** deployments are still **owner-only** for `finalizeHour` until you **redeploy** the game (or upgrade via proxy, if you use one) and point the frontend at the new address.

The contract supports an optional **`potKeeper`** address:

- **`setPotKeeper(address)`** — **owner** only; set to **`address(0)`** to disable (only owner can finalize).
- **`finalizeHour`** may be called by **`owner`** **or** **`potKeeper`** (when non-zero).

**Typical setup:**

1. Deploy **Gelato** / **Chainlink Automation** / **OpenZeppelin Defender** / custom cron with a **dedicated EOA** or **relay**.
2. Schedule a task **after each hour boundary + buffer** that calls **`finalizeHour(previousHourId)`** from that wallet.
3. **`setPotKeeper(relayOrBotAddress)`** on the game.

You still pay **gas** for that transaction (or sponsor it via your own paymaster). This does **not** require VRF — VRF is a separate upgrade for **stronger randomness**, not for cron.

---

## Related code

- **POT logic:** `contracts/contracts/ClickMintGame.sol` — `finalizeHour`, `potKeeper`, `RESET_BUFFER`.
- **Early-claim LP mint:** `contracts/contracts/CLICK.sol` — `earlySpendPending`, `lpRecipient`, `setLpRecipient`.
