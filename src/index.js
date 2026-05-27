import {
  createCommandRouter,
  setJsonOutput,
  handleError,
} from "@w3-io/action-core";
import { bridge } from "@w3-io/action-core";
import * as core from "@actions/core";
import {
  deposit,
  redeem,
  status,
  buildDeposit,
  buildApprove,
} from "./vault.js";

function getRpcUrl() {
  return core.getInput("rpc-url") || undefined;
}

const router = createCommandRouter({
  deposit: async () => {
    const amount = core.getInput("amount", { required: true });
    const environment = core.getInput("environment") || "testing";
    const receiver = core.getInput("receiver") || undefined;
    const result = await deposit(bridge, {
      amount,
      environment,
      receiver,
      rpcUrl: getRpcUrl(),
    });
    setJsonOutput("result", result);
    core.summary
      .addHeading("W3 Vault: deposit", 3)
      .addRaw(`**Amount:** ${result.amountFormatted} USDC\n\n`)
      .addRaw(`**Vault:** \`${result.vault}\`\n\n`)
      .addRaw(`**TX:** \`${result.txHash}\`\n\n`)
      .write();
  },

  redeem: async () => {
    const shares = core.getInput("shares", { required: true });
    const environment = core.getInput("environment") || "testing";
    const receiver = core.getInput("receiver") || undefined;
    const result = await redeem(bridge, {
      shares,
      environment,
      receiver,
      rpcUrl: getRpcUrl(),
    });
    setJsonOutput("result", result);
    core.summary
      .addHeading("W3 Vault: redeem", 3)
      .addCodeBlock(JSON.stringify(result, null, 2), "json")
      .write();
  },

  status: async () => {
    const environment = core.getInput("environment") || "testing";
    const address = core.getInput("address") || undefined;
    const result = await status(bridge, {
      environment,
      address,
      rpcUrl: getRpcUrl(),
    });
    setJsonOutput("result", result);
    core.summary
      .addHeading("W3 Vault: status", 3)
      .addRaw(`**USDC Balance:** ${result.usdcBalance}\n\n`)
      .addRaw(`**Shares:** ${result.shares}\n\n`)
      .write();
  },

  // ── Intent builders (no bridge call, no signing, no broadcast) ──
  //
  // Return structured tx payloads for external signers (ForDefi, Safe,
  // Fireblocks, etc.) to consume. The companion submitter action does
  // the actual signing.

  "build-deposit": async () => {
    const amount = core.getInput("amount", { required: true });
    const environment = core.getInput("environment") || "testing";
    const receiver = core.getInput("receiver", { required: true });
    const result = buildDeposit({ amount, environment, receiver });
    setJsonOutput("result", result);
    // Flat per-field outputs for workflow consumption — see comment
    // on the matching commands in w3-opentrade-action.
    core.setOutput("to", result.to);
    core.setOutput("chain", result.chain);
    core.setOutput("chain_id", String(result.chainId));
    core.setOutput("data_hex", result.data.hex_data);
    core.setOutput("amount", result.amount);
    core.setOutput("amount_formatted", result.amountFormatted);
    core.setOutput("vault", result.vault);
    core.setOutput("receiver", result.receiver);
    core.summary
      .addHeading("W3 Vault: build-deposit (intent only)", 3)
      .addRaw(`**Amount:** ${result.amountFormatted} USDC\n\n`)
      .addRaw(`**Vault:** \`${result.vault}\` (${result.chain})\n\n`)
      .addRaw(`**Project ID:** ${result.projectId}\n\n`)
      .addRaw(`**Receiver:** \`${result.receiver}\`\n\n`)
      .addRaw(`**Calldata:** \`${result.data.hex_data}\`\n\n`)
      .addRaw(
        `_No transaction was signed or submitted. Pass this payload to a signer action._\n`,
      )
      .write();
  },

  "build-approve": async () => {
    const amount = core.getInput("amount", { required: true });
    const environment = core.getInput("environment") || "testing";
    const spender = core.getInput("spender") || undefined;
    const result = buildApprove({ amount, environment, spender });
    setJsonOutput("result", result);
    // Flat per-field outputs for workflow consumption.
    core.setOutput("to", result.to);
    core.setOutput("chain", result.chain);
    core.setOutput("chain_id", String(result.chainId));
    core.setOutput("data_hex", result.data.hex_data);
    core.setOutput("amount", result.amount);
    core.setOutput("amount_formatted", result.amountFormatted);
    core.setOutput("spender", result.spender);
    core.summary
      .addHeading("W3 Vault: build-approve (intent only)", 3)
      .addRaw(`**Amount:** ${result.amountFormatted} USDC (exact)\n\n`)
      .addRaw(`**Token:** \`${result.token}\`\n\n`)
      .addRaw(`**Spender:** \`${result.spender}\`\n\n`)
      .addRaw(`**Calldata:** \`${result.data.hex_data}\`\n\n`)
      .addRaw(`_Max-uint approvals are not supported by this builder._\n`)
      .write();
  },
});

// Suppress noisy unhandled rejection warnings; the wrapper below
// catches via handleError, which calls core.setFailed.
process.on("unhandledRejection", () => {});
(async () => {
  try {
    await router();
  } catch (error) {
    handleError(error);
  }
})();
