import { useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type SortDir = "asc" | "desc" | "default";

/** Column kind decides the tap cycle: text goes A→Z first, numbers biggest-first. */
export type SortKind = "text" | "number";

export interface SortState<K extends string> {
  key: K;
  dir: SortDir;
}

const CYCLES: Record<SortKind, SortDir[]> = {
  text: ["asc", "desc", "default"],
  number: ["desc", "asc", "default"],
};

/**
 * Click-to-sort state. First tap gives the natural order for the column kind
 * (text: A→Z, numbers: biggest first), second tap flips it, third returns to
 * the table's original (default) order. The arrow always matches: up means
 * A→Z for text and biggest-first for numbers.
 */
export function useSort<K extends string>(initial: SortState<K>, kinds: Record<K, SortKind>) {
  const [sort, setSort] = useState<SortState<K>>(initial);
  const toggle = (key: K) =>
    setSort((s) => {
      const cycle = CYCLES[kinds[key] ?? "number"];
      if (s.key !== key) return { key, dir: cycle[0]! };
      const next = cycle[(cycle.indexOf(s.dir) + 1) % cycle.length]!;
      return { key, dir: next };
    });
  return { sort, toggle };
}

/** Sort rows by an accessor; numbers compare numerically, everything else as strings. */
export function sortBy<T>(rows: T[], get: (row: T) => number | string, dir: SortDir): T[] {
  if (dir === "default") return [...rows];
  const mul = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = get(a);
    const bv = get(b);
    if (typeof av === "number" && typeof bv === "number") return (av - bv) * mul;
    return String(av).localeCompare(String(bv)) * mul;
  });
}

/** Sortable table header cell matching the app's table header styling. */
export function SortableTh({
  label,
  active,
  dir,
  onClick,
  align = "left",
  className,
  kind = "number",
}: {
  label: string;
  active: boolean;
  dir: SortDir;
  onClick: () => void;
  align?: "left" | "right";
  className?: string;
  kind?: SortKind;
}) {
  const highlighted = active && dir !== "default";
  // Arrow up always means the "top-heavy" order: A→Z for text, biggest first
  // for numbers. Arrow down is the reverse.
  const up = kind === "text" ? dir === "asc" : dir === "desc";
  return (
    <th
      scope="col"
      className={cn(
        "px-4 py-2.5 text-xs font-medium uppercase tracking-wider",
        align === "right" ? "text-right" : "text-left",
        className,
      )}
    >
      <button
        type="button"
        onClick={onClick}
        aria-label={`Sort by ${label}`}
        className={cn(
          "inline-flex items-center gap-1 transition-colors",
          align === "right" ? "w-full justify-end" : "justify-start",
          highlighted ? "text-foreground" : "text-muted-foreground hover:text-foreground",
        )}
      >
        {label}
        {highlighted ? (
          up ? (
            <ArrowUp className="size-3 text-primary" aria-hidden />
          ) : (
            <ArrowDown className="size-3 text-primary" aria-hidden />
          )
        ) : (
          <ArrowUpDown className="size-3 opacity-40" aria-hidden />
        )}
      </button>
    </th>
  );
}
