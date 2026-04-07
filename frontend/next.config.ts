import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      "@wagmi/injected-only": path.join(
        process.cwd(),
        "node_modules/@wagmi/core/dist/esm/connectors/injected.js"
      ),
    };
    return config;
  },
};

export default nextConfig;
