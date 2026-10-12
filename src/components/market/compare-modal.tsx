import { useMemo, useState } from "react";
import { Check, GitCompareArrows, Search, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface CompareOption {
  symbol: string;
  name: string;
  pct: number;
}

/**
 * Session-only compare picker: search any company, tick to overlay its
 * indexed % line. Nothing here is persisted — closing the session clears it.
 */
export function CompareModal({
  open,
  onOpenChange,
  options,
  selected,
  onToggle,
  max,
  current,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  options: CompareOption[];
  selected: string[];
  onToggle: (symbol: string) => void;
  max: number;
  current: string;
}) {
  const [term, setTerm] = useState("");
  const rows = useMemo(() => {
    const t = term.trim().toLowerCase();
    const list = options.filter((o) => o.symbol !== current);
    if (!t) return list.slice(0, 30);
    return list.filter((o) => o.symbol.toLowerCase().includes(t) || o.name.toLowerCase().includes(t)).slice(0, 30);
  }, [options, term, current]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] w-[calc(100vw-1.5rem)] max-w-md overflow-hidden p-0">
        <DialogHeader className="px-4 pb-0 pt-4 text-left">
          <DialogTitle className="flex items-center gap-2 font-display">
            <GitCompareArrows className="size-4 text-primary" /> Compare against {current}
          </DialogTitle>
          <DialogDescription>Compare up to {max} stocks.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 px-4 pb-4">
          {selected.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {selected.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => onToggle(s)}
                  title={`Remove ${s}`}
                  className="inline-flex items-center gap-1 rounded-full border border-primary/50 bg-primary/15 px-2.5 py-0.5 text-xs font-medium text-primary transition-colors hover:bg-primary/25"
                >
                  {s} <X className="size-3" />
                </button>
              ))}
            </div>
          ) : null}
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="Search any company…"
              aria-label="Search companies to compare"
              className="h-10 rounded-xl pl-9"
            />
          </div>
          <ul className="max-h-72 space-y-1 overflow-y-auto">
            {rows.map((o) => {
              const on = selected.includes(o.symbol);
              const full = !on && selected.length >= max;
              return (
                <li key={o.symbol}>
                  <button
                    type="button"
                    disabled={full}
                    onClick={() => onToggle(o.symbol)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                      on ? "border-primary/50 bg-primary/10" : "border-border/60 bg-surface hover:border-primary/30",
                      full && "cursor-not-allowed opacity-40 hover:border-border/60",
                    )}
                  >
                    <span
                      className={cn(
                        "flex size-4 shrink-0 items-center justify-center rounded border",
                        on ? "border-primary bg-primary text-primary-foreground" : "border-border text-transparent",
                      )}
                    >
                      <Check className="size-3" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{o.symbol}</span>
                      <span className="block truncate text-xs text-muted-foreground">{o.name}</span>
                    </span>
                    <span className={cn("num shrink-0 text-xs font-semibold", o.pct >= 0 ? "text-gain" : "text-loss")}>
                      {o.pct >= 0 ? "+" : ""}
                      {o.pct.toFixed(2)}%
                    </span>
                  </button>
                </li>
              );
            })}
            {rows.length === 0 ? (
              <li className="rounded-lg border border-border/60 px-3 py-6 text-center text-sm text-muted-foreground">
                No companies match “{term}”.
              </li>
            ) : null}
          </ul>
        </div>
      </DialogContent>
    </Dialog>
  );
}
