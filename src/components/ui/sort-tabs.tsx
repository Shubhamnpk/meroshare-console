import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

export function SortTabs<T extends string>({
  options,
  activeKey,
  dir,
  onSelect,
  className,
}: {
  options: readonly { key: T; label: string }[];
  activeKey: T | null;
  dir: "asc" | "desc" | "default";
  onSelect: (key: T) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-1 self-start rounded-xl border border-border/60 bg-card p-1", className)}>
      {options.map((o) => {
        const active = activeKey === o.key && dir !== "default";
        return (
          <button
            key={o.key}
            type="button"
            onClick={() => onSelect(o.key)}
            className={cn(
              "inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-colors",
              active ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground",
            )}
            aria-pressed={active}
          >
            {o.label}
            {active ? (
              dir === "asc" ? (
                <ArrowUp className="size-3 opacity-80" />
              ) : (
                <ArrowDown className="size-3 opacity-80" />
              )
            ) : (
              <ArrowUpDown className="size-3 opacity-40" />
            )}
          </button>
        );
      })}
    </div>
  );
}
