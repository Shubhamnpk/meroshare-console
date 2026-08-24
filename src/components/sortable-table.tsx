import { useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type SortDir = "asc" | "desc";

export interface SortState<K extends string> {
  key: K;
  dir: SortDir;
}

/** Click-to-sort state: first click sorts ascending, clicking again flips direction. */
export function useSort<K extends string>(initial: SortState<K>) {
  const [sort, setSort] = useState<SortState<K>>(initial);
  const toggle = (key: K) =>
    setSort((s) => ({ key, dir: s.key === key && s.dir === "asc" ? "desc" : "asc" }));
  return { sort, toggle };
}

/** Sort rows by an accessor; numbers compare numerically, everything else as strings. */
export function sortBy<T>(rows: T[], get: (row: T) => number | string, dir: SortDir): T[] {
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
}: {
  label: string;
  active: boolean;
  dir: SortDir;
  onClick: () => void;
  align?: "left" | "right";
  className?: string;
}) {
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
          active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
        )}
      >
        {label}
        {active ? (
          dir === "asc" ? (
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
