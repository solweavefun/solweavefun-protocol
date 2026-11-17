# SOLWEAVE

**Trading cards on-chain, stitched into one living pattern.**

[![Live site](https://img.shields.io/badge/live-solweave.fun-5928a7?style=flat-square)](https://solweave.fun)
![Chain](https://img.shields.io/badge/chain-Solana-14f195?style=flat-square)

| | |
|---|---|
| Chain | Solana mainnet |
| Contract address | `CA_PLACEHOLDER` (not announced yet) |
| Site | https://solweave.fun |

## Overview

Solweave is a community-run, static website that gathers scattered Solana token activity into a single readable board. The top bar carries the token address as soon as it is announced; until then it stays inert and the first board row shows a branded placeholder.

## Features

- Live market board: top ten boosted Solana tokens from DexScreener with logo, symbol, name, price, 24H change, volume and liquidity.
- Matching ticker, count-up numbers with change flashes, skeleton loaders that fade into data.
- Own-token row pinned first once the address exists, fetched from DexScreener and pump.fun in parallel.
- Exponential backoff, last-good-data retention, 60 second polling that pauses while the tab is hidden.
- Spring-physics scroll reveals, hero parallax, spotlight hovers, scroll progress bar, full reduced-motion fallback.
- Every external fact lives in one register record (`src/register.json`) with a state of `stated`, `absent` or `unconfirmed`. Unstated records render inert.

## Links

- Website: https://solweave.fun
- X: https://x.com/sol_weave
- GitHub: not available yet

## Develop

```bash
npm install
npm run build     # writes dist/
npm run verify    # builds both register branches and runs every gate
npm run serve     # serves dist/ on http://localhost:47281
```

Deploy the contents of `dist/`.

To announce the token, edit `src/register.json`: set `ca.state` to `stated` and `ca.value` to the address, then rebuild.

## License

MIT
