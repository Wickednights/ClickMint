"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Address } from "viem";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  smartAccountAddress: Address | null;
  status: "idle" | "enabling" | "error";
  errorMessage: string | null;
  onConfirm: () => void;
  confirmingDisabled: boolean;
};

export function GaslessSessionDialog({
  open,
  onOpenChange,
  smartAccountAddress,
  status,
  errorMessage,
  onConfirm,
  confirmingDisabled,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-outline-variant/40 bg-surface-container-low sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-headline uppercase tracking-widest text-primary-fixed">
            Enable gasless clicks
          </DialogTitle>
          <DialogDescription className="!mt-2 space-y-2 font-body text-xs leading-relaxed text-secondary">
            <p>
              <strong className="text-on-surface">Two quick wallet steps:</strong> (1) Deploy your ClickMint smart account
              and install a short-lived session key. (2) Approve linking — your EOA calls{" "}
              <span className="font-mono text-on-surface/90">setClickExecutor(smartAccount)</span> on the game (small gas).
            </p>
            <p>
              After that, sponsored <span className="font-mono text-on-surface">clickFor(your EOA)</span> runs through
              Pimlico — <strong className="text-on-surface">no gas on each click</strong>. Credits, $CLICK vesting, POT
              stats, and trophies all stay tied to <strong className="text-on-surface">your EOA</strong>. Add credits with
              the normal deposit buttons (ETH from your wallet).
            </p>
          </DialogDescription>
        </DialogHeader>
        {smartAccountAddress ? (
          <div className="rounded border border-outline-variant/30 bg-surface-container px-3 py-2 font-mono text-[10px] text-on-surface break-all">
            {smartAccountAddress}
          </div>
        ) : null}
        {status === "enabling" ? (
          <p className="font-body text-xs text-primary-fixed">Approve in your wallet, then wait for the bundler…</p>
        ) : null}
        {errorMessage ? (
          <p className="font-body text-xs text-red-300/90" role="alert">
            {errorMessage}
          </p>
        ) : null}
        <DialogFooter className="gap-2 sm:justify-between">
          <button
            type="button"
            className="font-label text-[10px] uppercase tracking-widest text-secondary hover:text-on-surface"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={confirmingDisabled || status === "enabling"}
            onClick={onConfirm}
            className={cn(
              "rounded border border-primary-fixed/50 bg-primary-fixed/10 px-4 py-2 font-headline text-xs font-bold uppercase tracking-widest text-primary-fixed",
              "hover:bg-primary-fixed/20 disabled:opacity-40"
            )}
          >
            {status === "enabling" ? "Working…" : "Sign & enable"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
