// Vault operations — deposit, withdraw, and status queries.
//
// All on-chain calls go through the W3 bridge via @w3-io/action-core.
// The bridge handles signing — no private keys in the action.

import { ENVIRONMENTS, USDC_ADDRESSES, CCTP, CCTP_DOMAINS, METHODS } from './contracts.js'

export function resolveEnvironment(env) {
  const config = ENVIRONMENTS[env]
  if (!config) {
    throw new Error(
      `Unknown environment: "${env}". Available: ${Object.keys(ENVIRONMENTS).join(', ')}`,
    )
  }
  return config
}

/** Build optional rpcUrl param if provided. */
function rpcParam(opts) {
  return opts.rpcUrl ? { rpcUrl: opts.rpcUrl } : {}
}

export async function deposit(bridge, opts) {
  const { poId, amount, sourceChain, environment } = opts
  const env = resolveEnvironment(environment)
  const amountRaw = parseUsdcAmount(amount)

  if (sourceChain === 'base') {
    return depositDirect(bridge, env, poId, amountRaw, opts)
  }
  return depositCrossChain(bridge, opts.circle, env, poId, amountRaw, sourceChain, opts)
}

async function depositDirect(bridge, env, poId, amountRaw, opts) {
  const result = await bridge.chain('ethereum', 'call-contract', {
    contract: env.operator,
    method: METHODS.deposit,
    args: [poId, amountRaw],
    ...rpcParam(opts),
  }, env.network)

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

async function depositCrossChain(bridge, circle, env, poId, amountRaw, sourceChain) {
  const sourceDomain = CCTP_DOMAINS[sourceChain]
  if (sourceDomain === undefined) {
    throw new Error(`Unsupported source chain: "${sourceChain}". Supported: ${Object.keys(CCTP_DOMAINS).join(', ')}`)
  }
  const sourceUsdc = USDC_ADDRESSES[sourceChain]
  if (!sourceUsdc) throw new Error(`No USDC address for chain: "${sourceChain}"`)
  if (!circle) throw new Error('Cross-chain deposits require a Circle client for attestation')

  // 1. Approve USDC for TokenMessenger
  await bridge.chain('ethereum', 'call-contract', {
    contract: sourceUsdc,
    method: METHODS.approve,
    args: [CCTP.tokenMessenger, amountRaw],
  }, sourceChain)

  // 2. Burn USDC via CCTP
  const recipientBytes32 = padAddressToBytes32(env.operator)
  const burnResult = await bridge.chain('ethereum', 'call-contract', {
    contract: CCTP.tokenMessenger,
    method: METHODS.depositForBurn,
    args: [amountRaw, CCTP_DOMAINS.base, recipientBytes32, sourceUsdc],
  }, sourceChain)

  // 3. Extract message hash from logs
  const messageHash = extractMessageHash(burnResult)
  if (!messageHash) throw new Error('Failed to extract message hash from CCTP burn receipt')

  // 4. Wait for Circle attestation
  const attestation = await circle.waitForAttestation(messageHash, {
    pollInterval: 10,
    maxAttempts: 60,
  })
  if (attestation.status !== 'complete') {
    throw new Error(`Attestation timeout: status=${attestation.status}`)
  }

  // 5. Mint USDC on Base
  const mintResult = await bridge.chain('ethereum', 'call-contract', {
    contract: CCTP.messageTransmitter,
    method: METHODS.receiveMessage,
    args: [burnResult.messageBytes, attestation.attestation],
  }, 'base')

  // 6. Deposit into vault
  const depositResult = await bridge.chain('ethereum', 'call-contract', {
    contract: env.operator,
    method: METHODS.depositFromBalance,
    args: [poId, amountRaw],
  }, env.network)

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

export async function withdrawOldest(bridge, opts) {
  const env = resolveEnvironment(opts.environment)
  const result = await bridge.chain('ethereum', 'call-contract', {
    contract: env.operator,
    method: METHODS.withdrawOldest,
    args: [],
    ...rpcParam(opts),
  }, env.network)

  return {
    operator: env.operator,
    vault: env.vault,
    txHash: result.txHash || result.transactionHash,
  }
}

export async function withdrawById(bridge, opts) {
  const env = resolveEnvironment(opts.environment)
  const result = await bridge.chain('ethereum', 'call-contract', {
    contract: env.operator,
    method: METHODS.withdrawAndRepay,
    args: [opts.poId],
    ...rpcParam(opts),
  }, env.network)

  return {
    poId: opts.poId,
    operator: env.operator,
    vault: env.vault,
    txHash: result.txHash || result.transactionHash,
  }
}

export async function status(bridge, opts) {
  const env = resolveEnvironment(opts.environment)
  const read = (method) =>
    bridge.chain('ethereum', 'read-contract', {
      contract: env.operator,
      method: method,
      args: [],
      ...rpcParam(opts),
    }, env.network)

  // currentInterest() reverts with arithmetic underflow when there are
  // no active deposits — catch and default to "0".
  const safeRead = (method) => read(method).catch(() => ({ result: '0' }))

  const [totalDeposited, activeCount, canWithdrawResult, interest, queueLength] =
    await Promise.all([
      read(METHODS.totalDeposited),
      read(METHODS.activeDepositsCount),
      read(METHODS.canWithdraw),
      safeRead(METHODS.currentInterest),
      read(METHODS.depositQueueLength),
    ])

  return {
    environment: env.name,
    operator: env.operator,
    vault: env.vault,
    totalDeposited: formatUsdc(totalDeposited.result),
    totalDepositedRaw: totalDeposited.result,
    activeDeposits: Number(activeCount.result),
    canWithdraw: Boolean(canWithdrawResult.result),
    accruedInterest: formatUsdc(interest.result),
    accruedInterestRaw: interest.result,
    totalDepositsEver: Number(queueLength.result),
  }
}

export async function listDeposits(bridge, opts) {
  const env = resolveEnvironment(opts.environment)
  const result = await bridge.chain('ethereum', 'read-contract', {
    contract: env.operator,
    method: METHODS.paginatedDeposits,
    args: [String(opts.from || 0), String(opts.to || 10)],
    ...rpcParam(opts),
  }, env.network)

  const data = result.result || result
  const poIds = data[0] || []
  const principals = data[1] || []
  const currentValues = data[2] || []

  return {
    environment: env.name,
    from: opts.from || 0,
    to: opts.to || 10,
    deposits: poIds.map((poId, i) => ({
      poId,
      principal: formatUsdc(principals[i]),
      principalRaw: principals[i],
      currentValue: formatUsdc(currentValues[i]),
      currentValueRaw: currentValues[i],
    })),
  }
}

// ── Helpers ─────────────────────────────────────────────────────

function parseUsdcAmount(amount) {
  const parts = amount.split('.')
  const whole = parts[0]
  const frac = (parts[1] || '').padEnd(6, '0').slice(0, 6)
  return `${whole}${frac}`
}

function formatUsdc(raw) {
  const s = String(raw).padStart(7, '0')
  const whole = s.slice(0, -6) || '0'
  const frac = s.slice(-6)
  return `${whole}.${frac}`
}

function padAddressToBytes32(address) {
  const clean = address.toLowerCase().replace('0x', '')
  return '0x' + clean.padStart(64, '0')
}

const MESSAGE_SENT_TOPIC = '0x8c5261668696ce22758910d05bab8f186d6eb247ceac2af2e82c7dc17669b036'

function extractMessageHash(burnResult) {
  const logs = typeof burnResult.logs === 'string'
    ? JSON.parse(burnResult.logs)
    : burnResult.logs || []
  for (const log of logs) {
    if (log.topics?.[0] === MESSAGE_SENT_TOPIC) return log.data
  }
  return burnResult.messageHash || null
}
