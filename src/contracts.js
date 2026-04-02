// Yelay vault contracts on Base.

export const ENVIRONMENTS = {
  testing: {
    name: 'testing',
    vault: '0x7b3D25c37c6ADf650F1f7696be2278cCFa2b638F',
    usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    projectId: 1,
    chainId: 8453,
    network: 'base',
  },
  production: {
    name: 'production',
    vault: '0x0c6dAf9B4e0EB49A0c80c325da82EC028Cb8118B',
    usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    projectId: 1,
    chainId: 8453,
    network: 'base',
  },
}

export const METHODS = {
  // ERC20
  approve: 'function approve(address spender, uint256 amount) returns (bool)',
  balanceOf: 'function balanceOf(address account) returns (uint256)',

  // Yelay vault
  deposit: 'function deposit(uint256 assets, uint256 projectId, address receiver) returns (uint256 shares)',
  redeem: 'function redeem(uint256 shares, uint256 projectId, address receiver) returns (uint256 assets)',
  convertToAssets: 'function convertToAssets(uint256 shares) returns (uint256)',
  convertToShares: 'function convertToShares(uint256 assets) returns (uint256)',
  balanceOfShares: 'function balanceOf(address account, uint256 id) returns (uint256)',
  underlyingAsset: 'function underlyingAsset() returns (address)',
}
