"use client";

import { baseSepolia } from "wagmi/chains";
import { useConnect } from "wagmi";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function connectorLabel(name: string, id: string): string {
  const lower = `${name} ${id}`.toLowerCase();
  if (lower.includes("meta mask") || lower.includes("metamask")) return "MetaMask";
  if (lower.includes("coinbase")) return "Coinbase Wallet";
  if (lower.includes("walletconnect") || lower.includes("wallet connect")) return "WalletConnect";
  if (lower.includes("zerion")) return "Zerion (browser)";
  if (lower.includes("rabby")) return "Rabby (browser)";
  if (lower.includes("injected")) return "Browser wallet (Zerion, Rabby, …)";
  return name;
}

function connectorRank(c: { id: string; name: string }) {
  const k = `${c.id} ${c.name}`.toLowerCase();
  if (k.includes("metamask")) return 0;
  if (k.includes("coinbase")) return 1;
  if (k.includes("walletconnect")) return 2;
  if (k.includes("injected")) return 4;
  return 3;
}

export function WalletPickerDialog({ open, onOpenChange }: Props) {
  const { connectAsync, connectors, error, isPending, reset } = useConnect();
  const ordered = [...connectors].sort((a, b) => connectorRank(a) - connectorRank(b));

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="border-outline-variant/40 bg-surface-container-low sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-headline uppercase tracking-widest text-primary-fixed">
            Connect wallet
          </DialogTitle>
          <DialogDescription className="!mt-1 text-[10px] opacity-90">
            Network: <span className="font-mono text-primary-fixed">Base Sepolia</span> (chain {baseSepolia.id})
          </DialogDescription>
        </DialogHeader>
        {!process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID?.trim() && (
          <p className="rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 font-body text-[9px] text-amber-200">
            WalletConnect is disabled until you set{" "}
            <span className="font-mono">NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID</span> in{" "}
            <span className="font-mono">frontend/.env.local</span> (free at cloud.walletconnect.com).
          </p>
        )}
        <ul className="mt-2 max-h-[min(60vh,22rem)] space-y-2 overflow-auto pr-1">
          {ordered.map((c) => (
            <li key={`${c.id}-${c.name}`}>
              <button
                type="button"
                disabled={isPending}
                onClick={() => {
                  void (async () => {
                    try {
                      await connectAsync({ connector: c, chainId: baseSepolia.id });
                      onOpenChange(false);
                    } catch (err) {
                      console.error("[ClickMint] connect failed", c.id, err);
                    }
                  })();
                }}
                className={cn(
                  "flex w-full items-center justify-between border border-outline-variant/40 bg-surface-container px-4 py-3 text-left font-label text-[11px] font-bold uppercase tracking-widest text-on-surface transition-colors",
                  "hover:border-primary-fixed/60 hover:text-primary-fixed disabled:opacity-40"
                )}
              >
                <span>{connectorLabel(c.name, c.id)}</span>
                <span className="font-mono text-[9px] font-normal lowercase text-secondary opacity-60">
                  {c.id}
                </span>
              </button>
            </li>
          ))}
        </ul>
        {error && (
          <p className="font-body text-[10px] text-amber-200/90">
            {error.message?.includes("reject") || error.message?.includes("denied")
              ? "Connection cancelled."
              : error.message.slice(0, 200)}
          </p>
        )}
        {isPending && (
          <p className="font-label text-[9px] uppercase tracking-widest text-secondary">Requesting wallet…</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
