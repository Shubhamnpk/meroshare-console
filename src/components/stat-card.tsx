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
        tone === "brand" && "glow",
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

export function DeltaPill({ value, children }: { value: number; children: ReactNode }) {
  const up = value >= 0;
  return (
    <span
      className={cn(
        "num inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold",
        up ? "bg-gain/15 text-gain" : "bg-loss/15 text-loss",
      )}
    >
      {children}
    </span>
  );
}
