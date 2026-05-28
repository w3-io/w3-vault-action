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

function pickApyField(entry, keys) {
  for (const k of keys) {
    if (entry && entry[k] != null) return Number(entry[k]);
  }
  return null;
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
    const addr = (v?.address || v?.vault || "").toLowerCase();
    return addr === wantAddr;
  });
  if (!match) {
    throw new W3ActionError(
      "NOT_FOUND",
      `Yield API: vault ${env.vault} not found in response (${list.length} entries)`,
    );
  }

  // Field names vary by API version; try the common ones.
  const apy7d = pickApyField(match, [
    "apy7d",
    "apy_7d",
    "sevenDayApy",
    "weeklyApy",
    "apy",
  ]);
  const apy1d = pickApyField(match, ["apy1d", "apy_1d", "dailyApy"]);
  const apy30d = pickApyField(match, ["apy30d", "apy_30d", "monthlyApy"]);
  const tvl = pickApyField(match, ["tvl", "totalAssets", "assets"]);

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
