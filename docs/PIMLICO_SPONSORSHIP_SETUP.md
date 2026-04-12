# Pimlico — sponsorship policy setup (gasless clicks)

This guide walks through creating a **Pimlico** account, API key, and **sponsorship policy** so ClickMint can sponsor **ERC-4337 UserOperations** (gasless `clickFor` via a smart account) on **Base Sepolia** (chain id `84532`).

**Prerequisites:** deployed ClickMint contracts, `frontend` env with `NEXT_PUBLIC_GAME_ADDRESS` and `NEXT_PUBLIC_CLICK_ADDRESS`, and a wallet with Base Sepolia ETH for gas on the **non-sponsored** steps (deposit, `setClickExecutor`, etc.).

**Related:** [TESTNET_E2E_CHECKLIST.md](./TESTNET_E2E_CHECKLIST.md) Part B (ordered QA), [HOWTO.md](./HOWTO.md) (env vars).

---

## 1. Create a Pimlico project and API key

1. Open **[Pimlico Dashboard](https://dashboard.pimlico.io)** and sign in.
2. Create a **project** (or select an existing one).
3. Create an **API key** (or copy an existing one).
4. In your repo, add to **`frontend/.env.local`** (or Vercel **Preview** / **Production**):

   ```bash
   NEXT_PUBLIC_PIMLICO_API_KEY="your-pimlico-api-key"
   ```

5. Restart the dev server or **redeploy** on Vercel after changing `NEXT_PUBLIC_*` (Next inlines these at build time).

---

## 2. Enable the right chains

In the Pimlico dashboard (project settings / chain toggles):

- Turn **Enable testnet chains** **ON** — required for **Base Sepolia**.
- If you only test **Base Sepolia**, consider turning **mainnet** sponsorship **OFF** so you do not accidentally sponsor mainnet traffic under the same key.

---

## 3. Create a sponsorship policy

Policies define **who** gets sponsored gas and **limits** on spend.

1. In Pimlico, open **Sponsorship policies** (or equivalent) → **Create policy**.
2. **Name** — e.g. `ClickMint Base Sepolia`.
3. **Description** — e.g. “Sponsor Kernel smart-account UserOps for ClickMint `clickFor` on Base Sepolia only.”
4. **Start / end dates** — optional; leave open for development, or set an end date for safety.
5. **Limits** — strongly recommended for testnet and production:
   - Enable **per UserOperation** and/or **global** maximums with modest caps so a bug cannot drain your sponsorship budget.

---

## 4. Contract restrictions (two-phase)

**First-time setup**

- Leave **Contract restrictions** **OFF** until you complete **one full** gasless path: deploy smart account → link executor → at least one sponsored `clickFor`.
- The **first** UserOp may touch **account factory / Kernel** contracts, not only `ClickMintGame`. If restrictions are too tight too early, sponsorship will fail.

**After gasless clicks work**

- Turn **Contract restrictions** **ON**.
- Add your deployed **`ClickMintGame`** address as an allowed **to** contract for `clickFor`.
- If UserOps start failing with “rejected” in Pimlico logs, add any additional **to** addresses Pimlico shows (often factory/bootstrap contracts), or temporarily widen the allowlist while you map the full call graph.

Restrictions are **on-chain contract addresses** — not IPFS or frontend URLs.

---

## 5. Copy the policy id into the frontend

1. After **Create Policy**, copy the **policy id** from the dashboard.
2. Add to **`frontend/.env.local`** (and Vercel):

   ```bash
   NEXT_PUBLIC_PIMLICO_SPONSORSHIP_POLICY_ID="your-policy-id"
   ```

3. The app passes this id as **paymaster context** when requesting sponsorship (required if `pm_getPaymasterData` errors without context).

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_PIMLICO_API_KEY` | Pimlico RPC (`api.pimlico.io/v2/84532/...`). |
| `NEXT_PUBLIC_PIMLICO_SPONSORSHIP_POLICY_ID` | Policy id for paymaster **context**. |

---

## 6. Verify end-to-end

1. Connect a wallet on **Base Sepolia** in the app.
2. Open **Enable gasless clicks** → complete **Sign & enable** (smart account deploy UserOp if prompted).
3. Submit the **EOA** transaction **`setClickExecutor(smartAccount)`** on the game (normal gas).
4. Click **CLICK** with gasless active — each click should **not** prompt for gas; Basescan should show the **smart account** calling **`clickFor(your EOA)`**.
5. In Pimlico, confirm UserOps are **accepted** (not rejected by policy).

If something fails, check Pimlico’s **rejected UserOp** / logs for the exact revert or policy reason, then adjust limits or contract allowlist.

---

## 7. Production notes

- Rotate API keys if exposed; restrict keys in Pimlico dashboard where possible.
- Tighten **limits** and **contract allowlist** before mainnet.
- Base **mainnet** chain id and Pimlico endpoints differ — create a **separate** policy and env set for mainnet when you are ready.
