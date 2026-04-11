"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Address } from "viem";
import type { WalletClient } from "viem";
import {
  createAaPublicClient,
  enableGaslessSession,
  isPimlicoConfigured,
  linkClickExecutor,
  sendGaslessClick,
  type BuiltMasterKernel,
} from "@/lib/account-abstraction";

export type GaslessStatus = "off" | "idle" | "enabling" | "ready" | "error";

export function useGaslessClickSession(gameAddress: Address | undefined) {
  const [status, setStatus] = useState<GaslessStatus>("off");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [smartAccountAddress, setSmartAccountAddress] = useState<Address | null>(null);
  const [sessionExpiresAt, setSessionExpiresAt] = useState<number | null>(null);

  const ctxRef = useRef<BuiltMasterKernel | null>(null);

  const clear = useCallback(() => {
    ctxRef.current = null;
    setSmartAccountAddress(null);
    setSessionExpiresAt(null);
    setErrorMessage(null);
    setStatus("off");
  }, []);

  const enable = useCallback(
    async (walletClient: WalletClient) => {
      if (!gameAddress) {
        setErrorMessage("Game address not configured");
        setStatus("error");
        return;
      }
      if (!isPimlicoConfigured()) {
        setErrorMessage("Pimlico API key missing (NEXT_PUBLIC_PIMLICO_API_KEY)");
        setStatus("error");
        return;
      }
      setStatus("enabling");
      setErrorMessage(null);
      try {
        const built = await enableGaslessSession({
          walletClient,
          gameAddress,
        });
        const publicClient = createAaPublicClient();
        const linkHash = await linkClickExecutor(
          walletClient,
          gameAddress,
          built.smartAccountAddress
        );
        const receipt = await publicClient.waitForTransactionReceipt({ hash: linkHash });
        if (receipt.status !== "success") {
          throw new Error("setClickExecutor transaction reverted — your game contract may need redeploy.");
        }
        ctxRef.current = built;
        setSmartAccountAddress(built.smartAccountAddress);
        setSessionExpiresAt(Math.floor(Date.now() / 1000) + 30 * 60);
        setStatus("ready");
      } catch (e) {
        console.error("[ClickMint] enableGaslessSession", e);
        ctxRef.current = null;
        setSmartAccountAddress(null);
        setSessionExpiresAt(null);
        setErrorMessage((e as Error).message.slice(0, 280));
        setStatus("error");
      }
    },
    [gameAddress]
  );

  const gaslessClick = useCallback(
    async (playerAddress: Address) => {
      const c = ctxRef.current;
      if (!c || !gameAddress) throw new Error("Gasless session not ready");
      return sendGaslessClick(c.sessionClient, gameAddress, playerAddress);
    },
    [gameAddress]
  );

  useEffect(() => {
    if (sessionExpiresAt === null) return;
    const t = setInterval(() => {
      if (Date.now() / 1000 > sessionExpiresAt) {
        clear();
        clearInterval(t);
      }
    }, 5000);
    return () => clearInterval(t);
  }, [sessionExpiresAt, clear]);

  return {
    status,
    errorMessage,
    smartAccountAddress,
    sessionExpiresAt,
    enable,
    clear,
    gaslessClick,
  };
}
