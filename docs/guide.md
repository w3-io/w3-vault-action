# W3 Vault Action Reference Guide

W3 Vault Action manages USDC deposits and withdrawals for W3 Vaults, with built-in cross-chain CCTP bridging. It handles direct deposits on Base and automatic bridging from Ethereum, Avalanche, Arbitrum, Optimism, and Polygon via Circle's Cross-Chain Transfer Protocol.

## Quick Start

```yaml
- name: Deposit USDC
  uses: w3/vault@v0
  with:
    command: deposit
    po-id: "PO-2024-001"
    amount: "1000.00"
    environment: testing
```

## Commands

### deposit

Deposit USDC into the W3 Vault. Direct from Base, or cross-chain via CCTP (burns on source chain, mints on Base, then deposits).

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `po-id` | Yes | | Purchase order ID for tracking |
| `amount` | Yes | | USDC amount (e.g. `"1000.00"`) |
| `source-chain` | No | `base` | Source chain for USDC |
| `environment` | No | `testing` | `testing` or `production` |
| `sandbox` | No | `false` | Use Circle IRIS sandbox for attestation |

Supported source chains: `base` (direct), `ethereum`, `avalanche`, `arbitrum`, `optimism`, `polygon`.

### withdraw-oldest

Withdraw the oldest active deposit. Redeems vault shares and repays.

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `environment` | No | `testing` | `testing` or `production` |

### withdraw-by-id

Withdraw a specific deposit by its purchase order ID.

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `po-id` | Yes | | Purchase order ID to withdraw |
| `environment` | No | `testing` | `testing` or `production` |

### status

Get vault status: total deposited, active deposit count, and accrued interest.

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `environment` | No | `testing` | `testing` or `production` |

### list-deposits

List active deposits with pagination.

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `from` | No | `0` | Start index |
| `to` | No | `10` | End index |
| `environment` | No | `testing` | `testing` or `production` |

## Cross-Chain Deposits

For deposits from chains other than Base, the action automatically:

1. Approves USDC for Circle's TokenMessenger on the source chain
2. Burns USDC via CCTP `depositForBurn`
3. Polls Circle IRIS API for attestation
4. Mints USDC on Base via `receiveMessage`
5. Deposits into the W3 Vault

## Authentication

The action uses the W3 syscall bridge for all on-chain operations. No private keys appear in workflow YAML. Set `W3_SECRET_ETHEREUM` in your W3 environment to configure the signer.

## Full Workflow Example

```yaml
name: Deposit and monitor vault
on: workflow_dispatch

jobs:
  vault:
    runs-on: ubuntu-latest
    steps:
      - name: Check vault status
        uses: w3/vault@v0
        id: before
        with:
          command: status
          environment: testing

      - name: Deposit USDC from Base
        uses: w3/vault@v0
        id: deposit
        with:
          command: deposit
          po-id: "PO-${{ github.run_id }}"
          amount: "500.00"
          environment: testing

      - name: Cross-chain deposit from Ethereum
        uses: w3/vault@v0
        id: bridge
        with:
          command: deposit
          po-id: "PO-${{ github.run_id }}-ETH"
          amount: "1000.00"
          source-chain: ethereum
          environment: testing

      - name: List active deposits
        uses: w3/vault@v0
        id: deposits
        with:
          command: list-deposits
          from: '0'
          to: '20'
          environment: testing

      - name: Withdraw oldest deposit
        uses: w3/vault@v0
        with:
          command: withdraw-oldest
          environment: testing

      - name: Verify final status
        uses: w3/vault@v0
        id: after
        with:
          command: status
          environment: testing
```
