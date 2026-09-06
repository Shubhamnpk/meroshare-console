import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  sub,
  tone = "neutral",
  icon,
  className,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: "neutral" | "gain" | "loss" | "brand";
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-border/70 bg-card p-4 sm:p-5",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        {icon ? <span className="text-muted-foreground">{icon}</span> : null}
      </div>
      <p
        className={cn(
          "num mt-3 text-2xl font-semibold sm:text-3xl",
          tone === "gain" && "text-gain",
          tone === "loss" && "text-loss",
          tone === "brand" && "brand-gradient-text",
        )}
      >
        {value}
      </p>
      {sub ? <div className="mt-1.5 text-xs text-muted-foreground">{sub}</div> : null}
    </div>
  );
}

export function DeltaPill({
  value,
  children,
  className,
}: {
  value: number;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        // text-center + leading-snug keep the stadium shape clean when long
        // values wrap onto a 2nd/3rd row in squeezed table cells.
        "num inline-flex max-w-full items-center justify-center gap-1 rounded-full px-2 py-0.5 text-center text-xs font-semibold leading-snug",
        value > 0
          ? "bg-gain/15 text-gain"
          : value < 0
            ? "bg-loss/15 text-loss"
            : "bg-muted text-muted-foreground",
        className,
      )}
    >
      {children}
    </span>
  );
}
