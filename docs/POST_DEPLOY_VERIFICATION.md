# ClickMint — post-deploy verification (read-only)

Run this **immediately after** `deploy.ts` (or any redeploy) before refreshing frontend env. No write transactions — only `eth_call` reads.

## Deploy modes (`DEPLOY_ECONOMY`)

| | **testnet** (default) | **mainnet** |
|--|----------------------|-------------|
| **CLICK `maxSupply` (wei)** | `1_000_000 * 1e18` (**1M**) | `10_000_000_000 * 1e18` (**10B**) |
| **Trophy max supply** | `10` | `10_000` |
| **Vesting** | `600` s (~10 min) | `2_592_000` s (**30 days**) |

Use **`EXPECTED_MAX_SUPPLY_WEI`** below to assert the CLICK cap matches the mode you deployed.

## Automated script (`contracts/`)

From `contracts/` with RPC + addresses in environment (same pattern as `set-game.ts`; signer optional for reads but Hardhat may still need `DEPLOYER_KEY` for network config):

```powershell
cd contracts
$env:CLICK_ADDRESS="0xYourClick"
$env:GAME_ADDRESS="0xYourGame"
$env:TROPHY_ADDRESS="0xYourTrophy"
# Testnet (1M tokens):
$env:EXPECTED_MAX_SUPPLY_WEI="1000000000000000000000000"
# Mainnet-style (10B tokens):
# $env:EXPECTED_MAX_SUPPLY_WEI="10000000000000000000000000000"
npx hardhat run scripts/verify-deployment.ts --network baseSepolia
```

**Base mainnet** (chain id **8453**): same env vars; use **`--network base`** or **`npm run verify:base`**. On **[Basescan](https://basescan.org)** (not Sepolia), confirm reads.

Also read **`CLICK.vestingDuration()`** on the explorer if you need to confirm **600** (testnet) vs **2_592_000** (mainnet). On testnet, confirm **`name()`** / **`symbol()`** show **ClickMint Test** / **tCLICK** when **`DEPLOY_ECONOMY=testnet`**.

npm shorthand:

```bash
cd contracts
CLICK_ADDRESS=0x... GAME_ADDRESS=0x... TROPHY_ADDRESS=0x... npm run verify:base-sepolia
CLICK_ADDRESS=0x... GAME_ADDRESS=0x... TROPHY_ADDRESS=0x... npm run verify:base
```

**Checks:**

- `CLICK.maxSupply` (optionally equals `EXPECTED_MAX_SUPPLY_WEI`)
- `CLICK.game` matches `GAME_ADDRESS`
- `ClickMintGame.clickToken` matches `CLICK_ADDRESS`
- `game.paused()` and `game.isPaused()` (alias) agree
- `game.trophyNft()` and, if `TROPHY_ADDRESS` set, `BinaryTrophyNFT.clickMintGame` reciprocity with the game

## Manual spot-checks (Basescan)

| Read | Expect |
|------|--------|
| `CLICK.game` | Deployed `ClickMintGame` |
| `CLICK.maxSupply` | Matches **`DEPLOY_ECONOMY`** (see table above) |
| `CLICK.vestingDuration` | `600` (testnet) or `2592000` (mainnet — 30d) |
| Game `paused` / `isPaused` | `false` unless you intentionally paused |
| Game `trophyNft` | Trophy address if trophies are live |
| Trophy `maxSupply` / `clickMintGame` | Match preset and game link |

## Frontend env alignment

Set **`NEXT_PUBLIC_DEPLOY_ECONOMY=testnet`** or **`mainnet`** to match **`DEPLOY_ECONOMY`** used at deploy (header hint only).

Set **`NEXT_PUBLIC_CHAIN_ID`** to **`84532`** (Sepolia) or **`8453`** (Base mainnet) so wagmi, address fallbacks, Pimlico URLs, and **`/api/cron/finalize-round`** target the correct chain.

For **gasless** QA, set **`NEXT_PUBLIC_PIMLICO_API_KEY`** and (if required) **`NEXT_PUBLIC_PIMLICO_SPONSORSHIP_POLICY_ID`** — enable **84532** and/or **8453** in the Pimlico dashboard to match **`NEXT_PUBLIC_CHAIN_ID`**. See **`docs/TESTNET_E2E_CHECKLIST.md`** Part B.

## Events (owner / ops)

After admin txs, confirm the intended logs exist — e.g. **`GameSet`** on CLICK, **`AddressesUpdated`** / **`EconomyUpdated`** on game, **`GamePaused` / `GameUnpaused`** (plus OZ **`Paused`/`Unpaused`**), **`ClickMintGameSet`** on trophy, **`Swept`** on treasury/secret.

See also [SYSTEM_VERIFICATION.md](./SYSTEM_VERIFICATION.md) for full gameplay QA.
