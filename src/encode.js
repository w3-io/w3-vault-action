// Hand-rolled ABI encoder for the three calldata shapes this action
// produces. All inputs are static types (uint256/address) so the
// encoding is just selector + 32-byte-padded args.
//
// Selectors are keccak256("functionName(arg_types)")[:4]. Hard-coded
// here so the action has no chain-call or external-encoding dependency.
//
// W3 policy: amounts in approve calls MUST be exact. Never max-uint.
// Enforced upstream by tools/check-no-max-approve.sh in w3-solutions.

import { W3ActionError } from "@w3-io/action-core";

const SELECTORS = {
  // ERC-20
  approve: "095ea7b3", // approve(address,uint256)
  // Yelay smart-vault
  yelayDeposit: "8dbdbe6d", // deposit(uint256,uint256,address) — assets, projectId, receiver
  yelayRedeem: "049104e5", // redeem(uint256,uint256,address) — shares, projectId, receiver
};

function pad32Hex(value) {
  if (typeof value !== "string") {
    throw new W3ActionError(
      "INVALID_INPUT",
      `pad32Hex requires hex string; got ${typeof value}`,
    );
  }
  return value.toLowerCase().replace(/^0x/, "").padStart(64, "0");
}

function pad32BigInt(value) {
  let bi;
  try {
    bi = BigInt(value);
  } catch {
    throw new W3ActionError(
      "INVALID_INPUT",
      `pad32BigInt: cannot convert "${value}" to BigInt`,
    );
  }
  if (bi < 0n) {
    throw new W3ActionError(
      "INVALID_INPUT",
      `pad32BigInt: negative values not supported (got ${bi})`,
    );
  }
  return bi.toString(16).padStart(64, "0");
}

/** Encode `approve(spender, amount)`. */
export function encodeApprove(spender, amount) {
  return "0x" + SELECTORS.approve + pad32Hex(spender) + pad32BigInt(amount);
}

/** Encode Yelay `deposit(assets, projectId, receiver)` for a smart-vault. */
export function encodeYelayDeposit(amount, projectId, receiver) {
  return (
    "0x" +
    SELECTORS.yelayDeposit +
    pad32BigInt(amount) +
    pad32BigInt(projectId) +
    pad32Hex(receiver)
  );
}

/** Encode Yelay `redeem(shares, projectId, receiver)`. */
export function encodeYelayRedeem(shares, projectId, receiver) {
  return (
    "0x" +
    SELECTORS.yelayRedeem +
    pad32BigInt(shares) +
    pad32BigInt(projectId) +
    pad32Hex(receiver)
  );
}

/** Convert USDC amount string ("2000.00") to base units string ("2000000000"). */
export function parseUsdcAmount(amount) {
  if (typeof amount !== "string") {
    throw new W3ActionError(
      "INVALID_INPUT",
      `amount must be a string (e.g. "2000.00"); got ${typeof amount}`,
    );
  }
  const parts = amount.split(".");
  const whole = parts[0] || "0";
  const frac = (parts[1] || "").padEnd(6, "0").slice(0, 6);
  // Strip leading zeros from whole portion but keep at least "0".
  const wholeNorm = whole.replace(/^0+/, "") || "0";
  return wholeNorm + frac;
}
