# ClickMint — where we are now & next steps

Living snapshot for founders and reviewers. Update this when milestones shift.

---

## Where we are now

### Product

- **Core loop:** deposit ETH → credits → click → **CLICK** vesting, **minute** **ETH POT** + **Block Bet**, dynamic clickhash difficulty. **Base Sepolia** = cheap smoke + **`tCLICK` / `tBTROPHY`** branding; **Base mainnet** = production economics + primary QA for **Uniswap v2–style LP** / real fees (use **Preview** envs / **preview.clickmint.app** for staged tests).
- **Economy presets:** `DEPLOY_ECONOMY=testnet|mainnet` in **`economy.ts`** — testnet uses ultra-low **`clickCostCredits`**, low **`minPotClicks`**, and explicit test names; mainnet targets ~$0.10/click (via ETH/USD), **10B** cap, **30d** vesting, 10k trophies (see **`docs/GAME_MECHANICS.md`**).
- **Gasless clicks (optional):** ZeroDev Kernel + Pimlico; **EOA** remains player; smart account only executes **`clickFor(eoa)`** after **setClickExecutor** linking. **Pimlico policy must allow chain `8453`** for mainnet QA, not only Sepolia.

### Technical

| Layer | Status |
|-------|--------|
| Solidity | Core contracts implemented; parameterized **CLICK** / **BinaryTrophyNFT** names for test vs prod; **`potKeeper`** + owner may **`finalizeRound`**. **Not** a substitute for professional audit. |
| POT randomness | Pseudorandom — **needs upgrade** (e.g. VRF) for high-stakes mainnet. |
| Trophy ↔ game | Probabilistic **`mintTrophyForPlayer`** from **`_click`** (`trophyDropWeight` / denom); owner mint path for ops; on-chain SVG metadata. |
| Escrow | Deployed; integration optional. |
| Frontend | Next.js 15, wagmi, **`NEXT_PUBLIC_CHAIN_ID`** (8453 vs 84532), dashboard, POT history (ETH), audio, in-flight click guards, AA hook. |
| Automation | **`potKeeper`** on game + optional **Vercel cron** → `/api/cron/finalize-round` (keeper key pays gas). |
| Sponsorship funding | **Developer-billed via Pimlico** — **no** automatic skim from user deposits into Pimlico. |

### Docs & ops

- HOWTO, ARCHITECTURE, ECONOMY, **ENVIRONMENT_VARIABLES**, KNOWN_ISSUES, DEVELOPMENT_LOG, **POST_DEPLOY_VERIFICATION** present.
- **ARCHITECTURE_FOR_GROK_REVIEW.md** for external model check (Grok / advisors); second **Grok** pass noted stronger **cap + events**.

---

## Near-term next steps (suggested)

1. **Base Sepolia Phase 0** — Full **`deploy.ts`** with **`DEPLOY_ECONOMY=testnet`**, update [DEPLOYMENT_ADDRESSES.md](DEPLOYMENT_ADDRESSES.md), all **`NEXT_PUBLIC_*`** (see [ENVIRONMENT_VARIABLES.md](ENVIRONMENT_VARIABLES.md)), **`set-pot-keeper`** if using cron, then run [TESTNET_E2E_CHECKLIST.md](TESTNET_E2E_CHECKLIST.md).
2. **Base mainnet QA** — Deploy with **`DEPLOY_ECONOMY=mainnet`**, verify, set **`potKeeper`**, fund keeper, exercise **LP** (Uniswap v2–style per [LP_AERODROME_AND_AUTOMATION.md](LP_AERODROME_AND_AUTOMATION.md)).
3. **Solidity review / audit scope** — PRI: `ClickMintGame` (fees, reentrancy, POT + Block Bet finalization), `CLICK` (cap, vesting, early spend), `clickFor` / executor abuse model, `BinaryTrophyNFT` revenue math.
4. **Production POT fairness** — Replace prevrandao-only draw with **Chainlink VRF** (or agreed alternative) before mainnet marketing.
5. **Deploy discipline** — Constructor/name changes require **full redeploy** of CLICK + trophy + game wiring; refresh **`frontend/lib/addresses.ts`**, **`.env`**, and **`docs/DEPLOYMENT_ADDRESSES.md`** after every deploy.
6. **POT finalization UX** — **`finalizeRound`**: **`owner`** or **`potKeeper`**; cron route **`/api/cron/finalize-round`**.
7. **Pimlico / scale** — Confirm **sponsorship policy** on **8453** and **84532**, **rate limits**, and **billing tier**; monitor UserOp failures.
8. **Optional: protocol-funded gas** — If product should self-fund sponsorship from volume, spec **BPS → vault → paymaster top-up** (see ARCHITECTURE_FOR_GROK_REVIEW) before coding.
9. **Go-live checklist** — Legal/terms, key custody, multisig owner, incident runbooks, subgraph/indexer if needed.

---

## How to use this file

- **Weekly:** Adjust “where we are” and reorder “next steps” by priority.
- **After releases:** Add a one-line dated note at the bottom (or rely on DEVELOPMENT_LOG for detail).

---

### Last oriented update

- **2026-04-06:** **Docs + Phase 0 prep** — Canonical **10B / 30d** mainnet preset, **50/30/10/10** deposit BPS (pot / treasury / block bet / NFT revshare), **`finalizeRound`** + Block Bet **`claimBlockBetEth`** reflected across **ARCHITECTURE**, **ECONOMY**, **HOWTO**, **POST_DEPLOY**, **TESTNET_E2E**, **GROK review**, **`/documentation`**, **`ENVIRONMENT_VARIABLES.md`**, **README**. **Phase 0** expanded in **PHASED_DEPLOY_AND_MAINNET_QA**. Next: redeploy contracts on Sepolia and refresh env + **DEPLOYMENT_ADDRESSES**.
