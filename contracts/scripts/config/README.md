# Economy presets (`economy.ts`)

Deploy-time presets are **`TESTNET_PRESET`** and **`MAINNET_PRESET`**. Choose with **`DEPLOY_ECONOMY=testnet`** (default) or **`mainnet`** in `deploy.ts`.

| Field | Testnet (Base Sepolia / QA) | Mainnet-style |
|--------|----------------------------|---------------|
| **CLICK `maxSupply`** | `1_000_000 * 1e18` | `100_000_000_000 * 1e18` |
| **Binary Trophy `maxSupply`** | `10` | `10_000` |
| **`vestingDuration` (CLICK)** | `600` s (10 min) | `604_800` s (7 days) |
| **`clickCostCredits`** | `1e13` wei (~0.00001 ETH of credits per click) | `1e18 / (MAINNET_ETH_USD × 100)` (~1 cent/click at default **3500** USD/ETH) |
| **`clicksPerHashTier`** | `50_000` (looser QA) | `2_500` (tighter) |
| **`clickPerEthWei` / `baseClickReward`** | shared defaults | shared defaults |

Credits on-chain are **wei-denominated** (deposit wei + bonus, minus `clickCostCredits` per click).

## Live `setEconomy` only

`set-economy-round.ts` uses **`ECONOMY=testnet|mainnet`** to patch **`clickPerEthWei`**, **`clickCostCredits`**, **`baseClickReward`** on an existing game. It does **not** change **`CLICK.maxSupply`**, **vesting duration**, **trophy cap**, or **`clicksPerHashTier`** (immutable from deploy).

To fix a game that shows **billions** of Click Credits, on-chain **`clickCostCredits`** is often **1 wei**. Owner runs:

```bash
GAME_ADDRESS=0x... ECONOMY=testnet npx hardhat run scripts/set-economy-round.ts --network baseSepolia
```

Edit **`economy.ts`** to change **`MAINNET_ETH_USD`**, **`TESTNET_CLICK_COST_CREDITS`**, or shared POT/reward defaults.
