"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

function Progress({ className, value = 0 }: { className?: string; value?: number }) {
  const v = Math.min(100, Math.max(0, value));
  return (
    <div
      className={cn(
        "relative h-3 w-full overflow-hidden rounded-full border border-fuchsia-500/30 bg-zinc-900/80",
        className
      )}
    >
      <div
        className="h-full bg-gradient-to-r from-cyan-400 via-fuchsia-500 to-cyan-400 transition-[width] duration-500 ease-out"
        style={{ width: `${v}%` }}
      />
    </div>
  );
}

export { Progress };
