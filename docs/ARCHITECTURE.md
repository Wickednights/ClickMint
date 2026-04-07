# ClickMint — architecture

High-level map of how deployed pieces fit together. Arrows show value or control flow that matters for the current game UI.

## System diagram

```mermaid
flowchart LR
  User([User EOA])
  UI[Next.js frontend]

  Game[ClickMintGame]
  CLICK[CLICK ERC20]
  Treasury[Treasury]
  Secret[SecretPrizeWallet]
  Trophy[BinaryTrophyNFT]
  Escrow[Escrow]

  User --> UI
  UI --> Game
  UI --> CLICK

  User -->|ETH deposit / click| Game
  Game -->|fee 1%| Treasury
  Game -->|fee 1%| Secret
  Game -->|fee 1%/pot slice| Game
  Game -->|grantVested / mint| CLICK

  Trophy -->|optional ETH revenue share| User
  User -->|NFT escrow flows| Escrow
```

**Note:** `BinaryTrophyNFT` and `Escrow` are deployed alongside the core loop; trophy mint/revenue and escrow are not fully orchestrated by `ClickMintGame` in the MVP scripts.

## Contract roles

### ClickMintGame

Central game contract. Holds **ETH credits** per user (`credits[address]`), hourly click stats, POT ETH per hour, and settlement state.

**POT funding:** Only `deposit()` adds ETH to `potEthByHour[currentHour]` (1% of each deposit). **`click()` does not add ETH** to the pot. `currentPotEth()` returns `potEthByHour[nowGameHour] + potCarry` (carry from prior finalizations). Expect **0 for “this hour”** if no one deposited in the current UTC game hour, even when global clicks > 0.

| Function / area | Role |
|-----------------|------|
| `deposit()` | User sends ETH; 3× 1% fees to treasury, secret wallet, and POT; remainder credited **1:1 as wei** to `credits[msg.sender]`. |
| `click()` | Optionally deducts `clickCostCredits` from credits; enforces per-block click limit; updates hour + 15m window bitmask; optional hash-tier gate; records participants for POT; if `baseClickReward > 0`, calls `CLICK.grantVested`. |
| `finalizeHour(hourId)` | After hour end + buffer, picks pseudo-random window + winner among eligible players; mints POT payout via `CLICK.mint(winner, payout)`; may carry ETH forward. |
| `setEconomy` / `setAddresses` | Owner tuning. |

**Important view getters:** `credits`, `click_costCredits`, `baseClickReward`, `currentPotEth`, `gameHour`, `totalClicksInHour`, `hourFinalized`, etc.

### CLICK (ERC20 + vesting)

Token cap `MAX_SUPPLY`. Game is **`onlyGame`**: `grantVested` (vesting vault schedule) and `mint` (POT).

| Function | Role |
|----------|------|
| `grantVested(to, amount)` | Game adds to user’s **internal vesting vault** (`_vault`): may mint already-vested slice; resets vesting clock for combined unvested + new amount. |
| `claimVested()` | User mints linearly vested portion to their wallet. |
| `earlySpendPending(amount)` | User burns from **unvested** slice only (`pendingVested` view = unvested cap); applies 30/30/20/20 split (burn/treasury/LP/user mints). Reverts `click: unvested` if `amount` too large. |
| `pendingVested(account)` | **Misleading name:** returns **unvested** wei still subject to linear vesting (and early-spend cap). |
| `claimable(account)` | Vested amount not yet claimed (can call `claimVested`). |
| `mint` | Game-only; used for POT winner payout (liquid mint, not vault). |

Transfer tax (if enabled) sends a BPS slice to `treasury`.

### Treasury & SecretPrizeWallet

Simple **receive + owner sweep** contracts. Game sends fee slices on each `deposit`.

### BinaryTrophyNFT

ERC721 + EIP-2981 royalties; owner **`mint`** in MVP; contract can receive ETH and accrue **per-token holder** `pendingEth` for `claimRevenue`. Not wired into `click()` in the core game contract.

### Escrow

Holds ERC721 in a **hold**; beneficiary (or owner) **`claim`** to release. Optional UX/game integration separate from `ClickMintGame`.

## Frontend mapping

| UI concern | Contract source |
|------------|-----------------|
| ETH credit balance | `ClickMintGame.credits(user)` |
| Plays left (display) | Derived from credits wei + UI constant `DISPLAY_PLAY_ETH` (`frontend/lib/game-display.ts`), not raw `credits / clickCostCredits` when cost is dust. |
| Unvested / early spend cap | `CLICK.pendingVested(user)` |
| Claimable | `CLICK.claimable(user)` |
| Per-click reward | `ClickMintGame.baseClickReward()` |
| POT | `currentPotEth`, `finalizeHour`, events `PotWin` |

## Security / production notes (brief)

- POT randomness uses block data + nonce — fine for testnet; production should use VRF or similar.
- Owner powers: game economy, treasury/secret addresses, CLICK treasury/LP/game pointer, trophy minting.
- Users must trust contract audits and upgrade policy (immutable game + token in standard deploy).
