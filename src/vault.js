// Vault operations — deposit, withdraw, and status queries.
//
// All on-chain calls go through the W3 bridge SDK, which routes
// signing to the protocol's signer (no private keys in the action).

import { ENVIRONMENTS, USDC_ADDRESSES, CCTP, CCTP_DOMAINS, METHODS } from './contracts.js'

/**
 * Resolve the environment config from the environment name.
 * @param {string} env - "testing" or "production"
 * @returns {object} Environment config
 */
export function resolveEnvironment(env) {
  const config = ENVIRONMENTS[env]
  if (!config) {
    throw new Error(
      `Unknown environment: "${env}". Available: ${Object.keys(ENVIRONMENTS).join(', ')}`,
    )
  }
  return config
}

/**
 * Deposit USDC into the Yelay vault.
 *
 * If the source chain is Base, deposits directly.
 * If the source chain is any other CCTP-supported chain, bridges via
 * CCTP first (burn → attest → mint on Base), then deposits.
 *
 * @param {object} bridge - Bridge SDK instance
 * @param {object} opts
 * @param {string} opts.poId - Purchase order identifier
 * @param {string} opts.amount - USDC amount (human-readable, e.g. "1000.00")
 * @param {string} opts.sourceChain - Source chain name
 * @param {string} opts.environment - "testing" or "production"
 * @param {object} [opts.circle] - Circle client for attestation (required for cross-chain)
 */
export async function deposit(bridge, opts) {
  const { poId, amount, sourceChain, environment } = opts
  const env = resolveEnvironment(environment)
  const amountRaw = parseUsdcAmount(amount)

  if (sourceChain === 'base') {
    return depositDirect(bridge, env, poId, amountRaw)
  }

  return depositCrossChain(bridge, opts.circle, env, poId, amountRaw, sourceChain)
}

/**
 * Direct deposit from Base — USDC already on Base.
 *
 * Calls W3YieldOperator.deposit(poId, amount) which internally
 * requests funds from TradFi and deposits into the Yelay vault.
 */
async function depositDirect(bridge, env, poId, amountRaw) {
  // Call deposit on the operator
  const result = await bridge.ethereum.callContract({
    network: env.network,
    to: env.operator,
    method: METHODS.deposit,
    args: [poId, amountRaw],
  })

  return {
    type: 'direct',
    chain: 'base',
    poId,
    amount: amountRaw,
    operator: env.operator,
    vault: env.vault,
    txHash: result.txHash || result.transactionHash,
  }
}

/**
 * Cross-chain deposit: burn USDC on source → CCTP attest → mint on
 * Base → deposit into vault.
 */
async function depositCrossChain(bridge, circle, env, poId, amountRaw, sourceChain) {
  const sourceDomain = CCTP_DOMAINS[sourceChain]
  if (sourceDomain === undefined) {
    throw new Error(
      `Unsupported source chain: "${sourceChain}". Supported: ${Object.keys(CCTP_DOMAINS).join(', ')}`,
    )
  }

  const sourceUsdc = USDC_ADDRESSES[sourceChain]
  if (!sourceUsdc) {
    throw new Error(`No USDC address for chain: "${sourceChain}"`)
  }

  if (!circle) {
    throw new Error('Cross-chain deposits require a Circle client for attestation polling')
  }

  // Step 1: Approve USDC for TokenMessenger on source chain
  await bridge.ethereum.callContract({
    network: sourceChain,
    to: sourceUsdc,
    method: METHODS.approve,
    args: [CCTP.tokenMessenger, amountRaw],
  })

  // Step 2: Burn USDC via CCTP
  // mintRecipient is the operator address on Base, padded to bytes32
  const recipientBytes32 = padAddressToBytes32(env.operator)

  const burnResult = await bridge.ethereum.callContract({
    network: sourceChain,
    to: CCTP.tokenMessenger,
    method: METHODS.depositForBurn,
    args: [amountRaw, CCTP_DOMAINS.base, recipientBytes32, sourceUsdc],
  })

  // Step 3: Extract message hash from burn receipt logs
  const messageHash = extractMessageHash(burnResult)
  if (!messageHash) {
    throw new Error('Failed to extract message hash from CCTP burn receipt')
  }

  // Step 4: Wait for Circle attestation
  const attestation = await circle.waitForAttestation(messageHash, {
    pollInterval: 10,
    maxAttempts: 60,
  })

  if (attestation.status !== 'complete') {
    throw new Error(`Attestation timeout: status=${attestation.status}`)
  }

  // Step 5: Mint USDC on Base via CCTP
  const mintResult = await bridge.ethereum.callContract({
    network: 'base',
    to: CCTP.messageTransmitter,
    method: METHODS.receiveMessage,
    args: [burnResult.messageBytes, attestation.attestation],
  })

  // Step 6: Deposit from operator balance into vault
  const depositResult = await bridge.ethereum.callContract({
    network: env.network,
    to: env.operator,
    method: METHODS.depositFromBalance,
    args: [poId, amountRaw],
  })

  return {
    type: 'cross-chain',
    sourceChain,
    poId,
    amount: amountRaw,
    operator: env.operator,
    vault: env.vault,
    burnTxHash: burnResult.txHash || burnResult.transactionHash,
    messageHash,
    attestationAttempts: attestation.attempts,
    mintTxHash: mintResult.txHash || mintResult.transactionHash,
    depositTxHash: depositResult.txHash || depositResult.transactionHash,
  }
}

/**
 * Withdraw the oldest active deposit from the vault.
 * Redeems Yelay shares and repays TradFi.
 */
export async function withdrawOldest(bridge, opts) {
  const env = resolveEnvironment(opts.environment)

  const result = await bridge.ethereum.callContract({
    network: env.network,
    to: env.operator,
    method: METHODS.withdrawOldest,
    args: [],
  })

  return {
    operator: env.operator,
    vault: env.vault,
    txHash: result.txHash || result.transactionHash,
  }
}

/**
 * Withdraw a specific deposit by purchase order ID.
 */
export async function withdrawById(bridge, opts) {
  const env = resolveEnvironment(opts.environment)

  const result = await bridge.ethereum.callContract({
    network: env.network,
    to: env.operator,
    method: METHODS.withdrawAndRepay,
    args: [opts.poId],
  })

  return {
    poId: opts.poId,
    operator: env.operator,
    vault: env.vault,
    txHash: result.txHash || result.transactionHash,
  }
}

/**
 * Get vault status — total deposited, active deposits, withdrawable,
 * accrued interest.
 */
export async function status(bridge, opts) {
  const env = resolveEnvironment(opts.environment)
  const network = env.network

  const [totalDeposited, activeCount, canWithdrawResult, interest, queueLength] =
    await Promise.all([
      bridge.ethereum.readContract({
        network,
        to: env.operator,
        method: METHODS.totalDeposited,
        args: [],
      }),
      bridge.ethereum.readContract({
        network,
        to: env.operator,
        method: METHODS.activeDepositsCount,
        args: [],
      }),
      bridge.ethereum.readContract({
        network,
        to: env.operator,
        method: METHODS.canWithdraw,
        args: [],
      }),
      bridge.ethereum.readContract({
        network,
        to: env.operator,
        method: METHODS.currentInterest,
        args: [],
      }),
      bridge.ethereum.readContract({
        network,
        to: env.operator,
        method: METHODS.depositQueueLength,
        args: [],
      }),
    ])

  return {
    environment: env.name,
    operator: env.operator,
    vault: env.vault,
    totalDeposited: formatUsdc(totalDeposited),
    totalDepositedRaw: totalDeposited,
    activeDeposits: Number(activeCount),
    canWithdraw: Boolean(canWithdrawResult),
    accruedInterest: formatUsdc(interest),
    accruedInterestRaw: interest,
    totalDepositsEver: Number(queueLength),
  }
}

/**
 * List active deposits with pagination.
 */
export async function listDeposits(bridge, opts) {
  const env = resolveEnvironment(opts.environment)
  const from = opts.from || 0
  const to = opts.to || 10

  const result = await bridge.ethereum.readContract({
    network: env.network,
    to: env.operator,
    method: METHODS.paginatedDeposits,
    args: [String(from), String(to)],
  })

  // Result is a tuple: [poIds[], principals[], currentValues[]]
  const poIds = result[0] || []
  const principals = result[1] || []
  const currentValues = result[2] || []

  const deposits = poIds.map((poId, i) => ({
    poId,
    principal: formatUsdc(principals[i]),
    principalRaw: principals[i],
    currentValue: formatUsdc(currentValues[i]),
    currentValueRaw: currentValues[i],
  }))

  return {
    environment: env.name,
    from,
    to,
    deposits,
  }
}

// ── Helpers ─────────────────────────────────────────────────────

/** Parse human-readable USDC amount to raw 6-decimal string. */
function parseUsdcAmount(amount) {
  const parts = amount.split('.')
  const whole = parts[0]
  const frac = (parts[1] || '').padEnd(6, '0').slice(0, 6)
  return `${whole}${frac}`
}

/** Format raw USDC amount to human-readable string. */
function formatUsdc(raw) {
  const s = String(raw).padStart(7, '0')
  const whole = s.slice(0, -6) || '0'
  const frac = s.slice(-6)
  return `${whole}.${frac}`
}

/** Pad a 20-byte Ethereum address to 32 bytes (left-padded with zeros). */
function padAddressToBytes32(address) {
  const clean = address.toLowerCase().replace('0x', '')
  return '0x' + clean.padStart(64, '0')
}

/** Extract keccak256 message hash from CCTP burn receipt logs. */
function extractMessageHash(burnResult) {
  // The MessageSent event topic
  // keccak256("MessageSent(bytes)") = 0x8c5261668696ce22758910d05bab8f186d6eb247ceac2af2e82c7dc17669b036
  const MESSAGE_SENT_TOPIC = '0x8c5261668696ce22758910d05bab8f186d6eb247ceac2af2e82c7dc17669b036'

  if (burnResult.logs) {
    for (const log of burnResult.logs) {
      if (log.topics && log.topics[0] === MESSAGE_SENT_TOPIC) {
        return burnResult.messageHash || log.data
      }
    }
  }

  // Fallback: some bridge responses include messageHash directly
  return burnResult.messageHash || null
}
