# W3 Vault Action — Reference Guide

USDC deposit and withdrawal flows for the Yelay vault on Base, with optional cross-chain CCTP bridging from any major EVM source chain. 5 commands.

## Scope

This action drives the [Yelay vault](https://yelay.io) directly via the W3 syscall bridge. All on-chain operations (`approve`, `deposit`, `redeem`, CCTP burn/mint) go through the protocol's chain layer rather than a bundled EVM SDK. The signer key is held by the W3 protocol — workflow authors never see it and don't pass it through action inputs.

## Common inputs

| Input         | Required | Notes                                                                            |
| ------------- | -------- | -------------------------------------------------------------------------------- |
| `command`     | yes      | One of `deposit`, `withdraw-oldest`, `withdraw-by-id`, `status`, `list-deposits` |
| `environment` | no       | `testing` (default) or `production`                                              |
| `rpc-url`     | no       | Override the chain RPC endpoint for the underlying bridge calls                  |

## Output shape

Every command produces a single `result` output as a JSON string. Parse with `fromJSON()` and access fields directly:

```yaml
- uses: w3-io/w3-vault-action@v0
  id: dep
  with:
    command: deposit
    po-id: PO-2026-04-001
    amount: "1000.00"

- run: |
    echo "tx hash = ${{ fromJSON(steps.dep.outputs.result).txHash }}"
    echo "type    = ${{ fromJSON(steps.dep.outputs.result).type }}"
```

## Errors

All errors are `W3ActionError` with stable codes. The most common:

| Code                  | Meaning                                                                                             |
| --------------------- | --------------------------------------------------------------------------------------------------- |
| `MISSING_INPUT`       | A required input was empty (e.g. `po-id` for deposit).                                              |
| `UNKNOWN_ENVIRONMENT` | `environment` was not `testing` or `production`.                                                    |
| Bridge errors         | Surfaced as-is from the chain layer. Inspect the message for the underlying contract revert reason. |

---

## Commands

### `deposit`

Deposit USDC into the Yelay vault. If `source-chain` is `base` (the default), the deposit is direct: approve USDC, call `vault.deposit`. For any other source chain, the action first burns USDC on the source via CCTP, polls Circle IRIS for the attestation, mints USDC on Base, then deposits.

| Input          | Required | Description                                                                  |
| -------------- | -------- | ---------------------------------------------------------------------------- |
| `po-id`        | yes      | Purchase order ID for deposit tracking                                       |
| `amount`       | yes      | USDC amount as a decimal string (e.g. `"1000.00"` for 1000 USDC)             |
| `source-chain` | no       | `base` (default), `ethereum`, `avalanche`, `arbitrum`, `optimism`, `polygon` |
| `environment`  | no       | `testing` (default) or `production`                                          |
| `sandbox`      | no       | `"true"` to use Circle's IRIS sandbox for attestation polling                |
| `receiver`     | no       | Optional receiver address if depositing on behalf of another address         |

**Output (direct, source-chain=base):**

```jsonc
{
  "type": "direct",
  "chain": "base",
  "poId": "PO-2026-04-001",
  "amount": "1000000000", // base-units (USDC has 6 decimals)
  "vault": "0x7b3D...",
  "txHash": "0x...",
}
```

**Output (cross-chain, source-chain != base):**

```jsonc
{
  "type": "cross-chain",
  "sourceChain": "ethereum",
  "poId": "PO-2026-04-001",
  "amount": "1000000000",
  "burnTxHash": "0x...", // CCTP burn on source
  "messageHash": "0x...", // CCTP attestation message
  "mintTxHash": "0x...", // CCTP mint on Base
  "depositTxHash": "0x...", // Final vault deposit
}
```

The cross-chain flow can take **several minutes** due to CCTP attestation latency (Circle's mainnet attestation is typically ~13-19 minutes; sandbox is ~30 seconds). Workflows that trigger cross-chain deposits should use sufficient `timeout-minutes` on the step (default action timeout is 6 hours, which is generous enough).

### `withdraw-oldest`

Withdraw the oldest active deposit from the vault. Redeems shares back to USDC and credits the receiver.

| Input         | Required | Description                         |
| ------------- | -------- | ----------------------------------- |
| `environment` | no       | `testing` (default) or `production` |

**Output:**

```jsonc
{
  "poId": "PO-2025-12-007",
  "shares": "990.123456",
  "assets": "1012.345678",
  "txHash": "0x...",
}
```

### `withdraw-by-id`

Withdraw a specific deposit by its purchase order ID.

| Input         | Required | Description                                  |
| ------------- | -------- | -------------------------------------------- |
| `po-id`       | yes      | Purchase order ID of the deposit to withdraw |
| `environment` | no       | `testing` (default) or `production`          |

**Output:** same shape as `withdraw-oldest`.

### `status`

Get aggregate vault status: total deposited, active deposit count, accrued interest.

| Input         | Required | Description                         |
| ------------- | -------- | ----------------------------------- |
| `environment` | no       | `testing` (default) or `production` |

**Output:**

```jsonc
{
  "environment": "testing",
  "totalDeposited": "5000.000000", // Sum of all active deposits in USDC
  "activeDeposits": 3,
  "canWithdraw": true,
  "accruedInterest": "12.345678", // Total earned since deposit
}
```

### `list-deposits`

Paginated listing of active deposits.

| Input         | Required | Description                         |
| ------------- | -------- | ----------------------------------- |
| `from`        | no       | Start index (default `0`)           |
| `to`          | no       | End index, exclusive (default `10`) |
| `environment` | no       | `testing` (default) or `production` |

**Output:**

```jsonc
{
  "environment": "testing",
  "deposits": [
    {
      "poId": "PO-2026-04-001",
      "principal": "1000000000", // base-units
      "currentValue": "1012345678", // base-units, includes accrued interest
      "depositedAt": "2026-04-01T14:00:00Z",
    },
  ],
}
```

---

## Environments

| Environment  | Yelay vault                                  | USDC                                         | Chain        |
| ------------ | -------------------------------------------- | -------------------------------------------- | ------------ |
| `testing`    | `0x7b3D25c37c6ADf650F1f7696be2278cCFa2b638F` | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` | Base mainnet |
| `production` | `0x0c6dAf9B4e0EB49A0c80c325da82EC028Cb8118B` | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` | Base mainnet |

The "testing" environment uses a separate vault contract on Base mainnet so workflow authors can validate the integration with real USDC at small amounts before pointing at the production vault.

---

## Cross-chain CCTP details

When `source-chain` is anything other than `base`, the action uses Circle's [Cross-Chain Transfer Protocol (CCTP)](https://www.circle.com/en/cross-chain-transfer-protocol) to bridge USDC to Base before depositing. The flow is:

1. **Approve** USDC to Circle's `TokenMessenger` contract on the source chain
2. **`depositForBurn`** — burn USDC on source, emit a CCTP message
3. **Poll Circle IRIS** for the attestation signature (the IRIS API signs CCTP messages off-chain after source-chain finality)
4. **`receiveMessage`** on Base — mint USDC to the action's address using the attestation
5. **`deposit`** the freshly-minted USDC into the Yelay vault

The CCTP burn-and-mint produces a 1:1 USDC transfer (no slippage, no wrapped tokens). The trade-off is **latency** — Circle's mainnet attestation typically takes 13-19 minutes after source-chain finality. The `sandbox: "true"` flag points the IRIS poller at Circle's sandbox, which attests in ~30 seconds.

Supported source chains: `ethereum`, `avalanche`, `arbitrum`, `optimism`, `polygon`, `base` (direct, no CCTP).

---

## Authentication

The action uses the W3 syscall bridge for all on-chain operations. **The bridge holds the signer key inside the protocol's secret resolver via `W3_SECRET_*` environment variables — no private keys in the workflow YAML.**

Set `W3_SECRET_ETHEREUM` in your W3 environment to configure the signer. The same key is used for both source-chain operations (CCTP burns) and Base operations (CCTP mints + vault deposits).

For local development, use the `bridge` from `@w3-io/action-core`'s `bridge` namespace — the action calls into the protocol's syscall bridge automatically.

---

## Examples

### Daily yield farming workflow

```yaml
name: Daily Yield Top-Up
on:
  schedule:
    - cron: "0 14 * * *"

jobs:
  top-up:
    runs-on: ubuntu-latest
    environment: 0xprod
    steps:
      - uses: w3-io/w3-vault-action@v0
        id: status
        with:
          command: status
          environment: production

      - if: ${{ fromJSON(steps.status.outputs.result).totalDeposited < '10000' }}
        uses: w3-io/w3-vault-action@v0
        with:
          command: deposit
          po-id: daily-top-up-${{ github.run_id }}
          amount: "1000.00"
          environment: production
```

### Cross-chain rebalancing

```yaml
- uses: w3-io/w3-vault-action@v0
  with:
    command: deposit
    po-id: cross-chain-${{ github.run_id }}
    amount: "500.00"
    source-chain: ethereum # Bridge from Ethereum mainnet
    environment: production
    sandbox: "false" # Use real CCTP attestation
```

### Withdraw on threshold

```yaml
- uses: w3-io/w3-vault-action@v0
  id: status
  with:
    command: status

- if: ${{ fromJSON(steps.status.outputs.result).accruedInterest > '50' }}
  uses: w3-io/w3-vault-action@v0
  with:
    command: withdraw-oldest
```

---

## Local development

```bash
npm install
npm run all
```

The pipeline runs format → lint → test → build. Tests are unit tests against the helpers in `src/vault.js` (USDC parsing/formatting, environment resolution, address padding) — they don't require a real RPC connection.
