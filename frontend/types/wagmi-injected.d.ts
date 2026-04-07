declare module "@wagmi/injected-only" {
  import type { CreateConnectorFn } from "wagmi";
  export function injected(parameters?: Record<string, unknown>): CreateConnectorFn;
}
