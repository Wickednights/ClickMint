/**
 * Build shim: wagmi connectors barrel pulls `porto` and optional `porto` package. Unused in ClickMint.
 */
import { createConnector } from "@wagmi/core";

function stubChainId(): number {
  return process.env.NEXT_PUBLIC_CHAIN_ID?.trim() === "8453" ? 8453 : 84532;
}

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
      return stubChainId();
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
