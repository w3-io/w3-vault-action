# W3 Vault Integration

W3 Vaults provide yield on idle USDC via regulated vault infrastructure on Base. Deposit directly from Base or cross-chain from any CCTP-supported chain — the action handles CCTP bridging, Circle attestation, and vault entry in a single command.

## Quick Start

```yaml
- uses: w3-io/w3-vault-action@v0
  with:
    command: deposit
    po-id: "PO-2024-001"
    amount: "1000.00"
    environment: testing
```

## Commands

### deposit
Deposit USDC into the W3 Vault. Direct from Base or cross-chain via CCTP.

### withdraw-oldest
Withdraw the oldest active deposit. Redeems vault shares and returns principal plus interest.

### withdraw-by-id
Withdraw a specific deposit by purchase order ID.

### status
Get vault status: total deposited, active deposits, accrued interest, withdrawal eligibility.

### list-deposits
List active deposits with pagination (from/to indices).

## Cross-Chain Flow

For non-Base deposits, the action runs a 6-step pipeline:
1. Approve USDC for Circle TokenMessenger on source chain
2. Burn via CCTP depositForBurn
3. Poll Circle IRIS for attestation (~2-5 minutes)
4. Mint USDC on Base via receiveMessage
5. Deposit into W3 Vault

Supported: Ethereum, Avalanche, Arbitrum, Optimism, Polygon → Base.

## Environments

- `testing` — test vault contract on Base mainnet
- `production` — production vault on Base mainnet

## Authentication

All on-chain operations go through the W3 syscall bridge. Set `W3_SECRET_ETHEREUM` in your W3 environment.
