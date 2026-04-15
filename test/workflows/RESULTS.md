# E2E Test Results

Last verified: 2026-04-15

## Environment

- W3 local network (3-node localnet)
- Protocol: master (includes EIP-712, bridge-allow expansion, nonce manager)
- Runner image: w3io/w3-runner (Node 20/24)

## Prerequisites

- W3 local network running (make dev)
- W3_SECRET_ETHEREUM (bridge signer with USDC on Base mainnet)

## Results

| Step | Command | Status | Notes |
|------|---------|--------|-------|
| 1 | status | PASS | Read-only vault status (reads job) |
| 2 | deposit | PASS | 1.00 USDC, po-id e2e-test-001, Base chain |
| 3 | status (after deposit) | PASS | Verify state change |
| 4 | redeem | PASS | 1000000 shares, recovery round-trip |
| 5 | echo results | PASS | Print deposit/status/redeem outputs |
| 6 | echo status | PASS | Print read-only status output |

## Known Limitations

- Deposit and redeem require bridge-allow: ethereum/call-contract.
- Only gas is consumed; all write tests round-trip to recover funds.
- Uses testing environment (not production).
