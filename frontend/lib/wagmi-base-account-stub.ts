/**
 * Build shim: `@wagmi/connectors` re-exports `baseAccount`, which pulls `@base-org/account` / CDP / zod.
 * ClickMint does not use Base Account; this stub satisfies the export without those dependencies.
 */
import { createConnector } from "@wagmi/core";

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
      return 84532;
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
