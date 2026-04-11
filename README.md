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
| [docs/TESTNET_E2E_CHECKLIST.md](docs/TESTNET_E2E_CHECKLIST.md) | Pimlico sponsorship policy + full Base Sepolia QA order |
| [docs/DEVELOPMENT_LOG.md](docs/DEVELOPMENT_LOG.md) | Timestamped change log — **append an entry for every change** |

## Packages

- `contracts/` — Hardhat + Solidity
- `frontend/` — Next.js 15 + wagmi
