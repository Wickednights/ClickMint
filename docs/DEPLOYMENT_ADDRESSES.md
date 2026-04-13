# Deployment addresses — Base Sepolia

**Chain:** Base Sepolia (`84532`).  
**Live defaults in repo:** `frontend/lib/addresses.ts` (`baseSepoliaDeployed`) and `frontend/.env.example`.

---

## Maintenance — on every new full deploy

1. **Copy** the entire **Active deployment** table below into **Archive** as a new dated subsection (keep newest archive entries near the top).
2. **Replace** **Active deployment** with the new addresses from `npx hardhat run scripts/deploy.ts --network baseSepolia` (or your CI output).
3. Update **`frontend/lib/addresses.ts`**, **`frontend/.env.example`**, **`docs/DEVELOPMENT_LOG.md`**, and any Vercel / local `.env` secrets docs you maintain.

Do **not** delete archive rows — explorers, LP pools, and old txs stay tied to those contracts forever.

---

## Active deployment

_Supersedes all entries in Archive._

| Role | Address |
|------|---------|
| **CLICK** | `0xeB4928cf96D10F47d76d5997Ef1179c242C95Dc1` |
| **Treasury** | `0x9869d1e0e4416b7e3B246D9C444a6355cA19344c` |
| **SecretPrizeWallet** | `0xeCB7132cc27e177f7028475f58Ee8b3D43F074E2` |
| **ClickMintGame** | `0x1EFf9a6c3F3C438a2929301d1AEeD9D048f04D6B` |
| **BinaryTrophyNFT** | `0xd190828F946659a1ff338AD6bC6BAF7C59f9eefD` |
| **Escrow** | `0x3F71C068aaC3359332E5c464E91F0c8b23dF590a` |

**Notes:** `DEPLOY_ECONOMY=testnet`; deploy ~ **2026-04-12** (UTC). Includes CLICK `mintForTesting`, constructor `lpBootstrapSupplyWei` (0 on testnet), `CLICK.setGame(game)` in `deploy.ts`.

---

## Archive (superseded deployments)

### 2026-04-07 — prior Base Sepolia set (“Phase 1” in repo history)

| Role | Address |
|------|---------|
| **CLICK** | `0x6CB127e069D98F6A0B1851585670495DA93cB5D5` |
| **Treasury** | `0x3B04A33D89F114185FF7194a1f8b13b086999471` |
| **SecretPrizeWallet** | `0xB4BD710d5691Dbb7BF02791ddAd9f818F4a47Af5` |
| **ClickMintGame** | `0xEA612843365Cc1B53f9FC6988d6edD54aeD84013` |
| **BinaryTrophyNFT** | `0xE367E485fF1C2946d4435bab6649C576Ca526476` |
| **Escrow** | `0x2457623b777DE271CDC9d9D37E3a93f19fcc5960` |

**Notes:** Logged in `DEVELOPMENT_LOG.md` under **2026-04-07T18:00:00Z**. Older bytecode (no `mintForTesting` / no LP bootstrap constructor arg).
