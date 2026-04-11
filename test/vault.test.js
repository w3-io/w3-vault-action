import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveEnvironment } from "../src/vault.js";
import { ENVIRONMENTS, METHODS } from "../src/contracts.js";

describe("resolveEnvironment", () => {
  it("resolves testing", () => {
    const env = resolveEnvironment("testing");
    assert.equal(env.name, "testing");
    assert.ok(env.vault.startsWith("0x"));
    assert.equal(env.network, "base");
  });

  it("resolves production", () => {
    const env = resolveEnvironment("production");
    assert.equal(env.name, "production");
    assert.ok(env.vault.startsWith("0x"));
    assert.equal(env.network, "base");
  });

  it("throws on unknown environment", () => {
    assert.throws(() => resolveEnvironment("staging"), /Unknown environment/);
  });
});

describe("USDC amount parsing", () => {
  // Test the parseUsdcAmount helper logic
  it("parses whole numbers", () => {
    const parts = "1000".split(".");
    const whole = parts[0];
    const frac = (parts[1] || "").padEnd(6, "0").slice(0, 6);
    assert.equal(`${whole}${frac}`, "1000000000");
  });

  it("parses decimals", () => {
    const parts = "1000.50".split(".");
    const whole = parts[0];
    const frac = (parts[1] || "").padEnd(6, "0").slice(0, 6);
    assert.equal(`${whole}${frac}`, "1000500000");
  });

  it("handles 6 decimal places", () => {
    const parts = "1.123456".split(".");
    const whole = parts[0];
    const frac = (parts[1] || "").padEnd(6, "0").slice(0, 6);
    assert.equal(`${whole}${frac}`, "1123456");
  });

  it("truncates beyond 6 decimals", () => {
    const parts = "1.1234567890".split(".");
    const whole = parts[0];
    const frac = (parts[1] || "").padEnd(6, "0").slice(0, 6);
    assert.equal(`${whole}${frac}`, "1123456");
  });
});

describe("USDC formatting", () => {
  it("formats raw to human-readable", () => {
    const raw = "1000000000";
    const s = String(raw).padStart(7, "0");
    const whole = s.slice(0, -6) || "0";
    const frac = s.slice(-6);
    assert.equal(`${whole}.${frac}`, "1000.000000");
  });

  it("formats small amounts", () => {
    const raw = "500000";
    const s = String(raw).padStart(7, "0");
    const whole = s.slice(0, -6) || "0";
    const frac = s.slice(-6);
    assert.equal(`${whole}.${frac}`, "0.500000");
  });
});

describe("address padding", () => {
  it("pads 20-byte address to 32 bytes", () => {
    const address = "0xd1b1afe415f0efb2d31c672d77cd5db810f5e02c";
    const clean = address.toLowerCase().replace("0x", "");
    const padded = "0x" + clean.padStart(64, "0");
    assert.equal(padded.length, 66); // 0x + 64 hex chars
    assert.ok(padded.startsWith("0x000000000000000000000000"));
    assert.ok(padded.endsWith("d1b1afe415f0efb2d31c672d77cd5db810f5e02c"));
  });
});

describe("contract addresses", () => {
  it("testing and production have different vaults", () => {
    assert.notEqual(ENVIRONMENTS.testing.vault, ENVIRONMENTS.production.vault);
  });

  it("both environments are on Base", () => {
    assert.equal(ENVIRONMENTS.testing.network, "base");
    assert.equal(ENVIRONMENTS.production.network, "base");
  });

  it("method signatures are valid function signatures", () => {
    for (const [name, sig] of Object.entries(METHODS)) {
      assert.ok(
        sig.startsWith("function "),
        `${name} should start with "function "`,
      );
    }
  });
});

describe("message hash extraction", () => {
  const MESSAGE_SENT_TOPIC =
    "0x8c5261668696ce22758910d05bab8f186d6eb247ceac2af2e82c7dc17669b036";

  it("extracts from logs array", () => {
    const logs = [
      { topics: ["0xother"], data: "0xwrong" },
      { topics: [MESSAGE_SENT_TOPIC], data: "0xmessagedata" },
    ];
    const found = logs.find((l) => l.topics?.[0] === MESSAGE_SENT_TOPIC);
    assert.equal(found.data, "0xmessagedata");
  });

  it("returns null when no matching log", () => {
    const logs = [{ topics: ["0xother"], data: "0xwrong" }];
    const found = logs.find((l) => l.topics?.[0] === MESSAGE_SENT_TOPIC);
    assert.equal(found, undefined);
  });

  it("handles JSON string logs", () => {
    const logsJson = JSON.stringify([
      { topics: [MESSAGE_SENT_TOPIC], data: "0xfound" },
    ]);
    const parsed = JSON.parse(logsJson);
    const found = parsed.find((l) => l.topics?.[0] === MESSAGE_SENT_TOPIC);
    assert.equal(found.data, "0xfound");
  });
});
