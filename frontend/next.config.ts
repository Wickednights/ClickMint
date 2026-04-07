import type { NextConfig } from "next";
import path from "path";

const wagmiInjected = path.join(process.cwd(), "node_modules/@wagmi/core/dist/esm/connectors/injected.js");

const nextConfig: NextConfig = {
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      "@wagmi/injected-only": wagmiInjected,
    };
    return config;
  },
};

export default nextConfig;
