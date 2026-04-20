# ClickMint

ClickMint — on-chain clicker on Base: **minute rounds**, ETH **Click Pot**, **Block Bet** (four 15s slots), **50 / 30 / 20 / ~0.5%** deposit routing (pot / treasury / block bet / trophy `receive`), **$CLICK** vesting + 30/30/20/20 early spend, and optional **gasless** clicks (Pimlico). See [`docs/GAME_MECHANICS.md`](docs/GAME_MECHANICS.md) for the canonical spec.

## Docs

| Document | Purpose |
|----------|---------|
| [docs/GAME_MECHANICS.md](docs/GAME_MECHANICS.md) | **Canonical** rules: minute POT, Block Bet, economy targets |
| [docs/HOWTO.md](docs/HOWTO.md) | Setup, deploy, env, frontend, troubleshooting |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | How contracts interact; main functions |
| [docs/ARCHITECTURE_FOR_GROK_REVIEW.md](docs/ARCHITECTURE_FOR_GROK_REVIEW.md) | Full-stack architecture for external review (incl. Pimlico funding model) |
| [docs/WHERE_WE_ARE_AND_NEXT_STEPS.md](docs/WHERE_WE_ARE_AND_NEXT_STEPS.md) | Current status + suggested roadmap |
| [docs/KNOWN_ISSUES.md](docs/KNOWN_ISSUES.md) | Checklist — working vs to-verify |
| [docs/TESTNET_E2E_CHECKLIST.md](docs/TESTNET_E2E_CHECKLIST.md) | Base Sepolia smoke order; mainnet QA for DEX/LP |
| [docs/DEVELOPMENT_LOG.md](docs/DEVELOPMENT_LOG.md) | Timestamped change log — **append an entry for every change** |
| [docs/PHASED_DEPLOY_AND_MAINNET_QA.md](docs/PHASED_DEPLOY_AND_MAINNET_QA.md) | Phase-by-phase Sepolia → mainnet QA checklist |

**Networks:** **Base Sepolia (`84532`)** is the primary environment for full-loop testing. **Base mainnet (`8453`)** is for real-ETH work — e.g. **Uniswap v2–style LP** — and optional staging on **Vercel Preview** / **preview.clickmint.app** without treating every experiment as production. Frontend: set **`NEXT_PUBLIC_CHAIN_ID`** and matching RPC + contract env vars per [docs/HOWTO.md](docs/HOWTO.md). Prefer **separate Vercel projects** (or env groups) if you run cron/keepers on both chains so `CRON_SECRET` / `POT_KEEPER_PRIVATE_KEY` never cross wires.

## Packages

- `contracts/` — Hardhat + Solidity
- `frontend/` — Next.js 15 + wagmi
