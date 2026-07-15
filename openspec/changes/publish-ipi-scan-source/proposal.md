## Why

The live IPI Scan application exists as verified source outside a dedicated GitHub repository. Publishing the exact deployed files creates one reviewable source of truth for the explorer interface, public read-only API integration, official branding, and local verification workflow.

## What Changes

- Publish the current `scan.ipi.io` HTML, CSS, and JavaScript source without redesigning it.
- Include the official IPI logo used by the deployed explorer.
- Include the standalone EVM diagnostic page.
- Include a zero-dependency local preview server that proxies public IPI Testnet APIs.
- Document syntax checks, local smoke verification, public API dependencies, and current limitations.
- Initialize OpenSpec and record this publication as the first change.

### Non-goals

- No changes to DNS, TLS, Cloudflare, VPS configuration, nginx, firewall rules, or deployment automation.
- No redesign of IPI Scan and no new explorer feature.
- No validator, genesis, RPC, REST, EVM, wallet, faucet, or chain configuration changes.
- No PostgreSQL indexer, historical account ranking, analytics, authentication, or write endpoint.

## Capabilities

### New Capabilities

- `ipi-scan`: Covers the current read-only IPI Testnet explorer, navigation, search resolution, official branding, responsive interface, and local preview workflow.

### Modified Capabilities

None.

## Impact

- Adds the exact deployed static source at the repository root.
- Adds a local-only Node.js preview and public API proxy.
- Adds OpenSpec project configuration and the initial specification artifacts.
- Does not change the currently deployed public infrastructure.
