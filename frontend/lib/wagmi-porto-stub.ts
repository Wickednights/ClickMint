/**
 * Build shim: wagmi connectors barrel pulls `porto` and optional `porto` package. Unused in ClickMint.
 */
import { createConnector } from "@wagmi/core";

export function porto() {
  return createConnector(() => ({
    id: "porto",
    name: "Porto",
    type: "porto",
    async connect() {
      throw new Error("Porto connector is not enabled in ClickMint");
    },
    async disconnect() {},
    async getAccounts() {
      return [];
    },
    async getChainId() {
      return 84532;
    },
    async getProvider() {
      throw new Error("Porto connector is not enabled in ClickMint");
    },
    async isAuthorized() {
      return false;
    },
    onAccountsChanged() {},
    onChainChanged() {},
    onDisconnect() {},
  }));
}
