// Minimal Circle IRIS client for attestation polling.
// Only used for cross-chain deposits — no wallet/transaction commands.

const IRIS_MAINNET = 'https://iris-api.circle.com'
const IRIS_SANDBOX = 'https://iris-api-sandbox.circle.com'

export class CircleClient {
  constructor({ sandbox = false } = {}) {
    this.baseUrl = sandbox ? IRIS_SANDBOX : IRIS_MAINNET
  }

  async getAttestation(messageHash) {
    const url = `${this.baseUrl}/v1/attestations/${messageHash}`
    const resp = await fetch(url)
    if (!resp.ok) {
      throw new Error(`IRIS API error: ${resp.status} ${resp.statusText}`)
    }
    const data = await resp.json()
    return {
      messageHash,
      status: data.status,
      attestation: data.attestation || null,
    }
  }

  async waitForAttestation(messageHash, { pollInterval = 5, maxAttempts = 60 } = {}) {
    for (let i = 1; i <= maxAttempts; i++) {
      const result = await this.getAttestation(messageHash)
      if (result.status === 'complete') {
        return { ...result, attempts: i }
      }
      if (i < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, pollInterval * 1000))
      }
    }
    return {
      messageHash,
      status: 'pending_confirmations',
      attestation: null,
      attempts: maxAttempts,
    }
  }
}
