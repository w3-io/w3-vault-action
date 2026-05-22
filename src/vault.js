// Direct Yelay vault operations — deposit USDC, redeem shares, check balance.
// No operator contract, no roles, no TradFi. Just ERC20 approve + vault.deposit.
//
// Two execution modes:
//   - `deposit` / `redeem` / `status` — sign & submit via the W3 bridge
//   - `build-deposit` / `build-approve` — return unsigned tx intent for
//     external signers (ForDefi, Safe, Fireblocks, etc.) to submit
//
// The build-* variants do not touch the bridge or signer. They are pure
// calldata producers: take amount + environment + receiver, return the
// `{ chain, to, value, data }` payload a submitter action can consume.

import { W3ActionError } from "@w3-io/action-core";
import { ENVIRONMENTS, METHODS } from "./contracts.js";
import {
  encodeApprove,
  encodeYelayDeposit,
  parseUsdcAmount as parseUsdcAmountForEncode,
} from "./encode.js";

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
 * Build an unsigned deposit transaction intent for the configured
 * environment's Yelay vault. The returned payload is what an external
 * signer (ForDefi, Safe, etc.) consumes — never broadcast by this
 * action.
 *
 * Caller's responsibility: ensure the resolved `receiver` (or the
 * signer if `receiver` is omitted) has at least `amount` USDC and an
 * existing approval to the vault for `amount` USDC. The companion
 * `buildApprove` command produces the matching exact-amount approve.
 */
export function buildDeposit(opts) {
  if (!opts.amount) {
    throw new W3ActionError(
      "MISSING_INPUT",
      "amount is required (e.g. '2000.00')",
    );
  }
  if (!opts.receiver) {
    throw new W3ActionError(
      "MISSING_INPUT",
      "receiver is required for build-deposit (the address that will own the vault shares)",
    );
  }
  const env = resolveEnvironment(opts.environment);
  const amountRaw = parseUsdcAmountForEncode(opts.amount);
  const hexData = encodeYelayDeposit(amountRaw, env.projectId, opts.receiver);

  return {
    intent: "yelay-deposit",
    chain: env.network,
    chainId: env.chainId,
    to: env.vault,
    value: "0",
    data: { type: "hex", hex_data: hexData },
    selector: hexData.slice(0, 10),
    vault: env.vault,
    projectId: env.projectId,
    underlying: env.usdc,
    amount: amountRaw,
    amountFormatted: opts.amount,
    receiver: opts.receiver,
    environment: env.name,
  };
}

/**
 * Build an unsigned exact-amount approve transaction intent. The
 * spender defaults to the configured environment's vault address. The
 * amount MUST be exact — this builder will never produce a max-uint
 * approve. Caller may pass an explicit `spender` to approve any other
 * contract (useful when approving a router or a different vault).
 */
export function buildApprove(opts) {
  if (!opts.amount) {
    throw new W3ActionError(
      "MISSING_INPUT",
      "amount is required (exact USDC amount, e.g. '2000.00'; max-uint approvals are disallowed)",
    );
  }
  const env = resolveEnvironment(opts.environment);
  const spender = opts.spender || env.vault;
  if (!/^0x[a-fA-F0-9]{40}$/.test(spender)) {
    throw new W3ActionError(
      "INVALID_INPUT",
      `spender must be a 20-byte hex address; got "${spender}"`,
    );
  }
  const amountRaw = parseUsdcAmountForEncode(opts.amount);
  const hexData = encodeApprove(spender, amountRaw);

  return {
    intent: "erc20-approve",
    chain: env.network,
    chainId: env.chainId,
    to: env.usdc,
    value: "0",
    data: { type: "hex", hex_data: hexData },
    selector: hexData.slice(0, 10),
    token: env.usdc,
    spender,
    amount: amountRaw,
    amountFormatted: opts.amount,
    environment: env.name,
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
    chain: env.network,
    chainId: env.chainId,
    vault: env.vault,
    address,
    usdcBalance: formatUsdc(usdcBalance.result),
    usdcBalanceRaw: usdcBalance.result,
    shares: shares.result,
    shareValuePer1USDC: formatUsdc(shareValue.result),
    projectId: env.projectId,
  };
}
