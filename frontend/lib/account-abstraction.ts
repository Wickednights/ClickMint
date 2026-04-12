/**
 * Gasless ERC-4337 flow: ZeroDev Kernel + permission session key + Pimlico bundler/paymaster.
 * (`@pimlico/sdk` does not exist on npm; Pimlico is used via RPC + `setPimlicoAsProvider`.)
 */
import {
  createKernelAccount,
  createKernelAccountClient,
  setPimlicoAsProvider,
} from "@zerodev/sdk";
import type { Signer } from "@zerodev/sdk/types";
import { signerToEcdsaValidator } from "@zerodev/ecdsa-validator";
import {
  deserializePermissionAccount,
  serializePermissionAccount,
  toPermissionValidator,
} from "@zerodev/permissions";
import { CallPolicyVersion, toCallPolicy, toTimestampPolicy } from "@zerodev/permissions/policies";
import { toECDSASigner } from "@zerodev/permissions/signers";
import {
  createPublicClient,
  http,
  type Address,
  type Client,
  type Hex,
  encodeFunctionData,
  hexToBigInt,
  type WalletClient,
} from "viem";
import { entryPoint07Address } from "viem/account-abstraction";
import { generatePrivateKey, privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { baseSepolia } from "wagmi/chains";
import { clickMintGameAbi } from "@/lib/abi";

export const KERNEL_VERSION = "0.3.3" as const;

const SESSION_SECONDS = 30 * 60;

export function getPublicRpcUrl(): string {
  return (
    (typeof process !== "undefined" && process.env.NEXT_PUBLIC_QUICKNODE_RPC?.trim()) ||
    "https://sepolia.base.org"
  );
}

export function getPimlicoBundlerUrl(): string {
  const key =
    (typeof process !== "undefined" && process.env.NEXT_PUBLIC_PIMLICO_API_KEY?.trim()) || "";
  if (!key) throw new Error("NEXT_PUBLIC_PIMLICO_API_KEY is not set");
  const raw = `https://api.pimlico.io/v2/${baseSepolia.id}/rpc?apikey=${key}`;
  return setPimlicoAsProvider(raw);
}

type PimlicoGasPriceTier = { maxFeePerGas: Hex; maxPriorityFeePerGas: Hex };

type PimlicoGasPriceResult = {
  slow: PimlicoGasPriceTier;
  standard: PimlicoGasPriceTier;
  fast: PimlicoGasPriceTier;
};

/**
 * Pimlico bundlers use `pimlico_getUserOperationGasPrice`. `@zerodev/sdk`'s default
 * `estimateFeesPerGas` calls `zd_getUserOperationGasPrice`, which Pimlico does not support.
 */
export async function pimlicoEstimateFeesPerGas(parameters: {
  bundlerClient: Client;
}): Promise<{ maxFeePerGas: bigint; maxPriorityFeePerGas: bigint }> {
  const { bundlerClient } = parameters;
  const result = (await bundlerClient.request({
    method: "pimlico_getUserOperationGasPrice",
    params: [],
  } as Parameters<Client["request"]>[0])) as PimlicoGasPriceResult;
  const tier = result.standard ?? result.fast ?? result.slow;
  return {
    maxFeePerGas: hexToBigInt(tier.maxFeePerGas),
    maxPriorityFeePerGas: hexToBigInt(tier.maxPriorityFeePerGas),
  };
}

/** Optional — set if your Pimlico dashboard requires a sponsorship policy for `pm_getPaymasterData`. */
export function getPimlicoPaymasterContext():
  | { sponsorshipPolicyId: string }
  | undefined {
  const id =
    (typeof process !== "undefined" &&
      process.env.NEXT_PUBLIC_PIMLICO_SPONSORSHIP_POLICY_ID?.trim()) ||
    "";
  return id ? { sponsorshipPolicyId: id } : undefined;
}

export function isPimlicoConfigured(): boolean {
  return Boolean(
    typeof process !== "undefined" && process.env.NEXT_PUBLIC_PIMLICO_API_KEY?.trim()
  );
}

export function createAaPublicClient() {
  return createPublicClient({
    chain: baseSepolia,
    transport: http(getPublicRpcUrl()),
  });
}

export type GaslessKernelContext = {
  walletClient: WalletClient;
  gameAddress: Address;
};

export type BuiltMasterKernel = {
  sessionSigner: PrivateKeyAccount;
  kernelAccount: Awaited<ReturnType<typeof createKernelAccount>>;
  masterClient: ReturnType<typeof createKernelAccountClient>;
  serializedPermission: string;
  smartAccountAddress: Address;
  sessionClient: ReturnType<typeof createKernelAccountClient>;
};

/**
 * One owner-signed UserOp: deploy (if needed) + install session-key validator.
 * Then builds a session client that signs with the ephemeral key (no wallet popups).
 */
export async function enableGaslessSession(ctx: GaslessKernelContext): Promise<BuiltMasterKernel> {
  const { walletClient, gameAddress } = ctx;
  if (!walletClient.account) throw new Error("Wallet client has no account — connect wallet first");
  const publicClient = createAaPublicClient();
  const entryPoint = { address: entryPoint07Address, version: "0.7" as const };
  const bundlerTransport = http(getPimlicoBundlerUrl());

  const ecdsaValidator = await signerToEcdsaValidator(publicClient, {
    signer: walletClient as unknown as Signer,
    entryPoint,
    kernelVersion: KERNEL_VERSION,
  });

  const sessionPk = generatePrivateKey();
  const sessionSigner = privateKeyToAccount(sessionPk);
  const sessionModular = await toECDSASigner({ signer: sessionSigner });

  const validUntil = Math.floor(Date.now() / 1000) + SESSION_SECONDS;

  const callPolicy = toCallPolicy({
    policyVersion: CallPolicyVersion.V0_0_5,
    permissions: [
      {
        abi: clickMintGameAbi,
        functionName: "clickFor",
        target: gameAddress,
      },
    ],
  });

  const timestampPolicy = toTimestampPolicy({
    validAfter: 0,
    validUntil,
  });

  const permissionValidator = await toPermissionValidator(publicClient, {
    entryPoint,
    kernelVersion: KERNEL_VERSION,
    signer: sessionModular,
    policies: [callPolicy, timestampPolicy],
  });

  const kernelAccount = await createKernelAccount(publicClient, {
    entryPoint,
    kernelVersion: KERNEL_VERSION,
    plugins: {
      sudo: ecdsaValidator,
      regular: permissionValidator,
      validUntil,
      validAfter: 0,
    },
  });

  const paymasterContext = getPimlicoPaymasterContext();

  const masterClient = createKernelAccountClient({
    account: kernelAccount,
    chain: baseSepolia,
    client: publicClient,
    bundlerTransport,
    paymaster: true,
    paymasterContext,
    userOperation: { estimateFeesPerGas: pimlicoEstimateFeesPerGas },
  });

  await masterClient.sendTransaction({
    account: kernelAccount,
    chain: baseSepolia,
    to: kernelAccount.address,
    value: 0n,
    data: "0x",
  });

  const serializedPermission = await serializePermissionAccount(
    kernelAccount,
    sessionPk as Hex,
    undefined,
    undefined,
    undefined,
    undefined
  );

  const sessionAccount = await deserializePermissionAccount(
    publicClient,
    entryPoint,
    KERNEL_VERSION,
    serializedPermission
  );

  const sessionClient = createKernelAccountClient({
    account: sessionAccount,
    chain: baseSepolia,
    client: publicClient,
    bundlerTransport,
    paymaster: true,
    paymasterContext,
    userOperation: { estimateFeesPerGas: pimlicoEstimateFeesPerGas },
  });

  return {
    sessionSigner,
    kernelAccount,
    masterClient,
    serializedPermission,
    smartAccountAddress: kernelAccount.address,
    sessionClient,
  };
}

export function encodeClickForCalldata(player: Address): Hex {
  return encodeFunctionData({
    abi: clickMintGameAbi,
    functionName: "clickFor",
    args: [player],
  });
}

export async function sendGaslessClick(
  sessionClient: ReturnType<typeof createKernelAccountClient>,
  gameAddress: Address,
  player: Address
): Promise<Hex> {
  const account = sessionClient.account;
  if (!account) throw new Error("Session client missing account");
  const hash = await sessionClient.sendTransaction({
    account,
    chain: baseSepolia,
    to: gameAddress,
    value: 0n,
    data: encodeClickForCalldata(player),
  });
  return hash as Hex;
}

/** One-time (EOA gas): authorize `executor` smart account to call `clickFor(eoa)` / `depositFor(eoa)`. */
export async function linkClickExecutor(
  walletClient: WalletClient,
  gameAddress: Address,
  executor: Address
): Promise<Hex> {
  if (!walletClient.account) throw new Error("Wallet client has no account");
  const hash = await walletClient.writeContract({
    chain: baseSepolia,
    account: walletClient.account,
    address: gameAddress,
    abi: clickMintGameAbi,
    functionName: "setClickExecutor",
    args: [executor],
  });
  return hash;
}
