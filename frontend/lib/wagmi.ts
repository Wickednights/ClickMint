import { coinbaseWallet, injected, metaMask, walletConnect } from "@wagmi/connectors";
import { http, createConfig } from "wagmi";
import { getSiteUrl } from "@/lib/site-url";
import { clickmintChain, clickmintChainId, isClickmintBaseMainnet } from "@/lib/clickmint-chain";

const chain = clickmintChain();

const rpc =
  typeof process !== "undefined"
    ? isClickmintBaseMainnet()
      ? process.env.NEXT_PUBLIC_BASE_MAINNET_RPC?.trim() || "https://mainnet.base.org"
      : process.env.NEXT_PUBLIC_QUICKNODE_RPC?.trim() || "https://sepolia.base.org"
    : "https://sepolia.base.org";

const walletConnectProjectId =
  (typeof process !== "undefined" && process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID?.trim()) || "";

const wcDescription = isClickmintBaseMainnet()
  ? "Base — credits, CLICK, hourly POT"
  : "Base Sepolia — credits, tCLICK, hourly POT (test)";

const connectors = [
  metaMask(),
  coinbaseWallet({
    appName: "ClickMint",
  }),
  ...(walletConnectProjectId
    ? [
        walletConnect({
          projectId: walletConnectProjectId,
          metadata: {
            name: "ClickMint",
            description: wcDescription,
            url: typeof window !== "undefined" ? window.location.origin : getSiteUrl(),
            icons: [],
          },
          showQrModal: true,
        }),
      ]
    : []),
  /** Browser wallet (Zerion, Rabby, Brave, etc.) */
  injected(),
];

export const wagmiConfig = createConfig({
  chains: [chain],
  connectors,
  transports: {
    [clickmintChainId()]: http(rpc),
  },
  ssr: true,
});
