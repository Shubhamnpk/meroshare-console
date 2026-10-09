import { LayoutGrid, List, TableIcon, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type ViewOption = "cards" | "list" | "table";

const ICONS: Record<ViewOption, LucideIcon> = {
  cards: LayoutGrid,
  list: List,
  table: TableIcon,
};

const LABELS: Record<ViewOption, string> = {
  cards: "Cards",
  list: "List",
  table: "Table",
};

/**
 * Shared Cards/List/Table view switcher (same UI everywhere).
 * Pass a subset of modes to offer fewer choices.
 */
export function ViewToggle<T extends ViewOption>({
  value,
  onChange,
  modes = ["cards", "list"] as T[],
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  modes?: readonly T[];
  className?: string;
}) {
  return (
    <div className={cn("inline-flex items-center gap-0.5 rounded-full border bg-muted/60 p-0.5 shadow-sm", className)}>
      {modes.map((v) => {
        const Icon: LucideIcon = ICONS[v];
        return (
          <button
            key={v}
            type="button"
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-medium transition-all",
              value === v
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => onChange(v)}
            aria-label={`${LABELS[v]} view`}
            aria-pressed={value === v}
            title={LABELS[v]}
          >
            <Icon className="size-3.5" aria-hidden />
            <span className="hidden sm:inline">{LABELS[v]}</span>
          </button>
        );
      })}
    </div>
  );
}
