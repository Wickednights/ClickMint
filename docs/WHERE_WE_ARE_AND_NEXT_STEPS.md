# ClickMint — where we are now & next steps

Living snapshot for founders and reviewers. Update this when milestones shift.

---

## Where we are now

### Product

- **Core loop live on Base Sepolia:** deposit ETH → credits → CLICK button → $CLICK vesting, hourly POT mechanics, dynamic clickhash difficulty.
- **Economy presets:** testnet (readable credits, 1M $CLICK cap, short vesting, small trophy cap) vs mainnet-style deploy (100B cap, 7d vesting, 10k trophies, tighter hash tier) via `DEPLOY_ECONOMY` and `economy.ts`.
- **Gasless clicks (optional):** ZeroDev Kernel + Pimlico; **EOA** remains player; smart account only executes **`clickFor(eoa)`** after **setClickExecutor** linking.

### Technical

| Layer | Status |
|-------|--------|
| Solidity | Core contracts implemented; **polish pass** (pause events, `isPaused`, trophy/admin events, post-deploy verify script). **Ready for redeploy** with **100B mainnet-style `CLICK` cap** once ops run **`verify-deployment.ts`** and refresh env — **not** a substitute for professional audit. |
| POT randomness | Pseudorandom — **needs upgrade** (e.g. VRF) for high-stakes mainnet. |
| Trophy ↔ game | Trophy **not** auto-minted from `click()` in MVP — manual/ops path. |
| Escrow | Deployed; integration optional. |
| Frontend | Next.js 15, wagmi, dashboard, documentation page, debug panel, AA hook. |
| Sponsorship funding | **Developer-billed via Pimlico** — **no** automatic skim from user deposits into Pimlico. |

### Docs & ops

- HOWTO, ARCHITECTURE, ECONOMY, KNOWN_ISSUES, DEVELOPMENT_LOG, **POST_DEPLOY_VERIFICATION** present.
- **ARCHITECTURE_FOR_GROK_REVIEW.md** for external model check (Grok / advisors); second **Grok** pass noted stronger **cap + events**.

---

## Near-term next steps (suggested)

1. **Solidity review / audit scope** — PRI: `ClickMintGame` (fees, reentrancy, POT finalization), `CLICK` (cap, vesting, early spend), `clickFor` / executor abuse model, `BinaryTrophyNFT` revenue math.
2. **Production POT fairness** — Replace prevrandao-only draw with **Chainlink VRF** (or agreed alternative) before mainnet marketing.
3. **Deploy discipline** — Frozen addresses in `frontend/.env.example` lag behind new bytecode after changes; **redeploy + env refresh** after any contract change (`clickFor`, economy, caps, pause/trophy wiring).
4. **POT finalization UX** — `finalizeHour` is **owner-only**; add keeper bot or hide player “Finalize” unless `address === game.owner()`.
5. **Pimlico / scale** — Confirm **sponsorship policy** (contract allowlist), **rate limits**, and **billing tier** for expected MAU; add monitoring/alerts on UserOp failures.
6. **Optional: protocol-funded gas** — If product should self-fund sponsorship from volume, spec **BPS → vault → paymaster top-up** (see ARCHITECTURE_FOR_GROK_REVIEW §2.2) before coding.
7. **Trophy integration** — On-click probability → `trophyNft.mintTrophyForPlayer` from `_click`, or keep **owner `mintTrophyForPlayer`** on game for ops drops.
8. **Mainnet checklist** — Legal/terms, key custody, multisig owner, incident runbooks, subgraph/indexer if needed.

---

## How to use this file

- **Weekly:** Adjust “where we are” and reorder “next steps” by priority.
- **After releases:** Add a one-line dated note at the bottom (or rely on DEVELOPMENT_LOG for detail).

---

### Last oriented update

- **2026-04-06:** Redeploy polish documented in **DEVELOPMENT_LOG**; run **`POST_DEPLOY_VERIFICATION`** after each contract deploy before pointing the frontend at new addresses.
