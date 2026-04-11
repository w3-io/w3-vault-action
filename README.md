# W3 Vault Action

Deposit and withdraw USDC from Yelay vaults with cross-chain CCTP bridging.

## Quick Start

```yaml
- name: Deposit USDC
  uses: w3-io/w3-vault-action@v0
  with:
    command: deposit
    po-id: "PO-2024-001"
    amount: "1000.00"
    environment: testing
```

## Commands

| Command           | Description                                                                  |
| ----------------- | ---------------------------------------------------------------------------- |
| `deposit`         | Deposit USDC into the Yelay vault. Direct from Base or cross-chain via CCTP. |
| `withdraw-oldest` | Withdraw the oldest active deposit. Redeems shares and repays.               |
| `withdraw-by-id`  | Withdraw a specific deposit by purchase order ID.                            |
| `status`          | Get vault status: total deposited, active count, accrued interest.           |
| `list-deposits`   | List active deposits with pagination.                                        |

## Inputs

| Input          | Required | Default   | Description                                                           |
| -------------- | -------- | --------- | --------------------------------------------------------------------- |
| `command`      | Yes      | —         | Operation to perform                                                  |
| `po-id`        | No       | —         | Purchase order ID (required for deposit, withdraw-by-id)              |
| `amount`       | No       | —         | USDC amount (e.g. "1000.00")                                          |
| `source-chain` | No       | `base`    | Source chain for USDC. Cross-chain uses CCTP to bridge to Base first. |
| `environment`  | No       | `testing` | `testing` or `production`                                             |
| `sandbox`      | No       | `false`   | Use Circle IRIS sandbox for attestation                               |
| `from`         | No       | `0`       | Start index for deposit pagination                                    |
| `to`           | No       | `10`      | End index for deposit pagination                                      |

## Outputs

| Output   | Description                  |
| -------- | ---------------------------- |
| `result` | JSON result of the operation |

### Deposit result

```json
{
  "type": "direct",
  "chain": "base",
  "poId": "PO-2024-001",
  "amount": "1000000000",
  "operator": "0xd1b1...",
  "vault": "0x7b3D...",
  "txHash": "0x..."
}
```

### Cross-chain deposit result

```json
{
  "type": "cross-chain",
  "sourceChain": "ethereum",
  "poId": "PO-2024-001",
  "amount": "1000000000",
  "burnTxHash": "0x...",
  "messageHash": "0x...",
  "mintTxHash": "0x...",
  "depositTxHash": "0x..."
}
```

### Status result

```json
{
  "environment": "testing",
  "totalDeposited": "5000.000000",
  "activeDeposits": 3,
  "canWithdraw": true,
  "accruedInterest": "12.345678"
}
```

## Cross-Chain Deposits

For deposits from chains other than Base, the action:

1. Approves USDC for Circle's TokenMessenger on the source chain
2. Burns USDC via CCTP `depositForBurn`
3. Polls Circle IRIS API for attestation
4. Mints USDC on Base via `receiveMessage`
5. Deposits into the Yelay vault

Supported source chains: ethereum, avalanche, arbitrum, optimism, polygon, base (direct).

## Authentication

The action uses the W3 syscall bridge for all on-chain operations. The bridge holds the signer key via `W3_SECRET_*` environment variables — no private keys in the workflow YAML.

Set `W3_SECRET_ETHEREUM` in your W3 environment to configure the signer.
