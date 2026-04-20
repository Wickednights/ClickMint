# Economy presets (`economy.ts`)

Deploy-time presets are **`TESTNET_PRESET`** and **`MAINNET_PRESET`**. Choose with **`DEPLOY_ECONOMY=testnet`** (default) or **`mainnet`** in `deploy.ts`.

| Field | Testnet (Base Sepolia — smoke / cheap) | Mainnet-style (Base mainnet QA + prod) |
|--------|---------------------------------------|----------------------------------------|
| **ERC20 / ERC721 names** | **`ClickMint Test` / `tCLICK`**; trophy **`tBTROPHY`** | **`ClickMint` / `CLICK`**; trophy **`BTROPHY`** |
| **CLICK `maxSupply`** | `1_000_000 * 1e18` (**1M**) | `10_000_000_000 * 1e18` (**10B**) |
| **Binary Trophy `maxSupply`** | `10` | `10_000` |
| **`vestingDuration` (CLICK)** | `600` s (~10 min) | `2_592_000` s (**30 days**) |
| **`clickCostCredits`** | **`0.0000001 ETH`** of credits per click (ultra-cheap loops) | `1e18 / (MAINNET_ETH_USD × 10)` (~**$0.10/click** at default **3500** USD/ETH) |
| **`minPotClicks`** | `5` | `10` |
| **`baseClickReward`** | **`1e18`** (1 CLICK per click) | **`1e18`** |
| **`clicksPerHashTier`** | `50_000` (looser QA) | `1_000` (tighter) |
| **`clickPerEthWei`** | shared default (**legacy**; POT pays **native ETH**) | shared default |

Credits on-chain are **wei-denominated** (deposit wei + bonus, minus `clickCostCredits` per click).

## Live `setEconomy` only

`set-economy-round.ts` uses **`ECONOMY=testnet|mainnet`** to patch **`clickPerEthWei`**, **`clickCostCredits`**, **`baseClickReward`** on an existing game. It does **not** change **`CLICK.maxSupply`**, **vesting duration**, **trophy cap**, or **`clicksPerHashTier`** (immutable from deploy).

To fix a game that shows **billions** of Click Credits, on-chain **`clickCostCredits`** may be mis-set. Owner runs:

```bash
GAME_ADDRESS=0x... ECONOMY=testnet npx hardhat run scripts/set-economy-round.ts --network baseSepolia
# Base mainnet (8453):
GAME_ADDRESS=0x... ECONOMY=mainnet npx hardhat run scripts/set-economy-round.ts --network base
```

Edit **`economy.ts`** to change **`MAINNET_ETH_USD`**, **`TESTNET_CLICK_COST_CREDITS`**, **`TESTNET_PRESET.branding`**, or shared defaults.
