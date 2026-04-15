/**
 * Build shim: `@wagmi/connectors` re-exports `baseAccount`, which pulls `@base-org/account` / CDP / zod.
 * ClickMint does not use Base Account; this stub satisfies the export without those dependencies.
 */
import { createConnector } from "@wagmi/core";

function stubChainId(): number {
  return process.env.NEXT_PUBLIC_CHAIN_ID?.trim() === "8453" ? 8453 : 84532;
}

export function baseAccount(): ReturnType<typeof createConnector> {
  return createConnector(() => ({
    id: "baseAccount",
    name: "Base Account",
    type: "baseAccount",
    async connect() {
      throw new Error("Base Account connector is not enabled in ClickMint");
    },
    async disconnect() {},
    async getAccounts() {
      return [];
    },
    async getChainId() {
      return stubChainId();
    },
    async getProvider() {
      throw new Error("Base Account connector is not enabled in ClickMint");
    },
    async isAuthorized() {
      return false;
    },
    onAccountsChanged() {},
    onChainChanged() {},
    onDisconnect() {},
  }));
}
