// Yelay vault configs per W3 deployment environment.
//
// `network` is the W3 bridge network identifier (not the ForDefi
// chain unique_id — those differ). For ForDefi-signed flows that
// consume calldata produced by `build-deposit`, see the bridge
// network → ForDefi chain mapping documented in
// w3-action.yaml's display:.commands[*].chain_explorer block.

export const ENVIRONMENTS = {
  // Yelay test deployment on Base. Permissionless for development.
  testing: {
    name: "testing",
    vault: "0x7b3D25c37c6ADf650F1f7696be2278cCFa2b638F",
    usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    projectId: 1,
    chainId: 8453,
    network: "base",
  },
  // Base production (Yelay smart-vault). projectId=1.
  "base-production": {
    name: "base-production",
    vault: "0x0c6dAf9B4e0EB49A0c80c325da82EC028Cb8118B",
    usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    projectId: 1,
    chainId: 8453,
    network: "base",
  },
  // Ethereum production — the W3 Vault that payments.w3.io reads
  // APY from. projectId 30301 (0x765d) is the W3-owned project
  // inside the Yelay smart-vault. This is the canonical demo target.
  "ethereum-production": {
    name: "ethereum-production",
    vault: "0x39DAc87bE293DC855b60feDd89667364865378cc",
    usdc: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    projectId: 30301,
    chainId: 1,
    network: "ethereum",
  },
  // Backwards-compatible alias: existing callers that pass
  // `environment: production` continue to hit Base. New callers
  // should be explicit about which network.
  production: {
    name: "production",
    vault: "0x0c6dAf9B4e0EB49A0c80c325da82EC028Cb8118B",
    usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    projectId: 1,
    chainId: 8453,
    network: "base",
    _alias_of: "base-production",
  },
};

export const METHODS = {
  // ERC20
  approve: "function approve(address spender, uint256 amount) returns (bool)",
  balanceOf: "function balanceOf(address account) returns (uint256)",

  // Yelay vault
  deposit:
    "function deposit(uint256 assets, uint256 projectId, address receiver) returns (uint256 shares)",
  redeem:
    "function redeem(uint256 shares, uint256 projectId, address receiver) returns (uint256 assets)",
  convertToAssets: "function convertToAssets(uint256 shares) returns (uint256)",
  convertToShares: "function convertToShares(uint256 assets) returns (uint256)",
  balanceOfShares:
    "function balanceOf(address account, uint256 id) returns (uint256)",
  underlyingAsset: "function underlyingAsset() returns (address)",
};
