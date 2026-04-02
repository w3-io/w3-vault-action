import * as core from '@actions/core'
import { ethereum } from '../lib/bridge.js'
import { CircleClient } from './circle-lite.js'
import { deposit, withdrawOldest, withdrawById, status, listDeposits } from './vault.js'
import { ENVIRONMENTS } from './contracts.js'

// Build a bridge-like object that vault.js expects
const bridge = { ethereum }

const COMMANDS = {
  deposit: runDeposit,
  'withdraw-oldest': runWithdrawOldest,
  'withdraw-by-id': runWithdrawById,
  status: runStatus,
  'list-deposits': runListDeposits,
}

export async function run() {
  try {
    const command = core.getInput('command', { required: true })
    const handler = COMMANDS[command]

    if (!handler) {
      core.setFailed(
        `Unknown command: "${command}". Available: ${Object.keys(COMMANDS).join(', ')}`,
      )
      return
    }

    const result = await handler()
    core.setOutput('result', JSON.stringify(result))
    writeSummary(command, result)
  } catch (error) {
    core.setFailed(error.message)
  }
}

// ── Command handlers ────────────────────────────────────────────

async function runDeposit() {
  const poId = core.getInput('po-id', { required: true })
  const amount = core.getInput('amount', { required: true })
  const sourceChain = core.getInput('source-chain') || 'base'
  const environment = core.getInput('environment') || 'testing'

  let circle = null
  if (sourceChain !== 'base') {
    const sandbox = core.getInput('sandbox') === 'true'
    circle = new CircleClient({ sandbox })
  }

  return deposit(bridge, {
    poId,
    amount,
    sourceChain,
    environment,
    circle,
  })
}

async function runWithdrawOldest() {
  const environment = core.getInput('environment') || 'testing'
  return withdrawOldest(bridge, { environment })
}

async function runWithdrawById() {
  const poId = core.getInput('po-id', { required: true })
  const environment = core.getInput('environment') || 'testing'
  return withdrawById(bridge, { poId, environment })
}

async function runStatus() {
  const environment = core.getInput('environment') || 'testing'
  return status(bridge, { environment })
}

async function runListDeposits() {
  const environment = core.getInput('environment') || 'testing'
  const fromInput = core.getInput('from')
  const toInput = core.getInput('to')
  return listDeposits(bridge, {
    environment,
    from: fromInput ? Number(fromInput) : 0,
    to: toInput ? Number(toInput) : 10,
  })
}

// ── Job summary ─────────────────────────────────────────────────

function writeSummary(command, result) {
  const heading = `W3 Vault: ${command}`

  if (command === 'status') {
    const env = ENVIRONMENTS[result.environment] || {}
    core.summary
      .addHeading(heading, 3)
      .addRaw(`**Environment:** ${result.environment}\n\n`)
      .addRaw(`**Vault:** \`${env.vault || 'unknown'}\`\n\n`)
      .addRaw(`**Total deposited:** ${result.totalDeposited} USDC\n\n`)
      .addRaw(`**Active deposits:** ${result.activeDeposits}\n\n`)
      .addRaw(`**Accrued interest:** ${result.accruedInterest} USDC\n\n`)
      .addRaw(`**Can withdraw:** ${result.canWithdraw ? 'Yes' : 'No'}\n\n`)
      .write()
    return
  }

  if (command === 'deposit') {
    core.summary
      .addHeading(heading, 3)
      .addRaw(`**Type:** ${result.type}\n\n`)
      .addRaw(`**PO ID:** ${result.poId}\n\n`)
      .addRaw(`**Amount:** ${result.amount} (raw)\n\n`)
    if (result.type === 'cross-chain') {
      core.summary
        .addRaw(`**Source:** ${result.sourceChain}\n\n`)
        .addRaw(`**Burn TX:** \`${result.burnTxHash}\`\n\n`)
        .addRaw(`**Mint TX:** \`${result.mintTxHash}\`\n\n`)
    }
    core.summary
      .addRaw(`**Deposit TX:** \`${result.depositTxHash || result.txHash}\`\n\n`)
      .write()
    return
  }

  core.summary
    .addHeading(heading, 3)
    .addCodeBlock(JSON.stringify(result, null, 2), 'json')
    .write()
}
