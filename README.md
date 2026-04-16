# ClickMint

ClickMint — fair on-chain clicker on Base with 2 CPS limit, vesting + 30/30/20/20 early spend, hourly CLICK POT (min clicks + random 15‑min window + reset buffer), 3% ETH fee split, revenue-sharing Binary Trophy NFTs + secret prize wallet (see contracts for exact constants).

## Docs

| Document | Purpose |
|----------|---------|
| [docs/HOWTO.md](docs/HOWTO.md) | Setup, deploy, env, frontend, troubleshooting |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | How contracts interact; main functions |
| [docs/ARCHITECTURE_FOR_GROK_REVIEW.md](docs/ARCHITECTURE_FOR_GROK_REVIEW.md) | Full-stack architecture for external review (incl. Pimlico funding model) |
| [docs/WHERE_WE_ARE_AND_NEXT_STEPS.md](docs/WHERE_WE_ARE_AND_NEXT_STEPS.md) | Current status + suggested roadmap |
| [docs/KNOWN_ISSUES.md](docs/KNOWN_ISSUES.md) | Checklist — working vs to-verify |
| [docs/TESTNET_E2E_CHECKLIST.md](docs/TESTNET_E2E_CHECKLIST.md) | Base Sepolia smoke order; mainnet QA for DEX/LP called out in doc |
| [docs/DEVELOPMENT_LOG.md](docs/DEVELOPMENT_LOG.md) | Timestamped change log — **append an entry for every change** |
| [docs/PHASED_DEPLOY_AND_MAINNET_QA.md](docs/PHASED_DEPLOY_AND_MAINNET_QA.md) | Phase-by-phase Sepolia → mainnet QA checklist |

**Networks:** **Base mainnet (`8453`)** is the primary target for integration QA (real Uniswap v3, LP, explorers). **Base Sepolia (`84532`)** stays for **low-cost smoke tests** with on-chain **test** token names (`tCLICK` / `tBTROPHY`). Frontend: set **`NEXT_PUBLIC_CHAIN_ID`** and matching RPC + contract env vars per [docs/HOWTO.md](docs/HOWTO.md). Prefer **separate Vercel projects** (or env groups) if you run cron/keepers on both chains so `CRON_SECRET` / `POT_KEEPER_PRIVATE_KEY` never cross wires.

## Packages

- `contracts/` — Hardhat + Solidity
- `frontend/` — Next.js 15 + wagmi
