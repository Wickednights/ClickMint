# ClickMint economy — how numbers work

## Testnet vs mainnet presets (deploy)

All immutable deploy parameters live in **`contracts/scripts/config/economy.ts`** as **`TESTNET_PRESET`** and **`MAINNET_PRESET`**. **`deploy.ts`** reads **`DEPLOY_ECONOMY=testnet`** (default) or **`mainnet`**.

| | **Testnet** (Base Sepolia / QA) | **Mainnet-style** |
|--|--------------------------------|-------------------|
| **CLICK `maxSupply`** | `1_000_000 * 1e18` (1M tokens) | `100_000_000_000 * 1e18` (100B tokens) |
| **Binary Trophy `maxSupply`** | `10` | `10_000` |
| **`CLICK` vesting duration** | `600` seconds (10 minutes) | `604_800` seconds (7 days) |
| **`clickCostCredits`** | `0.00001 ETH` in credit wei (`1e13`) — ~100 clicks per 0.001 ETH | ~**1 US cent** per click at **`MAINNET_ETH_USD`** (default 3500) |
| **`clicksPerHashTier`** | `50_000` (looser, QA-friendly) | `2_500` (tighter ramp) |

Testnet values exist so you can hit **`CLICKBadSupply`** and trophy cap quickly; mainnet values match production intent.

**Frontend:** set **`NEXT_PUBLIC_DEPLOY_ECONOMY=testnet`** or **`mainnet`** to match how the contracts were deployed (header copy only; not enforced on-chain).

**Post-deploy:** use **`docs/POST_DEPLOY_VERIFICATION.md`** and optional **`EXPECTED_MAX_SUPPLY_WEI`** to assert the CLICK cap.

## Why you sometimes see "astronomical" Click Credits

The game stores **`credits` in wei-sized units** (see `ClickMintGame.deposit`: balance increases by the ETH you sent plus tier bonus, in wei).

Each **`click()`** subtracts **`clickCostCredits`** wei from that balance.

```text
plays remaining = credits / clickCostCredits
```

- If **`clickCostCredits = 1 wei`** (a broken or toy test config), **any** deposit gives **~10^15 clicks** from 0.001 ETH — the UI is correct; the **parameter** is wrong.
- The intended **mainnet** cost is about **one US cent per click**: at **$3,500 / ETH**, one cent is **1 / 350,000 ETH**, i.e. **`1e18 / 350000` wei** (~`2.86 x 10^12` wei), **not** 1 wei.

Always verify on-chain: read `clickCostCredits` on your `ClickMintGame` (Debug page or Basescan). If it is `1`, fix with `setEconomy` / **`set-economy-round.ts`** (`ECONOMY=testnet|mainnet`).

## Mapping "1 cent per click" to quick-buy buttons

With the **mainnet** formula:

```text
clickCostCredits = 1e18 / (ETH_USD * 100)
```

Deposit `d` ETH so credit principal is about `d * 1e18` wei (plus bonus). Clicks from that deposit are about `(d * 1e18) / clickCostCredits`, roughly `d * (ETH_USD * 100)` when ignoring bonus.

Example: **$3,500/ETH**, **0.001 ETH** deposit gives about **350 clicks** before bonus tiers.

## "$1M by full mint" — what the contracts actually bound

- **`CLICK` max supply** is **`immutable maxSupply` at deploy**: **100B** whole tokens (18 decimals) on **mainnet** preset; **1M** on **testnet** — see **`economy.ts`**.
- **Treasury ETH** from gameplay is **`1%` of every `deposit()`** (plus 1% to POT ETH and 1% to secret wallet; users still get full advertised credits). USD revenue is **deposit ETH x fee % x ETH/USD**, not "clicks" alone.

Order-of-magnitude check (~1 cent of **credit spend** per click, **$3500/ETH**): each click pulls about **`1 / 3_500_000 ETH`** from `credits`; **1% treasury** on that flow is **`1e-2 / 3_500_000 ETH`**, about **$0.00000286** at $3500/ETH. **~3.5 trillion** such clicks yields on the order of **$1M** to treasury — so **`$1M` aligns with very large cumulative deposit throughput**, not the **100B** cap by itself.

The on-chain knobs you tune for **player-facing math** are mainly:

- **`clickCostCredits`** — $/click feel  
- **`baseClickReward`** — **10 $CLICK** per successful `click()` toward **`maxSupply`** (plus POT `mint`, early spend, etc.)  
- **`clicksPerHashTier`** — how fast the clickhash gate tightens per UTC game hour  
- **Fee BPS** (fixed in `ClickMintGame`) — **1%** each to treasury / POT ETH / secret  
- **Trophy / escrow** rules — separate products  

## Files to edit

- `contracts/scripts/config/economy.ts` — presets for deploy + values re-used by `set-economy-round.ts`
- Owner live patch (game only): `GAME_ADDRESS=... ECONOMY=testnet|mainnet npx hardhat run scripts/set-economy-round.ts --network <net>`

After redeploy, confirm on-chain **`CLICK.maxSupply`** and **`vestingDuration`** match the preset (**`verify-deployment.ts`** — **`docs/POST_DEPLOY_VERIFICATION.md`**).
