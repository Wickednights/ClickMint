import type { NextConfig } from "next";
import path from "path";

const wagmiInjected = path.join(process.cwd(), "node_modules/@wagmi/core/dist/esm/connectors/injected.js");
const baseAccountStub = path.join(process.cwd(), "lib/wagmi-base-account-stub.ts");
const portoStub = path.join(process.cwd(), "lib/wagmi-porto-stub.ts");

const nextConfig: NextConfig = {
  webpack: (config, { webpack: webpackPkg }) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      "@wagmi/injected-only": wagmiInjected,
    };
    config.plugins.push(
      new webpackPkg.NormalModuleReplacementPlugin(
        /@wagmi[\\/]connectors[\\/]dist[\\/]esm[\\/]baseAccount\.js$/,
        baseAccountStub
      ),
      new webpackPkg.NormalModuleReplacementPlugin(
        /@wagmi[\\/]connectors[\\/]dist[\\/]esm[\\/]porto\.js$/,
        portoStub
      )
    );
    return config;
  },
};

export default nextConfig;
