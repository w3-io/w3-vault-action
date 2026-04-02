/**
 * @w3-io/bridge — W3 syscall bridge SDK.
 *
 * Provides chain operations (Ethereum, Bitcoin, Solana) and crypto
 * primitives to Docker-based actions via the W3 bridge socket.
 *
 * The bridge socket is mounted into every container at the path
 * specified by the W3_BRIDGE_SOCKET environment variable (or
 * available via TCP at W3_BRIDGE_URL for macOS dev).
 *
 * Zero dependencies — uses Node.js built-in http module.
 *
 * @example
 * ```js
 * import { bridge } from '@w3-io/bridge'
 *
 * const { result } = await bridge.ethereum.readContract({
 *   network: 'base',
 *   contract: '0xd1b1...',
 *   method: 'function balanceOf(address) returns (uint256)',
 *   args: ['0x51AaE...'],
 * })
 * ```
 */

import http from 'node:http'

// ─── Transport ──────────────────────────────────────────────────────

/**
 * Make an HTTP request to the bridge.
 *
 * Supports Unix socket (production) and TCP (macOS dev fallback).
 * Automatically resolves the bridge endpoint from environment variables.
 *
 * @param {string} path - URL path (e.g., "/ethereum/read-contract")
 * @param {object} body - JSON request body
 * @returns {Promise<object>} Parsed JSON response
 */
async function request(path, body) {
  const socketPath = process.env.W3_BRIDGE_SOCKET
  const bridgeUrl = process.env.W3_BRIDGE_URL

  if (!socketPath && !bridgeUrl) {
    throw new BridgeError(
      'BRIDGE_NOT_AVAILABLE',
      'Neither W3_BRIDGE_SOCKET nor W3_BRIDGE_URL is set. ' +
        'This SDK requires the W3 bridge — run inside a W3 workflow step.',
    )
  }

  const payload = JSON.stringify(body)

  const options = socketPath
    ? {
        socketPath,
        path,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
      }
    : {
        hostname: new URL(bridgeUrl).hostname,
        port: new URL(bridgeUrl).port,
        path,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
      }

  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = ''
      res.on('data', (chunk) => {
        data += chunk
      })
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data)
          if (parsed.ok === false) {
            reject(
              new BridgeError(
                parsed.code || 'BRIDGE_ERROR',
                parsed.error || 'Unknown bridge error',
              ),
            )
          } else {
            resolve(parsed)
          }
        } catch {
          reject(new BridgeError('PARSE_ERROR', `Invalid JSON response: ${data.slice(0, 200)}`))
        }
      })
    })

    req.on('error', (err) => {
      reject(new BridgeError('CONNECTION_ERROR', `Bridge connection failed: ${err.message}`))
    })

    req.write(payload)
    req.end()
  })
}

/** GET request (for health checks). */
async function get(path) {
  const socketPath = process.env.W3_BRIDGE_SOCKET
  const bridgeUrl = process.env.W3_BRIDGE_URL

  if (!socketPath && !bridgeUrl) {
    throw new BridgeError('BRIDGE_NOT_AVAILABLE', 'Bridge not configured')
  }

  const options = socketPath
    ? { socketPath, path, method: 'GET' }
    : {
        hostname: new URL(bridgeUrl).hostname,
        port: new URL(bridgeUrl).port,
        path,
        method: 'GET',
      }

  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = ''
      res.on('data', (chunk) => {
        data += chunk
      })
      res.on('end', () => {
        try {
          resolve(JSON.parse(data))
        } catch {
          resolve({ raw: data })
        }
      })
    })
    req.on('error', (err) => {
      reject(new BridgeError('CONNECTION_ERROR', `Bridge connection failed: ${err.message}`))
    })
    req.end()
  })
}

// ─── Error ──────────────────────────────────────────────────────────

export class BridgeError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'BridgeError'
    this.code = code
  }
}

// ─── Chain helpers ──────────────────────────────────────────────────

function chainRequest(chain, action, network, params) {
  return request(`/${chain}/${action}`, { network, params })
}

// ─── Ethereum ───────────────────────────────────────────────────────

export const ethereum = {
  /** Read a contract view function. */
  readContract({ network, contract, method, args, abi, rpcUrl }) {
    return chainRequest('ethereum', 'read-contract', network, {
      contract,
      method,
      args,
      abi,
      rpcUrl,
    })
  },

  /** Call a state-changing contract function (requires signer). */
  callContract({ network, contract, method, args, abi, value, rpcUrl, gasLimit }) {
    return chainRequest('ethereum', 'call-contract', network, {
      contract,
      method,
      args,
      abi,
      value,
      rpcUrl,
      gasLimit,
    })
  },

  /** Get ETH balance. */
  getBalance({ network, address, rpcUrl }) {
    return chainRequest('ethereum', 'get-balance', network, { address, rpcUrl })
  },

  /** Get ERC-20 token balance. */
  getTokenBalance({ network, token, address, rpcUrl }) {
    return chainRequest('ethereum', 'get-token-balance', network, { token, address, rpcUrl })
  },

  /** Get ERC-20 allowance. */
  getTokenAllowance({ network, token, owner, spender, rpcUrl }) {
    return chainRequest('ethereum', 'get-token-allowance', network, {
      token,
      owner,
      spender,
      rpcUrl,
    })
  },

  /** Transfer ETH. */
  transfer({ network, to, value, rpcUrl, gasLimit }) {
    return chainRequest('ethereum', 'transfer', network, { to, value, rpcUrl, gasLimit })
  },

  /** Transfer ERC-20 tokens. */
  transferToken({ network, token, to, amount, rpcUrl, gasLimit }) {
    return chainRequest('ethereum', 'transfer-token', network, {
      token,
      to,
      amount,
      rpcUrl,
      gasLimit,
    })
  },

  /** Approve ERC-20 spending. */
  approveToken({ network, token, spender, amount, rpcUrl, gasLimit }) {
    return chainRequest('ethereum', 'approve-token', network, {
      token,
      spender,
      amount,
      rpcUrl,
      gasLimit,
    })
  },

  /** Send raw transaction with calldata. */
  sendTransaction({ network, to, data, value, rpcUrl, gasLimit }) {
    return chainRequest('ethereum', 'send-transaction', network, {
      to,
      data,
      value,
      rpcUrl,
      gasLimit,
    })
  },

  /** Deploy a contract from bytecode. */
  deployContract({ network, bytecode, args, rpcUrl, gasLimit }) {
    return chainRequest('ethereum', 'deploy-contract', network, {
      bytecode,
      args,
      rpcUrl,
      gasLimit,
    })
  },

  /** Get transaction receipt. */
  getTransaction({ network, hash, rpcUrl }) {
    return chainRequest('ethereum', 'get-transaction', network, { hash, rpcUrl })
  },

  /** Query contract event logs. */
  getEvents({ network, address, topics, fromBlock, toBlock, rpcUrl }) {
    return chainRequest('ethereum', 'get-events', network, {
      address,
      topics,
      fromBlock,
      toBlock,
      rpcUrl,
    })
  },

  /** Resolve ENS name. */
  resolveName({ network, name, rpcUrl }) {
    return chainRequest('ethereum', 'resolve-name', network, { name, rpcUrl })
  },

  /** Wait for transaction confirmation. */
  waitForTransaction({ network, hash, confirmations, rpcUrl }) {
    return chainRequest('ethereum', 'wait-for-transaction', network, {
      hash,
      confirmations,
      rpcUrl,
    })
  },

  /** Get ERC-721 NFT owner. */
  getNftOwner({ network, token, tokenId, rpcUrl }) {
    return chainRequest('ethereum', 'get-nft-owner', network, { token, tokenId, rpcUrl })
  },

  /** Transfer ERC-721 NFT. */
  transferNft({ network, token, tokenId, to, rpcUrl, gasLimit }) {
    return chainRequest('ethereum', 'transfer-nft', network, {
      token,
      tokenId,
      to,
      rpcUrl,
      gasLimit,
    })
  },
}

// ─── Bitcoin ────────────────────────────────────────────────────────

export const bitcoin = {
  /** Get BTC balance. */
  getBalance({ network, address }) {
    return chainRequest('bitcoin', 'get-balance', network, { address })
  },

  /** Get UTXOs. */
  getUtxos({ network, address }) {
    return chainRequest('bitcoin', 'get-utxos', network, { address })
  },

  /** Get transaction details. */
  getTransaction({ network, txid }) {
    return chainRequest('bitcoin', 'get-transaction', network, { txid })
  },

  /** Get current fee rate estimates. */
  getFeeRate({ network }) {
    return chainRequest('bitcoin', 'get-fee-rate', network, {})
  },

  /** Send BTC. */
  send({ network, to, amount, feeRate }) {
    return chainRequest('bitcoin', 'send', network, { to, amount, feeRate })
  },

  /** Wait for transaction confirmation. */
  waitForTransaction({ network, txid, confirmations }) {
    return chainRequest('bitcoin', 'wait-for-transaction', network, { txid, confirmations })
  },
}

// ─── Solana ─────────────────────────────────────────────────────────

export const solana = {
  /** Get SOL balance. */
  getBalance({ network, address, rpcUrl }) {
    return chainRequest('solana', 'get-balance', network, { address, rpcUrl })
  },

  /** Get SPL token balance. */
  getTokenBalance({ network, address, mint, rpcUrl }) {
    return chainRequest('solana', 'get-token-balance', network, { address, mint, rpcUrl })
  },

  /** Get account data. */
  getAccount({ network, address, rpcUrl }) {
    return chainRequest('solana', 'get-account', network, { address, rpcUrl })
  },

  /** List SPL token accounts. */
  getTokenAccounts({ network, owner, rpcUrl }) {
    return chainRequest('solana', 'get-token-accounts', network, { owner, rpcUrl })
  },

  /** Transfer SOL. */
  transfer({ network, to, amount, rpcUrl }) {
    return chainRequest('solana', 'transfer', network, { to, amount, rpcUrl })
  },

  /** Transfer SPL tokens. */
  transferToken({ network, mint, to, amount, rpcUrl }) {
    return chainRequest('solana', 'transfer-token', network, { mint, to, amount, rpcUrl })
  },

  /**
   * Invoke a Solana program instruction.
   *
   * @param {string[]} [ephemeralSignerPubkeys] - Pubkeys of ephemeral keypairs
   *   (from `generateKeypair`) to include as additional transaction signers.
   *   Only the specified keypairs are included — not all generated ones.
   */
  callProgram({ network, programId, accounts, data, rpcUrl, ephemeralSignerPubkeys }) {
    return chainRequest('solana', 'call-program', network, {
      programId,
      accounts,
      data,
      rpcUrl,
      ephemeralSignerPubkeys,
    })
  },

  /** Get transaction details. */
  getTransaction({ network, signature, rpcUrl }) {
    return chainRequest('solana', 'get-transaction', network, { signature, rpcUrl })
  },

  /** Wait for transaction confirmation. */
  waitForTransaction({ network, signature, rpcUrl }) {
    return chainRequest('solana', 'wait-for-transaction', network, { signature, rpcUrl })
  },

  /**
   * Generate an ephemeral keypair for use as an additional signer.
   *
   * The private key is held by the protocol — only the public key
   * is returned. When `callProgram` is called, all generated keypairs
   * are automatically included as transaction signers.
   *
   * Used for Solana programs that require non-PDA signer accounts
   * (e.g., Anchor `init` for event data accounts in CCTP).
   *
   * @returns {{ pubkey: string }} Base58 public key
   */
  generateKeypair() {
    return request('/solana/generate-keypair', {})
  },

  /**
   * Get the payer's public key.
   *
   * Returns the pubkey of the configured Solana signer (W3_SECRET_SOLANA).
   * No secret exposed. Use this to derive ATAs and PDAs that include
   * the payer's pubkey as a seed.
   *
   * @returns {{ pubkey: string }} Base58 public key
   */
  payerAddress() {
    return get('/solana/payer-address')
  },
}

// ─── Crypto ─────────────────────────────────────────────────────────

export const crypto = {
  /** Keccak-256 hash. */
  keccak256({ data }) {
    return request('/crypto/keccak256', { params: { data } })
  },

  /** AES-256-GCM encrypt. */
  aesEncrypt({ key, data }) {
    return request('/crypto/aes-encrypt', { params: { key, data } })
  },

  /** AES-256-GCM decrypt. */
  aesDecrypt({ key, data }) {
    return request('/crypto/aes-decrypt', { params: { key, data } })
  },

  /** Ed25519 sign. */
  ed25519Sign({ key, data }) {
    return request('/crypto/ed25519-sign', { params: { key, data } })
  },

  /** Ed25519 verify. */
  ed25519Verify({ key, data, signature }) {
    return request('/crypto/ed25519-verify', { params: { key, data, signature } })
  },

  /** Ed25519 public key from private key. */
  ed25519PublicKey({ key }) {
    return request('/crypto/ed25519-public-key', { params: { key } })
  },

  /** HKDF key derivation. */
  hkdf({ key, salt, info, length }) {
    return request('/crypto/hkdf', { params: { key, salt, info, length } })
  },

  /** JWT sign. */
  jwtSign({ algorithm, key, payload, expiry }) {
    return request('/crypto/jwt-sign', { params: { algorithm, key, payload, expiry } })
  },

  /** JWT verify. */
  jwtVerify({ algorithm, key, token }) {
    return request('/crypto/jwt-verify', { params: { algorithm, key, token } })
  },

  /** TOTP generate/verify. */
  totp({ key, digits, period, algorithm, time }) {
    return request('/crypto/totp', { params: { key, digits, period, algorithm, time } })
  },
}

// ─── Health ─────────────────────────────────────────────────────────

/** Check bridge health. */
export function health() {
  return get('/health')
}

/** Send a heartbeat to keep the step alive during long operations. */
export function heartbeat() {
  return request('/heartbeat', {})
}

/**
 * Start a background heartbeat interval.
 *
 * Returns a function to stop the heartbeat. Call this at the
 * start of long-running operations and stop it when done.
 *
 * @param {number} [intervalMs=10000] - Heartbeat interval in milliseconds
 * @returns {() => void} Stop function
 */
export function startHeartbeat(intervalMs = 10_000) {
  const timer = setInterval(() => {
    heartbeat().catch(() => {
      // Swallow errors — heartbeat is best-effort
    })
  }, intervalMs)
  // Don't keep the process alive just for heartbeats
  timer.unref()
  return () => clearInterval(timer)
}

// ─── Convenience export ─────────────────────────────────────────────

/**
 * Bridge namespace — groups all operations.
 *
 * @example
 * ```js
 * import { bridge } from '@w3-io/bridge'
 *
 * await bridge.ethereum.readContract({ ... })
 * await bridge.crypto.keccak256({ data: '0xdeadbeef' })
 * await bridge.health()
 * ```
 */
export const bridge = {
  ethereum,
  bitcoin,
  solana,
  crypto,
  health,
  heartbeat,
  startHeartbeat,
}
