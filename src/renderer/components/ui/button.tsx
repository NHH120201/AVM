import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-lg font-semibold transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
  {
    variants: {
      variant: {
        default: "bg-primary text-white hover:bg-primary-hover",
        secondary: "bg-surface text-muted hover:bg-[#252840] border border-border",
        danger: "bg-[#2d1a1a] text-destructive hover:bg-[#3a2020] border border-destructive/20",
        ghost: "text-muted hover:bg-surface hover:text-foreground",
        accent: "bg-accent text-[#0a0a0f] hover:bg-[#16a34a] font-bold",
      },
      size: {
        default: "px-4 py-2 text-[13px]",
        sm: "px-3 py-1.5 text-[12px]",
        lg: "px-6 py-3 text-[14px]",
        full: "w-full px-4 py-2.5 text-[13px]",
        icon: "w-8 h-8 text-[13px]",
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
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
