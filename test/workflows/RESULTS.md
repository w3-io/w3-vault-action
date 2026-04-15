# E2E Test Results

> Last verified: 2026-04-15

## Prerequisites

| Credential | Env var | Source |
|-----------|---------|--------|
| Ethereum private key | `W3_SECRET_ETHEREUM` | Bridge signer |

### On-chain requirements

Funded EVM wallet on Base with USDC.

## Results

| # | Step | Command | Status | Notes |
|---|------|---------|--------|-------|
| 1 | Status | `status` | PASS | Read-only |
| 2 | Print status | (run step) | PASS | |
| 3 | Deposit 1.00 USDC | `deposit` | PASS | environment: testing |
| 4 | Status after deposit | `status` | PASS | |
| 5 | Redeem shares | `redeem` | PASS | Recovery step |
| 6 | Print results | (run step) | PASS | |

## Skipped Commands

| Command | Reason |
|---------|--------|
| N/A | All commands tested |

## How to run

```bash
# Export credentials
export W3_SECRET_ETHEREUM="..."

# Start bridge (on-chain)
w3 bridge serve --port 8232 --signer-ethereum "$W3_SECRET_ETHEREUM" --allow "*" &
export W3_BRIDGE_URL="http://host.docker.internal:8232"

# Run
w3 workflow test --execute test/workflows/e2e.yaml
```
