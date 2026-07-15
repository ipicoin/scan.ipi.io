## Context

IPI Scan is a zero-dependency static explorer. `index.html` loads `explorer.css` and `explorer.js`; browser navigation uses hash routes. The client reads current chain state through same-origin `/api/rpc`, `/api/rest`, and `/api/evm/rpc` endpoints. `dev-server.mjs` reproduces those routes locally by proxying the public IPI Testnet services.

The files in this change were compared byte-for-byte with the public assets served by `scan.ipi.io`. This publication captures the existing implementation; it does not redesign or extend it.

## Goals / Non-Goals

**Goals:**

- Make the currently deployed IPI Scan source reviewable in a dedicated repository.
- Preserve existing explorer navigation, search, responsive behavior, and official branding.
- Keep runtime dependencies at zero and provide a repeatable local preview.
- Document the read-only API boundary and current feature limitations.

**Non-Goals:**

- Modify production infrastructure or public endpoints.
- Introduce a framework, build pipeline, backend, database, or account system.
- Add historical indexing, analytics, chain writes, or wallet integration.
- Repair or redesign functionality beyond this source publication.

## Decisions

### Preserve the deployed static files

The repository stores the verified HTML, CSS, JavaScript, and SVG directly. This avoids a framework migration and keeps repository output identical to the public deployment.

Alternative considered: migrate the explorer to the older Vue/Ping.pub codebase. That source does not match the current public IPI Scan interface and would introduce unrelated behavior and dependencies.

### Keep public data access read-only and same-origin

The browser calls relative `/api/` routes. Production remains responsible for routing those paths to public CometBFT, Cosmos REST, and EVM JSON-RPC services. No credentials or write endpoints are present in the client.

### Use hash-based navigation

Existing hash routes allow blocks, transactions, accounts, validators, and EVM entities to be opened without requiring server-side SPA fallback configuration. This behavior is preserved.

### Provide a zero-dependency local proxy

`dev-server.mjs` uses built-in Node.js HTTP and `fetch` APIs. It serves the source files and forwards only the documented public API paths, enabling local smoke verification without production configuration files.

## Risks / Trade-offs

- **Public API availability affects explorer data** → The interface reports request failures; local verification records upstream blockers instead of embedding fallback data.
- **A static client cannot provide complete indexed history** → Historical EVM address transactions and ranked account lists remain out of scope until a dedicated indexer exists.
- **Production routing is external to this repository** → Document the required same-origin paths without copying infrastructure or credentials.
- **No bundler validates browser integration** → Run JavaScript syntax checks, local HTTP smoke checks, and browser verification where available.

## Migration Plan

1. Publish the byte-identical deployed assets and local preview server.
2. Run syntax checks for both JavaScript entry points.
3. Start the local preview and verify static files plus representative proxy routes.
4. Compare source hashes with the public deployment assets.
5. Validate the OpenSpec change strictly.

Rollback consists of reverting the initial repository commit; it has no effect on public infrastructure.

## Open Questions

None for this source-publication change.
