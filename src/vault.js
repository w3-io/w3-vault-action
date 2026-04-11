// Direct Yelay vault operations — deposit USDC, redeem shares, check balance.
// No operator contract, no roles, no TradFi. Just ERC20 approve + vault.deposit.

import { W3ActionError } from "@w3-io/action-core";
import { ENVIRONMENTS, METHODS } from "./contracts.js";

export function resolveEnvironment(env) {
  const config = ENVIRONMENTS[env];
  if (!config) {
    throw new W3ActionError(
      "MISSING_INPUT",
      `Unknown environment: "${env}". Available: ${Object.keys(ENVIRONMENTS).join(", ")}`,
    );
  }
  return config;
}

function rpcParam(opts) {
  return opts.rpcUrl ? { rpcUrl: opts.rpcUrl } : {};
}

function parseUsdcAmount(amount) {
  const parts = amount.split(".");
  const whole = parts[0];
  const frac = (parts[1] || "").padEnd(6, "0").slice(0, 6);
  return `${whole}${frac}`;
}

function formatUsdc(raw) {
  const s = String(raw).padStart(7, "0");
  const whole = s.slice(0, -6) || "0";
  const frac = s.slice(-6);
  return `${whole}.${frac}`;
}

/**
 * Deposit USDC into the Yelay vault.
 * 1. Approve USDC for vault
 * 2. Call vault.deposit(amount, projectId, receiver)
 */
export async function deposit(bridge, opts) {
  const env = resolveEnvironment(opts.environment);
  const amountRaw = parseUsdcAmount(opts.amount);

  // Step 1: Approve USDC for the vault
  await bridge.chain(
    "ethereum",
    "call-contract",
    {
      contract: env.usdc,
      method: METHODS.approve,
      args: [env.vault, amountRaw],
      ...rpcParam(opts),
    },
    env.network,
  );

  // Step 2: Deposit into vault — shares go to the signer.
  // Gas is estimated by the protocol with a 1.3x safety multiplier.
  const result = await bridge.chain(
    "ethereum",
    "call-contract",
    {
      contract: env.vault,
      method: METHODS.deposit,
      args: [
        amountRaw,
        String(env.projectId),
        opts.receiver || "0x0000000000000000000000000000000000000000",
      ],
      ...rpcParam(opts),
    },
    env.network,
  );

  return {
    vault: env.vault,
    amount: amountRaw,
    amountFormatted: opts.amount,
    projectId: env.projectId,
    receiver: opts.receiver || "signer",
    txHash: result.txHash || result.transactionHash || result.result,
  };
}

/**
 * Redeem shares for USDC.
 */
export async function redeem(bridge, opts) {
  const env = resolveEnvironment(opts.environment);

  // Gas is estimated by the protocol with a 1.3x safety multiplier.
  const result = await bridge.chain(
    "ethereum",
    "call-contract",
    {
      contract: env.vault,
      method: METHODS.redeem,
      args: [
        opts.shares,
        String(env.projectId),
        opts.receiver || "0x0000000000000000000000000000000000000000",
      ],
      ...rpcParam(opts),
    },
    env.network,
  );

  return {
    vault: env.vault,
    shares: opts.shares,
    projectId: env.projectId,
    txHash: result.txHash || result.transactionHash || result.result,
  };
}

/**
 * Get vault balance — USDC balance, share balance, and share value.
 */
export async function status(bridge, opts) {
  const env = resolveEnvironment(opts.environment);

  const read = (contract, method, args) =>
    bridge
      .chain(
        "ethereum",
        "read-contract",
        {
          contract,
          method,
          args: args || [],
          ...rpcParam(opts),
        },
        env.network,
      )
      .catch(() => ({ result: "0" }));

  const address = opts.address || "0x0000000000000000000000000000000000000000";

  const [usdcBalance, shares, shareValue] = await Promise.all([
    read(env.usdc, METHODS.balanceOf, [address]),
    read(env.vault, METHODS.balanceOfShares, [address, String(env.projectId)]),
    read(env.vault, METHODS.convertToAssets, ["1000000"]),
  ]);

  return {
    environment: env.name,
    vault: env.vault,
    address,
    usdcBalance: formatUsdc(usdcBalance.result),
    usdcBalanceRaw: usdcBalance.result,
    shares: shares.result,
    shareValuePer1USDC: formatUsdc(shareValue.result),
    projectId: env.projectId,
  };
}
