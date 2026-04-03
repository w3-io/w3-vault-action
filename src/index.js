import { createCommandRouter, setJsonOutput, writeSummary } from '@w3-io/action-core'
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
    await writeSummary('W3 Vault: deposit', [
      ['Amount', `${result.amountFormatted} USDC`],
      ['Vault', `\`${result.vault}\``],
      ['TX', `\`${result.txHash}\``],
    ])
  },

  redeem: async () => {
    const shares = core.getInput('shares', { required: true })
    const environment = core.getInput('environment') || 'testing'
    const receiver = core.getInput('receiver') || undefined
    const result = await redeem(bridge, { shares, environment, receiver, rpcUrl: getRpcUrl() })
    setJsonOutput('result', result)
    await writeSummary('W3 Vault: redeem', result)
  },

  status: async () => {
    const environment = core.getInput('environment') || 'testing'
    const address = core.getInput('address') || undefined
    const result = await status(bridge, { environment, address, rpcUrl: getRpcUrl() })
    setJsonOutput('result', result)
    await writeSummary('W3 Vault: status', [
      ['USDC Balance', result.usdcBalance],
      ['Shares', result.shares],
    ])
  },
})

router()
