# ClickMint

ClickMint — fair on-chain clicker on Base with 2 CPS limit, vesting + 30/30/20/20 early spend, hourly CLICK POT (min clicks + random 15‑min window + reset buffer), 3% ETH fee split, revenue-sharing Binary Trophy NFTs + secret prize wallet (see contracts for exact constants).

## Docs

| Document | Purpose |
|----------|---------|
| [docs/HOWTO.md](docs/HOWTO.md) | Setup, deploy, env, frontend, troubleshooting |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | How contracts interact; main functions |
| [docs/KNOWN_ISSUES.md](docs/KNOWN_ISSUES.md) | Checklist — working vs to-verify |
| [docs/DEVELOPMENT_LOG.md](docs/DEVELOPMENT_LOG.md) | Timestamped change log — **append an entry for every change** |

## Packages

- `contracts/` — Hardhat + Solidity
- `frontend/` — Next.js 15 + wagmi
