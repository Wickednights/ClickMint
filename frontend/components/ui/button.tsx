import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60 disabled:pointer-events-none disabled:opacity-40",
  {
    variants: {
      variant: {
        default:
          "bg-cyan-500/15 text-cyan-200 border border-cyan-400/40 hover:bg-cyan-500/25 shadow-[0_0_18px_-4px_rgba(34,211,238,0.5)]",
        ghost: "text-zinc-300 hover:bg-white/5 border border-transparent",
        neon:
          "bg-fuchsia-500/20 text-fuchsia-100 border border-fuchsia-400/50 hover:bg-fuchsia-500/30 shadow-[0_0_24px_-6px_rgba(217,70,239,0.6)]",
        buy: "bg-emerald-500/20 text-emerald-100 border border-emerald-400/50 hover:bg-emerald-500/30",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-12 rounded-xl px-8 text-base",
        icon: "h-10 w-10",
        giant: "h-28 w-28 rounded-full text-lg md:h-32 md:w-32",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
