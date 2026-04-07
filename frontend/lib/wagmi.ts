import { coinbaseWallet, injected, metaMask, walletConnect } from "@wagmi/connectors";
import { http, createConfig } from "wagmi";
import { baseSepolia } from "wagmi/chains";

const rpc =
  typeof process !== "undefined" && process.env.NEXT_PUBLIC_QUICKNODE_RPC
    ? process.env.NEXT_PUBLIC_QUICKNODE_RPC
    : "https://sepolia.base.org";

const walletConnectProjectId =
  (typeof process !== "undefined" && process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID?.trim()) || "";

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
            description: "Base Sepolia — credits, CLICK, hourly POT",
            url:
              typeof window !== "undefined"
                ? window.location.origin
                : "https://vercel.app",
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
  chains: [baseSepolia],
  connectors,
  transports: {
    [baseSepolia.id]: http(rpc),
  },
  ssr: true,
});
