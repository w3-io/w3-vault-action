// Fetch live APY for the W3 Vault from the W3 yield service.
//
// Endpoint: https://yield.w3.io/api/vaults
// Body: { clientAddress: <0x...> }
// Returns an array of per-vault entries; we filter to the configured
// environment's vault address and return the canonical headline 7d
// APY (matches what payments.w3.io shows).

import { W3ActionError } from "@w3-io/action-core";
import { resolveEnvironment } from "./vault.js";

const YIELD_API_DEFAULT = "https://yield.w3.io/api/vaults";
// `clientAddress` is required by the upstream; we use the zero
// address for unauthenticated reads since the response shape we
// care about (apy7d/apy1d/tvl) is public.
const ZERO_CLIENT = "0x0000000000000000000000000000000000000000";

// yield.w3.io returns APY as a percent number (e.g. 11 for 11%);
// normalize to a decimal (0.11) so the display filter
// `format_pct_decimal` can render it consistently with other
// percent-shaped values.
function asDecimal(pct) {
  if (pct == null) return null;
  const n = Number(pct);
  if (!Number.isFinite(n)) return null;
  return n / 100;
}

export async function getApy(opts) {
  const env = resolveEnvironment(opts.environment);
  const endpoint = opts.apiBase || YIELD_API_DEFAULT;

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ clientAddress: opts.clientAddress || ZERO_CLIENT }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new W3ActionError(
      "HTTP_ERROR",
      `Yield API ${res.status}: ${body.slice(0, 200)}`,
    );
  }
  const data = await res.json();
  const list = Array.isArray(data) ? data : (data?.vaults ?? data?.data ?? []);
  if (!Array.isArray(list)) {
    throw new W3ActionError(
      "PARSE_ERROR",
      "Yield API: response was not an array of vaults",
    );
  }

  const wantAddr = env.vault.toLowerCase();
  const match = list.find((v) => {
    const addr = (v?.vaultAddress || v?.address || v?.vault || "")
      .toString()
      .toLowerCase();
    return addr === wantAddr;
  });
  if (!match) {
    throw new W3ActionError(
      "NOT_FOUND",
      `Yield API: vault ${env.vault} not found in response (${list.length} entries)`,
    );
  }

  const apy = match.apy || {};
  const apy7d = asDecimal(apy["7d"] ?? match.apy7d);
  const apy1d = asDecimal(apy["24h"] ?? apy["1d"] ?? match.apy1d);
  const apy30d = asDecimal(apy["30d"] ?? match.apy30d);
  const tvl = match.tvl ?? match.totalAssets ?? null;

  return {
    vault: env.vault,
    chain: env.network,
    chainId: env.chainId,
    environment: env.name,
    apy7d,
    apy1d,
    apy30d,
    tvl,
    raw: match,
  };
}
