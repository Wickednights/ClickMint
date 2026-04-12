# ClickMint — system verification checklist

Use this after each deployment or before mainnet. Work **top to bottom**. For every step, record **PASS / FAIL**, **tx hash** (if on-chain), and **screenshots or notes**.

**Full ordered testnet runbook (Pimlico policy + explorers + every UI path):** [TESTNET_E2E_CHECKLIST.md](./TESTNET_E2E_CHECKLIST.md)

**What to send back** (so we can review without your keys):

1. **Environment:** `VERCEL_ENV` or local, commit SHA, `NEXT_PUBLIC_*` names you set (not values for secrets).
2. **Chain:** Base Sepolia — wallet address you used (can truncate middle).
3. **Deployed addresses:** `ClickMintGame`, `CLICK` token, `Treasury`, `SecretPrizeWallet` (from your deploy log or `frontend/.env`).
4. **Per-section results:** copy the checklist tables below filled in, plus any **Basescan** links for transactions you care about.

**Do not** share private keys, seed phrases, or API keys in chat.

---

## A. On-chain configuration (read-only)

**Quick pass:** run **`contracts/scripts/verify-deployment.ts`** (see **`docs/POST_DEPLOY_VERIFICATION.md`**) with `CLICK_ADDRESS`, `GAME_ADDRESS`, optional `TROPHY_ADDRESS`, optional `EXPECTED_MAX_SUPPLY_WEI`.

| # | Check | How you verify | Your result |
|---|--------|----------------|-------------|
| A1 | `CLICK.game` == `ClickMintGame` | Basescan: CLICK contract → Read `game` | |
| A2 | Game `clickToken` == CLICK address | Read `clickToken` on game | |
| A3 | Treasury / secret wallet non-zero | Read `treasury`, `secretWallet` on game |    
| A4 | `clickCostCredits` | Read on game — **1 wei** ⇒ huge UI credit counts; use `setEconomy` / `set-economy-round.ts` for readable test economics | |
| A5 | `baseClickReward` | Read on game — `0` ⇒ no vesting from clicks | |
| A6 | `CLICK.maxSupply` matches intent | Read `maxSupply` — testnet **1M** / mainnet-style **100B** token cap (wei = whole tokens × 1e18) | |
| A7 | Pause state | Read `paused()` or **`isPaused()`** on game — both must agree | |

---

## B. Deposits & credits

| # | Action | Expected | Your result |
|---|--------|----------|-------------|
| B1 | Deposit **0.001 ETH** (or smallest button) | Tx succeeds; **Credits** (main stat) moves in the right direction after confirmation | |
| B2 | Repeat | Each deposit increases credits per contract rules (incl. bonus tiers if contract supports them) | |
| B3 | Wrong network | Switch wallet to non–Base Sepolia → app shows switch prompt; deposit should not silently succeed | |

---

## C. Clicks

| # | Action | Expected | Your result |
|---|--------|----------|-------------|
| C1 | One **CLICK** | One tx; after it shows **mined**, **Click Credits** decreases by **1** (when `clickCostCredits` is non-zero and meaningful) | |
| C2 | Rapid double-click | Second click within ~0.5s may show “Cooldown” client-side; on-chain **max 2 clicks per block** per wallet — third in same block reverts | |
| C3 | Credits exhausted | `click()` reverts with credits error; wallet shows failure | |

---

## D. $CLICK vesting & claim

| # | Action | Expected | Your result |
|---|--------|----------|-------------|
| D1 | After several clicks | **Unvested $CLICK** (headline) increases when `baseClickReward > 0` | |
| D2 | Wait for vesting (10 min testnet) | **Claimable** (gift row) becomes &gt; 0 when vested | |
| D3 | **Claim vested** | Tx succeeds; liquid balance / claimable updates after receipt | |

---

## E. Early spend (optional)

| # | Action | Expected | Your result |
|---|--------|----------|-------------|
| E1 | Amount &gt; unvested | Revert or validation error | |
| E2 | Amount ≤ unvested | Tx succeeds per token rules | |

---

## F. Hourly POT (ops / power users)

| # | Action | Expected | Your result |
|---|--------|----------|-------------|
| F1 | Note `currentPotEth` after deposits | Increases when deposits fund pot slice per contract | |
| F2 | After UTC hour + buffer | **Owner** calls `finalizeHour(prevHour)`; winner or carry per rules (permissionless settlement deferred until VRF/keeper design) | |

---

## G. Frontend & wallet

| # | Check | How | Your result |
|---|--------|-----|-------------|
| G1 | **Connect** | Open Connect modal; pick **MetaMask** (or one browser wallet). Modal closes on success. | |
| G2 | **WalletConnect** | With `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` set **at build time**, WC option opens QR / wallet flow. | |
| G3 | After **disconnect** | Connect again with same wallet — works without refresh | |
| G4 | Console | Note any **red** errors when connecting (screenshot). Multiple extensions injecting `window.ethereum` can cause conflicts — try one extension or MetaMask-only. | |

**Wallet troubleshooting you can try before reporting:**

- Disable extra wallet extensions or use a **clean profile** once to test.
- Hard refresh after deploy (`Ctrl+Shift+R`).
- Confirm Vercel **Environment Variables** include `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` for **Production** and that you **redeployed after adding it** (Next inlines `NEXT_PUBLIC_*` at build).

**Debug page (manual URL only):** `https://<your-host>/debug` — raw on-chain fields for support; not linked from production navigation.

---

## H. Economy tuning (recommended for readable numbers)

If **Click Credits** show billions/trillions for normal ETH deposits:

1. Game owner runs **`contracts/scripts/set-economy-round.ts`** (or custom `setEconomy`) on **your** `ClickMintGame` address.
2. Pick `CLICK_COST_CREDITS` so that `(deposit wei) / clickCost` is in a range you like (e.g. thousands of credits per 0.03 ETH, not 1e16).
3. Re-run section **A4**, **B**, **C** after changing.

---

## I. What to paste back (template)

```text
Deployment: [test/prod] [date]
Game: 0x…
CLICK: 0x…
Frontend URL: …

A1-A7: [short notes + Basescan read screenshots if stuck]
B: PASS/FAIL — …
C: PASS/FAIL — …
D: PASS/FAIL — …
Wallet: [browser + extensions] — G1-G4 notes + console errors if any
```

---

## J. Pimlico gasless (optional)

Prereq: **`NEXT_PUBLIC_PIMLICO_API_KEY`**; **`NEXT_PUBLIC_PIMLICO_SPONSORSHIP_POLICY_ID`** if your paymaster requires a policy. See **[TESTNET_E2E_CHECKLIST.md](./TESTNET_E2E_CHECKLIST.md)** Part B for dashboard steps (limits, contract restrictions, testnet toggle).

| # | Check | How | Your result |
|---|--------|-----|-------------|
| J1 | Gas price RPC | Must **not** error with `zd_getUserOperationGasPrice` — app uses **`pimlico_getUserOperationGasPrice`** (see `frontend/lib/account-abstraction.ts`). | |
| J2 | Enable gasless | Modal completes; EOA calls **`setClickExecutor`** once. | |
| J3 | Sponsored click | **`clickFor(EOA)`** from smart account; EOA pays no gas per click. | |
| J4 | Pimlico dashboard | UserOps **accepted**; policy limits not exceeded. | |

---

## K. Trophy NFT metadata (on-chain, not IPFS)

| # | Check | How | Your result |
|---|--------|-----|-------------|
| K1 | **`tokenURI`** | Basescan **Read** on **BinaryTrophyNFT** — value starts with **`data:application/json;base64,`**. | |
| K2 | Decoded JSON | **`image`** is **`data:image/svg+xml;base64,...`** (on-chain SVG). | |
| K3 | Mint path | **Owner** **`mintTrophyForPlayer`** on **game** (or **`mint`** on NFT) — **not** automatic on every `click()` in MVP. | |

---

We use this to mark **working vs broken** layers (config / contract / RPC / UI) and iterate in order.
