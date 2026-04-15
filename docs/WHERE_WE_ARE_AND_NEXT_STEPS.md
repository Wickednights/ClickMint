# ClickMint — where we are now & next steps

Living snapshot for founders and reviewers. Update this when milestones shift.

---

## Where we are now

### Product

- **Core loop:** deposit ETH → credits → click → **CLICK** vesting, hourly **ETH POT** (native payout to winner), dynamic clickhash difficulty. **Base Sepolia** = cheap smoke + **`tCLICK` / `tBTROPHY`** branding; **Base mainnet** = production economics + primary QA for LP/DEX/real fees.
- **Economy presets:** `DEPLOY_ECONOMY=testnet|mainnet` in **`economy.ts`** — testnet uses ultra-low **`clickCostCredits`**, low **`minPotClicks`**, and explicit test names; mainnet uses ~1¢/click credits, 100B cap, 7d vesting, 10k trophies.
- **Gasless clicks (optional):** ZeroDev Kernel + Pimlico; **EOA** remains player; smart account only executes **`clickFor(eoa)`** after **setClickExecutor** linking. **Pimlico policy must allow chain `8453`** for mainnet QA, not only Sepolia.

### Technical

| Layer | Status |
|-------|--------|
| Solidity | Core contracts implemented; parameterized **CLICK** / **BinaryTrophyNFT** names for test vs prod; **`potKeeper`** + owner may **`finalizeHour`**. **Not** a substitute for professional audit. |
| POT randomness | Pseudorandom — **needs upgrade** (e.g. VRF) for high-stakes mainnet. |
| Trophy ↔ game | Trophy **not** auto-minted from `click()` in MVP — manual/ops path; on-chain SVG metadata. |
| Escrow | Deployed; integration optional. |
| Frontend | Next.js 15, wagmi, **`NEXT_PUBLIC_CHAIN_ID`** (8453 vs 84532), dashboard, POT history (ETH), audio, in-flight click guards, AA hook. |
| Automation | **`potKeeper`** on game + optional **Vercel cron** → `/api/cron/finalize-hour` (keeper key pays gas). |
| Sponsorship funding | **Developer-billed via Pimlico** — **no** automatic skim from user deposits into Pimlico. |

### Docs & ops

- HOWTO, ARCHITECTURE, ECONOMY, KNOWN_ISSUES, DEVELOPMENT_LOG, **POST_DEPLOY_VERIFICATION** present.
- **ARCHITECTURE_FOR_GROK_REVIEW.md** for external model check (Grok / advisors); second **Grok** pass noted stronger **cap + events**.

---

## Near-term next steps (suggested)

1. **Base mainnet QA** — Deploy with **`DEPLOY_ECONOMY=mainnet`**, verify, set **`potKeeper`** to the Vercel cron wallet (or ops bot), fund keeper with **ETH**, exercise **real** LP / Aerodrome or Uniswap v3 path; see **HOWTO** + **LP_AERODROME_AND_AUTOMATION**.
2. **Solidity review / audit scope** — PRI: `ClickMintGame` (fees, reentrancy, POT finalization), `CLICK` (cap, vesting, early spend), `clickFor` / executor abuse model, `BinaryTrophyNFT` revenue math.
3. **Production POT fairness** — Replace prevrandao-only draw with **Chainlink VRF** (or agreed alternative) before mainnet marketing.
4. **Deploy discipline** — Constructor/name changes require **full redeploy** of CLICK + trophy + game wiring; refresh **`frontend/lib/addresses.ts`**, **`.env`**, and **`docs/DEPLOYMENT_ADDRESSES.md`** after every deploy.
5. **POT finalization UX** — **`finalizeHour`**: **`owner`** or **`potKeeper`**; document/hide manual “Finalize” for EOAs if desired.
6. **Pimlico / scale** — Confirm **sponsorship policy** on **8453** and **84532**, **rate limits**, and **billing tier**; monitor UserOp failures.
7. **Optional: protocol-funded gas** — If product should self-fund sponsorship from volume, spec **BPS → vault → paymaster top-up** (see ARCHITECTURE_FOR_GROK_REVIEW) before coding.
8. **Trophy integration** — On-click probability → `trophyNft.mintTrophyForPlayer` from `_click`, or keep **owner `mintTrophyForPlayer`** on game for ops drops.
9. **Go-live checklist** — Legal/terms, key custody, multisig owner, incident runbooks, subgraph/indexer if needed.

---

## How to use this file

- **Weekly:** Adjust “where we are” and reorder “next steps” by priority.
- **After releases:** Add a one-line dated note at the bottom (or rely on DEVELOPMENT_LOG for detail).

---

### Last oriented update

- **2026-04-13:** **Mainnet-first QA** — Hardhat **`base`** network, frontend **`NEXT_PUBLIC_CHAIN_ID`**, testnet **tCLICK** branding + cheaper economy; **ETH POT** + **`potKeeper`** + cron documented across **ARCHITECTURE_FOR_GROK_REVIEW**, **HOWTO**, and env examples. Base Sepolia remains **smoke** only.
