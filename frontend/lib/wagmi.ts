import { injected } from "@wagmi/injected-only";
import { http, createConfig } from "wagmi";
import { baseSepolia } from "wagmi/chains";

const rpc =
  typeof process !== "undefined" && process.env.NEXT_PUBLIC_QUICKNODE_RPC
    ? process.env.NEXT_PUBLIC_QUICKNODE_RPC
    : "https://sepolia.base.org";

export const wagmiConfig = createConfig({
  chains: [baseSepolia],
  connectors: [injected()],
  transports: {
    [baseSepolia.id]: http(rpc),
  },
  ssr: true,
});
