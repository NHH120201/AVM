import * as React from "react";
import { cn } from "../../lib/utils";

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "accent" | "muted" | "active";
}

export function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium border",
        {
          default: "bg-surface border-border text-muted",
          accent: "bg-accent/10 border-accent/30 text-accent",
          muted: "bg-surface border-border text-muted",
          active: "bg-primary/10 border-primary/30 text-primary",
        }[variant],
        className
      )}
      {...props}
    />
  );
}
