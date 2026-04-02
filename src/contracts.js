// Contract addresses and ABIs for the W3 Vault system.
//
// The vault system lives on Base. When depositing from other chains,
// CCTP bridges USDC to Base first, then deposits into the vault.

// ── Environments ────────────────────────────────────────────────
// Select with the `environment` input: "testing" (default) or "production".

export const ENVIRONMENTS = {
  testing: {
    name: 'testing',
    operator: '0xd1b1afe415f0efb2d31c672d77cd5db810f5e02c',
    vault: '0x7b3D25c37c6ADf650F1f7696be2278cCFa2b638F',
    tradfi: '0xDf1D457FFb5b2d65e33A1bb896E295bc323474ad',
    usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    projectId: 30301,
    chainId: 8453,
    network: 'base',
  },
  production: {
    name: 'production',
    operator: '0xd1b1afe415f0efb2d31c672d77cd5db810f5e02c',
    vault: '0x0c6dAf9B4e0EB49A0c80c325da82EC028Cb8118B',
    tradfi: '0xDf1D457FFb5b2d65e33A1bb896E295bc323474ad',
    usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    projectId: 30301,
    chainId: 8453,
    network: 'base',
  },
}

// ── USDC addresses per chain (for CCTP approval) ────────────────

export const USDC_ADDRESSES = {
  ethereum: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
  avalanche: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E',
  arbitrum: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
  optimism: '0x0b2c639c533813f4aa9d7837caf62653d097ff85',
  polygon: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
  base: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
}

// ── CCTP contract addresses (mainnet, CREATE2 — same across EVM) ─

export const CCTP = {
  tokenMessenger: '0x6b25532e1060ce10cc3b0a99e5683b91bfde6982',
  messageTransmitter: '0x0a992d191deec32afe36203ad87d7d289a738f81',
}

// ── CCTP domain numbers ─────────────────────────────────────────

export const CCTP_DOMAINS = {
  ethereum: 0,
  avalanche: 1,
  optimism: 2,
  arbitrum: 3,
  noble: 4,
  solana: 5,
  base: 6,
  polygon: 7,
}

// ── Method signatures ───────────────────────────────────────────

export const METHODS = {
  // ERC20
  approve: 'function approve(address spender, uint256 amount) returns (bool)',
  balanceOf: 'function balanceOf(address account) returns (uint256)',

  // CCTP TokenMessenger
  depositForBurn:
    'function depositForBurn(uint256 amount, uint32 destinationDomain, bytes32 mintRecipient, address burnToken) returns (uint64 nonce)',

  // CCTP MessageTransmitter
  receiveMessage:
    'function receiveMessage(bytes message, bytes attestation) returns (bool success)',

  // W3YieldOperator
  deposit: 'function deposit(string calldata poId, uint256 amount)',
  depositFromBalance:
    'function depositFromBalance(string calldata poId, uint256 amount)',
  withdrawOldest: 'function withdrawOldest()',
  withdrawAndRepay: 'function withdrawAndRepay(string calldata poId)',
  totalDeposited: 'function totalDeposited() returns (uint256)',
  activeDepositsCount: 'function activeDepositsCount() returns (uint256)',
  canWithdraw: 'function canWithdraw() returns (bool)',
  currentInterest: 'function currentInterest() returns (uint256)',
  paginatedDeposits:
    'function paginatedDeposits(uint256 from, uint256 to) returns (string[] poIds, uint256[] principals, uint256[] currentValues)',
  depositQueueLength: 'function depositQueueLength() returns (uint256)',

  // W3 Vault
  convertToAssets: 'function convertToAssets(uint256 shares) returns (uint256)',
  convertToShares: 'function convertToShares(uint256 assets) returns (uint256)',
}
