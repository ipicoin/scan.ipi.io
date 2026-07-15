## ADDED Requirements

### Requirement: IPI Scan exposes the current explorer interface
The repository SHALL provide the static IPI Scan interface currently published at `scan.ipi.io` without substituting the older framework-based explorer.

#### Scenario: Visitor opens the explorer
- **WHEN** a visitor opens `/`
- **THEN** the IPI Scan overview interface is rendered with the current navigation, search, network status, and official IPI branding

### Requirement: Explorer navigation covers current IPI entities
IPI Scan SHALL provide navigation for overview, blocks, transactions, validators, native accounts, native transaction details, EVM transactions, and EVM addresses.

#### Scenario: Visitor opens a supported hash route
- **WHEN** a visitor opens a supported block, transaction, validator, account, or EVM hash route
- **THEN** the explorer requests the corresponding public read-only data and renders its detail view or an explicit error state

### Requirement: Global search resolves supported identifiers
IPI Scan SHALL accept block heights, native or EVM transaction hashes, block hashes, native accounts, validator addresses, and EVM addresses in the global search.

#### Scenario: Visitor searches for a supported identifier
- **WHEN** the visitor submits a supported identifier
- **THEN** the explorer resolves its type using the existing public read-only endpoints and navigates to the matching view

#### Scenario: Search input cannot be resolved
- **WHEN** the visitor submits an unsupported or unknown value
- **THEN** the explorer does not navigate to fabricated data and displays a user-facing failure message

### Requirement: Chain access remains read-only
The browser application SHALL use only public read-only CometBFT RPC, Cosmos REST, and EVM JSON-RPC methods through same-origin `/api/` routes.

#### Scenario: Explorer loads network data
- **WHEN** the overview or a detail page requests chain state
- **THEN** no credential, signing key, wallet seed, private endpoint, or chain-writing operation is required

### Requirement: Local preview reproduces public API routing
The repository SHALL provide a zero-dependency Node.js preview server for static files and documented public API proxy routes.

#### Scenario: Developer starts the local preview
- **WHEN** `node dev-server.mjs` is run with a Node.js version that includes built-in `fetch`
- **THEN** the explorer is served at `http://127.0.0.1:8787/` and supported `/api/` requests are proxied to public IPI Testnet endpoints

### Requirement: Official IPI branding is preserved
IPI Scan SHALL use the repository's official IPI SVG logo and the name IPI.

#### Scenario: Branding assets are requested
- **WHEN** the main explorer loads its favicon and brand mark
- **THEN** both resolve to the official `ipi-logo.svg` asset without an invented replacement

### Requirement: Responsive navigation remains usable
The current IPI Scan responsive interface SHALL preserve its mobile menu controls and prevent the closed navigation layer from blocking page interaction.

#### Scenario: Visitor uses a mobile viewport
- **WHEN** the visitor opens and closes the navigation using the menu control or scrim
- **THEN** the navigation state and accessibility attributes update and the main page remains interactive after closing it
