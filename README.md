# IPI Scan

Official source for the zero-dependency IPI Testnet explorer published at
[`scan.ipi.io`](https://scan.ipi.io/).

## OpenSpec starts here

OpenSpec is initialized in [`openspec/`](openspec/). The first change captures
the current production source without redesigning or extending it:

- [`publish-ipi-scan-source`](openspec/changes/publish-ipi-scan-source/)

The current source files are intentionally small and deployment-neutral:

- `index.html` powers the main IPI Scan interface
- `evm.html` provides the standalone IPI EVM diagnostic view
- `explorer.css` contains the responsive IPI Scan presentation
- `explorer.js` reads public CometBFT, Cosmos REST, and EVM JSON-RPC data
- `dev-server.mjs` serves the explorer locally and proxies public testnet APIs

The main explorer supports:

- dashboard and network health
- recent and paginated blocks
- block details and block transactions
- recent native transactions and transaction receipts
- native account balances, metadata, and recent activity
- bonded validators and validator details
- EVM transaction lookup
- EVM address balance, nonce, and bytecode lookup
- global search by block height (with or without `#`), native/EVM transaction
  hash, consensus/EVM block hash (with or without `0x`), native account,
  validator, or EVM address
- ambiguous 64-character hashes are resolved against the live transaction and
  block RPC methods before navigation
- numbers, compact token amounts, and dates use the fixed `en-US` display
  locale instead of inheriting Polish or another browser locale

In production, chain data is read through same-origin `/api/` routes configured
by the deployment environment. No secret or write endpoint is required. The
infrastructure configuration itself is not stored in this repository.

## Local preview

Requires a Node.js version with built-in fetch.

From the repository root, run:

    node dev-server.mjs

Then open http://127.0.0.1:8787/. The local server proxies requests to the
current public testnet endpoints, so local verification uses live chain data.

## Verification

The application has no compilation step. Verify the JavaScript and start the
local server with:

    node --check explorer.js
    node --check dev-server.mjs
    node dev-server.mjs

OpenSpec validation requires Node.js 20.19 or newer:

    openspec validate publish-ipi-scan-source --strict --no-interactive

The complete historical EVM address transaction list and ranked account list
remain dependent on a future PostgreSQL-backed indexer and are not implemented
in this repository.

## License

Licensed under [Apache License 2.0](LICENSE). The explorer is an independent
verification interface, not evidence by itself that an endpoint or network is
independently operated.
