import { createCommandRouter, setJsonOutput, handleError } from '@w3-io/action-core'
import { bridge } from '@w3-io/action-core'
import * as core from '@actions/core'
import { CircleClient } from './circle-lite.js'
import { deposit, withdrawOldest, withdrawById, status, listDeposits } from './vault.js'

const router = createCommandRouter({
  deposit: async () => {
    const poId = core.getInput('po-id', { required: true })
    const amount = core.getInput('amount', { required: true })
    const sourceChain = core.getInput('source-chain') || 'base'
    const environment = core.getInput('environment') || 'testing'

    let circle = null
    if (sourceChain !== 'base') {
      const sandbox = core.getInput('sandbox') === 'true'
      circle = new CircleClient({ sandbox })
    }

    const result = await deposit(bridge, {
      poId,
      amount,
      sourceChain,
      environment,
      circle,
    })
    setJsonOutput('result', result)
    writeSummary('deposit', result)
  },

  'withdraw-oldest': async () => {
    const environment = core.getInput('environment') || 'testing'
    const result = await withdrawOldest(bridge, { environment })
    setJsonOutput('result', result)
    writeSummary('withdraw-oldest', result)
  },

  'withdraw-by-id': async () => {
    const poId = core.getInput('po-id', { required: true })
    const environment = core.getInput('environment') || 'testing'
    const result = await withdrawById(bridge, { poId, environment })
    setJsonOutput('result', result)
    writeSummary('withdraw-by-id', result)
  },

  status: async () => {
    const environment = core.getInput('environment') || 'testing'
    const rpcUrl = core.getInput('rpc-url') || undefined
    const result = await status(bridge, { environment, rpcUrl })
    setJsonOutput('result', result)
    writeSummary('status', result)
  },

  'list-deposits': async () => {
    const environment = core.getInput('environment') || 'testing'
    const from = Number(core.getInput('from') || '0')
    const to = Number(core.getInput('to') || '10')
    const result = await listDeposits(bridge, { environment, from, to })
    setJsonOutput('result', result)
    writeSummary('list-deposits', result)
  },
})

router()

function writeSummary(command, result) {
  try {
    if (command === 'status') {
      core.summary
        .addHeading(`W3 Vault: ${command}`, 3)
        .addRaw(`**Environment:** ${result.environment}\n\n`)
        .addRaw(`**Total deposited:** ${result.totalDeposited} USDC\n\n`)
        .addRaw(`**Active deposits:** ${result.activeDeposits}\n\n`)
        .addRaw(`**Accrued interest:** ${result.accruedInterest} USDC\n\n`)
        .write()
    } else if (command === 'deposit') {
      const s = core.summary
        .addHeading(`W3 Vault: ${command}`, 3)
        .addRaw(`**Type:** ${result.type}\n\n`)
        .addRaw(`**PO ID:** ${result.poId}\n\n`)
        .addRaw(`**Amount:** ${result.amount}\n\n`)
      if (result.type === 'cross-chain') {
        s.addRaw(`**Source:** ${result.sourceChain}\n\n`)
          .addRaw(`**Burn TX:** \`${result.burnTxHash}\`\n\n`)
          .addRaw(`**Mint TX:** \`${result.mintTxHash}\`\n\n`)
      }
      s.addRaw(`**Deposit TX:** \`${result.depositTxHash || result.txHash}\`\n\n`).write()
    } else {
      core.summary
        .addHeading(`W3 Vault: ${command}`, 3)
        .addCodeBlock(JSON.stringify(result, null, 2), 'json')
        .write()
    }
  } catch {
    // Summary is best-effort
  }
}
