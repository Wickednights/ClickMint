# ClickMint — post-deploy verification (read-only)

Run this **immediately after** `deploy.ts` (or any redeploy) before refreshing frontend env. No write transactions — only `eth_call` reads.

## Deploy modes (`DEPLOY_ECONOMY`)

| | **testnet** (default) | **mainnet** |
|--|----------------------|-------------|
| **CLICK `maxSupply` (wei)** | `1_000_000 * 1e18` | `100_000_000_000 * 1e18` |
| **Trophy max supply** | `10` | `10_000` |
| **Vesting** | `600` s | `604_800` s |

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
# Mainnet-style (100B tokens):
# $env:EXPECTED_MAX_SUPPLY_WEI="100000000000000000000000000000"
npx hardhat run scripts/verify-deployment.ts --network baseSepolia
```

Also read **`CLICK.vestingDuration()`** on Basescan if you need to confirm 600 vs 604800.

npm shorthand:

```bash
cd contracts
CLICK_ADDRESS=0x... GAME_ADDRESS=0x... TROPHY_ADDRESS=0x... npm run verify:base-sepolia
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
| `CLICK.vestingDuration` | `600` (testnet) or `604800` (mainnet) |
| Game `paused` / `isPaused` | `false` unless you intentionally paused |
| Game `trophyNft` | Trophy address if trophies are live |
| Trophy `maxSupply` / `clickMintGame` | Match preset and game link |

## Frontend env alignment

Set **`NEXT_PUBLIC_DEPLOY_ECONOMY=testnet`** or **`mainnet`** to match **`DEPLOY_ECONOMY`** used at deploy (header hint only).

For **gasless** QA on Base Sepolia, also set **`NEXT_PUBLIC_PIMLICO_API_KEY`** and (after creating a policy in the Pimlico dashboard) **`NEXT_PUBLIC_PIMLICO_SPONSORSHIP_POLICY_ID`** — see **`docs/TESTNET_E2E_CHECKLIST.md`** Part B.

## Events (owner / ops)

After admin txs, confirm the intended logs exist — e.g. **`GameSet`** on CLICK, **`AddressesUpdated`** / **`EconomyUpdated`** on game, **`GamePaused` / `GameUnpaused`** (plus OZ **`Paused`/`Unpaused`**), **`ClickMintGameSet`** on trophy, **`Swept`** on treasury/secret.

See also [SYSTEM_VERIFICATION.md](./SYSTEM_VERIFICATION.md) for full gameplay QA.
