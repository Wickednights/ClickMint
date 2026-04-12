# Copilot (and similar) review recommendations — log

Use this file to **record suggestions** from GitHub Copilot, Cursor, or human review so we can apply them systematically across the repo.

**How to use:** Append new rows to the table (newest first). When implemented, set **Status** to `Done` and add the PR/commit or file reference.

---

## Log

| Date (UTC) | Area | Summary | Status | Notes / files |
|------------|------|---------|--------|----------------|
| 2026-04-12 | `ClickMintGame.sol` | **Do not** gate `setPotKeeper` with `whenNotPaused` | Done | Supersedes earlier “consistency” row: owner must rotate/clear a compromised keeper **while paused** before unpausing; `finalizeHour` stays `whenNotPaused` |
| 2026-04-12 | `game-display.ts` | `formatClickDisplayWei`: truncate (floor) wei to display decimals; `<0.01` for positive sub-step dust — avoid `Number` + `toLocaleString` rounding up | Done | Prevents UI showing more $CLICK than user can spend |
| 2026-04-12 | `account-abstraction.ts` | Preserve parse errors: `catch (e)` + `throw new Error(..., { cause: e })` for Pimlico fee parsing | Done | `pimlicoEstimateFeesPerGas` |
| 2026-04-12 | `clickmint-dashboard.tsx` | Stabilize `gameHour` RPC args: bucket `ts` by **on-chain** hour `(ts - RESET_BUFFER) / 3600`, not per-second `tickSec` | Done | Reduces cache churn; differs from naive `floor(ts/3600)*3600` |
| 2026-04-12 | `clickmint-dashboard.tsx` | Remove redundant `void timerTick` in `useMemo`; rely on deps | Done | Superseded by `tickSec` |
| 2026-04-12 | `escrow-panel.tsx` | Validate beneficiary with `isAddress` / `getAddress` before `deposit` | Done | |
| 2026-04-12 | `account-abstraction.ts` | Validate Pimlico gas price RPC shape before `hexToBigInt` | Done | `isGasPriceTier` + clear errors |

---

## Operations / wallets (not from Copilot)

| Date (UTC) | Area | Summary | Status | Notes |
|------------|------|---------|--------|--------|
| 2026-04-12 | MetaMask / Blockaid | New or rarely used domains (e.g. `*.vercel.app`) are often flagged as “malicious” until reputation improves. | Info | **Mitigations:** use a custom domain you control; in MetaMask use **Report** / dispute if available; ensure no phishing patterns; over time false positives can clear. Not fixable purely in app code. |

---

## Backlog (from earlier reviews — triage as needed)

| Idea | Where to look |
|------|----------------|
| Audit other bare `catch { }` that lose `cause` | `rg "catch \\{" frontend` |
| Other high-frequency `useReadContract` args derived from `Date.now()` or sub-minute ticks | Dashboard, hooks |
| Escrow / write paths: validate addresses at UI boundary | Panels with `0x` inputs |

---

## Maintenance

When closing an item, add a one-line note to `DEVELOPMENT_LOG.md` if your team uses it.
