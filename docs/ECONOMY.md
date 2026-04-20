# ClickMint economy — how numbers work

## Testnet vs mainnet presets (deploy)

All immutable deploy parameters live in **`contracts/scripts/config/economy.ts`** as **`TESTNET_PRESET`** and **`MAINNET_PRESET`**. **`deploy.ts`** reads **`DEPLOY_ECONOMY=testnet`** (default) or **`mainnet`**.

| | **Testnet** (Base Sepolia / QA) | **Mainnet-style** |
|--|--------------------------------|-------------------|
| **CLICK `maxSupply`** | `1_000_000 * 1e18` (**1M** tokens) | `10_000_000_000 * 1e18` (**10B** tokens) |
| **Binary Trophy `maxSupply`** | `10` | `10_000` |
| **`CLICK` vesting duration** | `600` s (**10 minutes**) | `2_592_000` s (**30 days**) |
| **`clickCostCredits`** | **`0.0000001 ETH`** in credit wei — very cheap smoke tests | ~**$0.10/click** intent at default **`MAINNET_ETH_USD`** (3500) |
| **`baseClickReward`** (vested CLICK / click) | **`1 * 1e18`** wei | **`1 * 1e18`** wei |
| **`minPotClicks`** | **`5`** | **`10`** |
| **`clicksPerHashTier`** | `50_000` (looser QA) | `1_000` (tighter) |
| **On-chain names** | **ClickMint Test** / **tCLICK**; trophy **tBTROPHY** | **ClickMint** / **CLICK**; **BTROPHY** |

Testnet values exist so you can hit caps quickly; mainnet values match [GAME_MECHANICS.md](GAME_MECHANICS.md). **Primary “real world” QA** (DEX/LP, explorers, keeper gas) targets **Base mainnet** — see [HOWTO.md](HOWTO.md).

**Frontend:** set **`NEXT_PUBLIC_DEPLOY_ECONOMY=testnet`** or **`mainnet`** to match how the contracts were deployed (header copy; not enforced on-chain).

**Post-deploy:** use [POST_DEPLOY_VERIFICATION.md](POST_DEPLOY_VERIFICATION.md) and optional **`EXPECTED_MAX_SUPPLY_WEI`**.

---

## Deposit routing (ETH), not “1% × 3”

Each **`deposit()`** routes **`msg.value`** by **basis points** on **`ClickMintGame`** (must sum to 10_000):

- **50%** — Click Pot accrual (ETH in the game for POT winners)
- **30%** — treasury (`call` to `treasury`)
- **10%** — Block Bet pool for that **minute** round
- **10%** — Binary Trophy `receive()` — NFT holder revshare (or treasury if trophy unset)

The user’s **credit balance** still increases by **`msg.value` + tier bonus** (wei-sized credits). This is separate from where the ETH is sent.

---

## Why you sometimes see "astronomical" Click Credits

The game stores **`credits` in wei-sized units**. Each **`click()`** subtracts **`clickCostCredits`** wei.

```text
plays remaining ≈ credits / clickCostCredits
```

- If **`clickCostCredits`** is tiny (e.g. test preset), deposits yield huge play counts — expected for Sepolia.
- **Mainnet** preset targets ~**$0.10/click**; verify on-chain **`clickCostCredits`** on your game (Debug page or explorer).

---

## Mapping "mainnet click cost" to quick-buy buttons

With **`MAINNET_ETH_USD`** (default 3500):

```text
clickCostCredits ≈ 1e18 / (ETH_USD * 10)
```

(~10 credits per $1 of notional at that ETH price, in product language; on-chain credits remain wei-based.)

---

## Files to edit

- `contracts/scripts/config/economy.ts` — presets for deploy + values reused by `set-economy-round.ts`
- Owner live patch (game only): `GAME_ADDRESS=... ECONOMY=testnet|mainnet npx hardhat run scripts/set-economy-round.ts --network <net>`

After redeploy, confirm **`CLICK.maxSupply`**, **`vestingDuration`**, and game economy getters match the preset (**`verify-deployment.ts`**).
