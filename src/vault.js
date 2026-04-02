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

export async function deposit(bridge, opts) {
  const { poId, amount, sourceChain, environment } = opts
  const env = resolveEnvironment(environment)
  const amountRaw = parseUsdcAmount(amount)

  if (sourceChain === 'base') {
    return depositDirect(bridge, env, poId, amountRaw)
  }
  return depositCrossChain(bridge, opts.circle, env, poId, amountRaw, sourceChain)
}

async function depositDirect(bridge, env, poId, amountRaw) {
  const result = await bridge.chain('ethereum', 'call-contract', {
    contractAddress: env.operator,
    functionSignature: METHODS.deposit,
    args: JSON.stringify([poId, amountRaw]),
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
    contractAddress: sourceUsdc,
    functionSignature: METHODS.approve,
    args: JSON.stringify([CCTP.tokenMessenger, amountRaw]),
  }, sourceChain)

  // 2. Burn USDC via CCTP
  const recipientBytes32 = padAddressToBytes32(env.operator)
  const burnResult = await bridge.chain('ethereum', 'call-contract', {
    contractAddress: CCTP.tokenMessenger,
    functionSignature: METHODS.depositForBurn,
    args: JSON.stringify([amountRaw, CCTP_DOMAINS.base, recipientBytes32, sourceUsdc]),
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
    contractAddress: CCTP.messageTransmitter,
    functionSignature: METHODS.receiveMessage,
    args: JSON.stringify([burnResult.messageBytes, attestation.attestation]),
  }, 'base')

  // 6. Deposit into vault
  const depositResult = await bridge.chain('ethereum', 'call-contract', {
    contractAddress: env.operator,
    functionSignature: METHODS.depositFromBalance,
    args: JSON.stringify([poId, amountRaw]),
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
    contractAddress: env.operator,
    functionSignature: METHODS.withdrawOldest,
    args: '[]',
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
    contractAddress: env.operator,
    functionSignature: METHODS.withdrawAndRepay,
    args: JSON.stringify([opts.poId]),
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
      contractAddress: env.operator,
      functionSignature: method,
      args: '[]',
    }, env.network)

  const [totalDeposited, activeCount, canWithdrawResult, interest, queueLength] =
    await Promise.all([
      read(METHODS.totalDeposited),
      read(METHODS.activeDepositsCount),
      read(METHODS.canWithdraw),
      read(METHODS.currentInterest),
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
    contractAddress: env.operator,
    functionSignature: METHODS.paginatedDeposits,
    args: JSON.stringify([String(opts.from || 0), String(opts.to || 10)]),
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
