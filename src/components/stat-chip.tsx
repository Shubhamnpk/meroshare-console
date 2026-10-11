import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function StatChip({
  icon,
  label,
  value,
  valueClass,
  onClick,
  title,
}: {
  icon?: ReactNode;
  label: string;
  value: ReactNode;
  valueClass?: string;
  onClick?: (() => void) | undefined;
  title?: string | undefined;
}) {
  const body = (
    <>
      {icon ? <span className="text-muted-foreground">{icon}</span> : null}
      <div className="leading-tight">
        <p className="whitespace-nowrap text-[0.68rem] uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className={cn("num whitespace-nowrap font-semibold", valueClass)}>{value}</p>
      </div>
    </>
  );
  if (!onClick) {
    return (
      <div className="flex shrink-0 items-center gap-2 rounded-xl border border-border/70 bg-card px-3.5 py-2">
        {body}
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      title={title ?? label}
      className="flex shrink-0 cursor-pointer items-center gap-2 rounded-xl border border-border/70 bg-card px-3.5 py-2 text-left transition-colors hover:border-primary/40"
    >
      {body}
    </button>
  );
}

/**
 * Chip rail. Default is a single scrolling row (portfolio); `wrap` switches
 * to a wrapping grid (activity / funds / debentures / pipeline pages).
 */
export function ChipRow({ children, wrap = false }: { children: ReactNode; wrap?: boolean }) {
  return wrap ? (
    <div className="flex flex-wrap gap-2">{children}</div>
  ) : (
    <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {children}
    </div>
  );
}
