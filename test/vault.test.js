import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveEnvironment, deposit, redeem, status } from "../src/vault.js";
import { ENVIRONMENTS, METHODS } from "../src/contracts.js";

// --- helpers ---

/** Build a mock bridge that records calls and returns canned results. */
function mockBridge(result = {}) {
  const calls = [];
  return {
    calls,
    chain(...args) {
      calls.push(args);
      return Promise.resolve(result);
    },
  };
}

/** Build a mock bridge whose chain() rejects. */
function failingBridge(error) {
  return {
    calls: [],
    chain() {
      return Promise.reject(error);
    },
  };
}

// --- resolveEnvironment ---

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

// --- deposit ---

describe("deposit", () => {
  it("approves USDC then deposits into vault", async () => {
    const bridge = mockBridge({ txHash: "0xabc" });
    const result = await deposit(bridge, {
      environment: "testing",
      amount: "100.50",
    });

    // Two bridge calls: approve + deposit
    assert.equal(bridge.calls.length, 2);

    // First call is approve
    const [, , approvePayload] = bridge.calls[0];
    assert.equal(approvePayload.contract, ENVIRONMENTS.testing.usdc);
    assert.equal(approvePayload.method, METHODS.approve);
    assert.equal(approvePayload.args[0], ENVIRONMENTS.testing.vault);
    assert.equal(approvePayload.args[1], "100500000"); // 100.50 * 1e6

    // Second call is deposit
    const [, , depositPayload] = bridge.calls[1];
    assert.equal(depositPayload.contract, ENVIRONMENTS.testing.vault);
    assert.equal(depositPayload.method, METHODS.deposit);
    assert.equal(depositPayload.args[0], "100500000");
    assert.equal(
      depositPayload.args[1],
      String(ENVIRONMENTS.testing.projectId),
    );

    // Result shape
    assert.equal(result.vault, ENVIRONMENTS.testing.vault);
    assert.equal(result.amount, "100500000");
    assert.equal(result.amountFormatted, "100.50");
    assert.equal(result.txHash, "0xabc");
    assert.equal(result.receiver, "signer"); // default when none provided
  });

  it("uses custom receiver when provided", async () => {
    const bridge = mockBridge({ txHash: "0xdef" });
    const result = await deposit(bridge, {
      environment: "production",
      amount: "1",
      receiver: "0xRECEIVER",
    });

    const [, , depositPayload] = bridge.calls[1];
    assert.equal(depositPayload.args[2], "0xRECEIVER");
    assert.equal(result.receiver, "0xRECEIVER");
  });

  it("passes rpcUrl when provided", async () => {
    const bridge = mockBridge({ txHash: "0x1" });
    await deposit(bridge, {
      environment: "testing",
      amount: "1",
      rpcUrl: "https://custom-rpc.example.com",
    });

    for (const call of bridge.calls) {
      assert.equal(call[2].rpcUrl, "https://custom-rpc.example.com");
    }
  });

  it("omits rpcUrl when not provided", async () => {
    const bridge = mockBridge({ txHash: "0x1" });
    await deposit(bridge, {
      environment: "testing",
      amount: "1",
    });

    for (const call of bridge.calls) {
      assert.equal(call[2].rpcUrl, undefined);
    }
  });

  it("handles transactionHash in result", async () => {
    const bridge = mockBridge({ transactionHash: "0xtxhash" });
    const result = await deposit(bridge, {
      environment: "testing",
      amount: "5",
    });
    assert.equal(result.txHash, "0xtxhash");
  });

  it("falls back to result field for txHash", async () => {
    const bridge = mockBridge({ result: "0xresult" });
    const result = await deposit(bridge, {
      environment: "testing",
      amount: "5",
    });
    assert.equal(result.txHash, "0xresult");
  });

  it("parses whole-number amounts correctly", async () => {
    const bridge = mockBridge({ txHash: "0x1" });
    const result = await deposit(bridge, {
      environment: "testing",
      amount: "1000",
    });
    assert.equal(result.amount, "1000000000");
  });

  it("truncates past 6 decimal places", async () => {
    const bridge = mockBridge({ txHash: "0x1" });
    const result = await deposit(bridge, {
      environment: "testing",
      amount: "1.1234567890",
    });
    assert.equal(result.amount, "1123456");
  });

  it("throws on unknown environment", async () => {
    const bridge = mockBridge({});
    await assert.rejects(
      () => deposit(bridge, { environment: "invalid", amount: "1" }),
      /Unknown environment/,
    );
  });

  it("propagates bridge errors", async () => {
    const bridge = failingBridge(new Error("rpc timeout"));
    await assert.rejects(
      () =>
        deposit(bridge, {
          environment: "testing",
          amount: "1",
        }),
      /rpc timeout/,
    );
  });
});

// --- redeem ---

describe("redeem", () => {
  it("calls vault redeem with shares", async () => {
    const bridge = mockBridge({ txHash: "0xredeem" });
    const result = await redeem(bridge, {
      environment: "testing",
      shares: "500000",
    });

    assert.equal(bridge.calls.length, 1);

    const [chain, action, payload, network] = bridge.calls[0];
    assert.equal(chain, "ethereum");
    assert.equal(action, "call-contract");
    assert.equal(payload.contract, ENVIRONMENTS.testing.vault);
    assert.equal(payload.method, METHODS.redeem);
    assert.equal(payload.args[0], "500000");
    assert.equal(payload.args[1], String(ENVIRONMENTS.testing.projectId));
    assert.equal(network, ENVIRONMENTS.testing.network);

    assert.equal(result.vault, ENVIRONMENTS.testing.vault);
    assert.equal(result.shares, "500000");
    assert.equal(result.txHash, "0xredeem");
  });

  it("uses zero-address receiver by default", async () => {
    const bridge = mockBridge({ txHash: "0x1" });
    await redeem(bridge, {
      environment: "testing",
      shares: "100",
    });

    const [, , payload] = bridge.calls[0];
    assert.equal(payload.args[2], "0x0000000000000000000000000000000000000000");
  });

  it("uses custom receiver when provided", async () => {
    const bridge = mockBridge({ txHash: "0x1" });
    await redeem(bridge, {
      environment: "testing",
      shares: "100",
      receiver: "0xCUSTOM",
    });

    const [, , payload] = bridge.calls[0];
    assert.equal(payload.args[2], "0xCUSTOM");
  });

  it("passes rpcUrl when provided", async () => {
    const bridge = mockBridge({ txHash: "0x1" });
    await redeem(bridge, {
      environment: "testing",
      shares: "100",
      rpcUrl: "https://rpc.example.com",
    });

    assert.equal(bridge.calls[0][2].rpcUrl, "https://rpc.example.com");
  });

  it("omits rpcUrl when not provided", async () => {
    const bridge = mockBridge({ txHash: "0x1" });
    await redeem(bridge, {
      environment: "testing",
      shares: "100",
    });

    assert.equal(bridge.calls[0][2].rpcUrl, undefined);
  });

  it("handles transactionHash in result", async () => {
    const bridge = mockBridge({ transactionHash: "0xalt" });
    const result = await redeem(bridge, {
      environment: "testing",
      shares: "100",
    });
    assert.equal(result.txHash, "0xalt");
  });

  it("falls back to result field for txHash", async () => {
    const bridge = mockBridge({ result: "0xfallback" });
    const result = await redeem(bridge, {
      environment: "testing",
      shares: "100",
    });
    assert.equal(result.txHash, "0xfallback");
  });

  it("works with production environment", async () => {
    const bridge = mockBridge({ txHash: "0xprod" });
    const result = await redeem(bridge, {
      environment: "production",
      shares: "999",
    });

    assert.equal(result.vault, ENVIRONMENTS.production.vault);
    assert.equal(result.projectId, ENVIRONMENTS.production.projectId);
  });

  it("throws on unknown environment", async () => {
    const bridge = mockBridge({});
    await assert.rejects(
      () => redeem(bridge, { environment: "bad", shares: "1" }),
      /Unknown environment/,
    );
  });

  it("propagates bridge errors", async () => {
    const bridge = failingBridge(new Error("network down"));
    await assert.rejects(
      () =>
        redeem(bridge, {
          environment: "testing",
          shares: "1",
        }),
      /network down/,
    );
  });
});

// --- status ---

describe("status", () => {
  it("reads USDC balance, shares, and share value", async () => {
    let callIndex = 0;
    const results = [
      { result: "1000000" }, // usdcBalance = 1.000000
      { result: "500000" }, // shares
      { result: "1050000" }, // shareValue (1.05 USDC per share)
    ];
    const calls = [];
    const bridge = {
      calls,
      chain(...args) {
        calls.push(args);
        return Promise.resolve(results[callIndex++]);
      },
    };

    const result = await status(bridge, {
      environment: "testing",
      address: "0xADDRESS",
    });

    // Three reads: balanceOf USDC, balanceOf shares, convertToAssets
    assert.equal(calls.length, 3);

    assert.equal(result.environment, "testing");
    assert.equal(result.vault, ENVIRONMENTS.testing.vault);
    assert.equal(result.address, "0xADDRESS");
    assert.equal(result.usdcBalance, "1.000000");
    assert.equal(result.usdcBalanceRaw, "1000000");
    assert.equal(result.shares, "500000");
    assert.equal(result.shareValuePer1USDC, "1.050000");
    assert.equal(result.projectId, ENVIRONMENTS.testing.projectId);
  });

  it("uses zero-address when no address provided", async () => {
    const bridge = mockBridge({ result: "0" });
    const result = await status(bridge, {
      environment: "testing",
    });

    assert.equal(result.address, "0x0000000000000000000000000000000000000000");
  });

  it("reads correct contracts and methods", async () => {
    const calls = [];
    const bridge = {
      calls,
      chain(...args) {
        calls.push(args);
        return Promise.resolve({ result: "0" });
      },
    };

    await status(bridge, {
      environment: "testing",
      address: "0xTEST",
    });

    // balanceOf USDC
    assert.equal(calls[0][2].contract, ENVIRONMENTS.testing.usdc);
    assert.equal(calls[0][2].method, METHODS.balanceOf);
    assert.deepEqual(calls[0][2].args, ["0xTEST"]);

    // balanceOf shares
    assert.equal(calls[1][2].contract, ENVIRONMENTS.testing.vault);
    assert.equal(calls[1][2].method, METHODS.balanceOfShares);
    assert.deepEqual(calls[1][2].args, [
      "0xTEST",
      String(ENVIRONMENTS.testing.projectId),
    ]);

    // convertToAssets
    assert.equal(calls[2][2].contract, ENVIRONMENTS.testing.vault);
    assert.equal(calls[2][2].method, METHODS.convertToAssets);
    assert.deepEqual(calls[2][2].args, ["1000000"]);
  });

  it("passes rpcUrl to all reads when provided", async () => {
    const calls = [];
    const bridge = {
      calls,
      chain(...args) {
        calls.push(args);
        return Promise.resolve({ result: "0" });
      },
    };

    await status(bridge, {
      environment: "testing",
      address: "0xTEST",
      rpcUrl: "https://rpc.example.com",
    });

    for (const call of calls) {
      assert.equal(call[2].rpcUrl, "https://rpc.example.com");
    }
  });

  it("omits rpcUrl when not provided", async () => {
    const calls = [];
    const bridge = {
      calls,
      chain(...args) {
        calls.push(args);
        return Promise.resolve({ result: "0" });
      },
    };

    await status(bridge, {
      environment: "testing",
      address: "0xTEST",
    });

    for (const call of calls) {
      assert.equal(call[2].rpcUrl, undefined);
    }
  });

  it("gracefully handles read failures with default 0", async () => {
    const bridge = {
      calls: [],
      chain() {
        return Promise.reject(new Error("read failed"));
      },
    };

    const result = await status(bridge, {
      environment: "testing",
      address: "0xTEST",
    });

    // All values fall back to "0" via the .catch
    assert.equal(result.usdcBalance, "0.000000");
    assert.equal(result.usdcBalanceRaw, "0");
    assert.equal(result.shares, "0");
    assert.equal(result.shareValuePer1USDC, "0.000000");
  });

  it("works with production environment", async () => {
    const bridge = mockBridge({ result: "0" });
    const result = await status(bridge, {
      environment: "production",
      address: "0xTEST",
    });

    assert.equal(result.environment, "production");
    assert.equal(result.vault, ENVIRONMENTS.production.vault);
  });

  it("throws on unknown environment", async () => {
    const bridge = mockBridge({});
    await assert.rejects(
      () => status(bridge, { environment: "bad", address: "0x1" }),
      /Unknown environment/,
    );
  });

  it("formats large balances correctly", async () => {
    let callIndex = 0;
    const results = [
      { result: "999999999999" }, // ~999999.999999 USDC
      { result: "123" },
      { result: "1000000" },
    ];
    const bridge = {
      calls: [],
      chain() {
        return Promise.resolve(results[callIndex++]);
      },
    };

    const result = await status(bridge, {
      environment: "testing",
      address: "0xTEST",
    });

    assert.equal(result.usdcBalance, "999999.999999");
  });
});

// --- contract addresses ---

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
