import { createCommandRouter, setJsonOutput } from '@w3-io/action-core'
import { bridge } from '@w3-io/action-core'
import * as core from '@actions/core'
import { deposit, redeem, status } from './vault.js'

function getRpcUrl() {
  return core.getInput('rpc-url') || undefined
}

const router = createCommandRouter({
  deposit: async () => {
    const amount = core.getInput('amount', { required: true })
    const environment = core.getInput('environment') || 'testing'
    const receiver = core.getInput('receiver') || undefined
    const result = await deposit(bridge, { amount, environment, receiver, rpcUrl: getRpcUrl() })
    setJsonOutput('result', result)
    core.summary
      .addHeading('W3 Vault: deposit', 3)
      .addRaw(`**Amount:** ${result.amountFormatted} USDC\n\n`)
      .addRaw(`**Vault:** \`${result.vault}\`\n\n`)
      .addRaw(`**TX:** \`${result.txHash}\`\n\n`)
      .write()
  },

  redeem: async () => {
    const shares = core.getInput('shares', { required: true })
    const environment = core.getInput('environment') || 'testing'
    const receiver = core.getInput('receiver') || undefined
    const result = await redeem(bridge, { shares, environment, receiver, rpcUrl: getRpcUrl() })
    setJsonOutput('result', result)
    core.summary
      .addHeading('W3 Vault: redeem', 3)
      .addCodeBlock(JSON.stringify(result, null, 2), 'json')
      .write()
  },

  status: async () => {
    const environment = core.getInput('environment') || 'testing'
    const address = core.getInput('address') || undefined
    const result = await status(bridge, { environment, address, rpcUrl: getRpcUrl() })
    setJsonOutput('result', result)
    core.summary
      .addHeading('W3 Vault: status', 3)
      .addRaw(`**USDC Balance:** ${result.usdcBalance}\n\n`)
      .addRaw(`**Shares:** ${result.shares}\n\n`)
      .write()
  },
})

router()
