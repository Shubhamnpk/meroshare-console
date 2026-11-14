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
      <div className="flex shrink-0 items-center gap-2 rounded-xl border border-border/70 bg-card px-3 py-1.5 sm:px-3.5 sm:py-2">
        {body}
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      title={title ?? label}
      className="flex shrink-0 cursor-pointer items-center gap-2 rounded-xl border border-border/70 bg-card px-3 py-1.5 text-left transition-colors hover:border-primary/40 sm:px-3.5 sm:py-2"
    >
      {body}
    </button>
  );
}

/**
 * Chip rail. Default is a single scrolling row (portfolio); `wrap` keeps the
 * desktop wrapping grid but stays one swipeable strip on phones, where a
 * 2-line stat block would eat half the screen.
 */
export function ChipRow({ children, wrap = false }: { children: ReactNode; wrap?: boolean }) {
  if (!wrap) {
    return <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">{children}</div>;
  }
  return (
    <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
      {children}
    </div>
  );
}
