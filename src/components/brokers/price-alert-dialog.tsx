import { useEffect, useState } from "react";
import { toast } from "sonner";
import { BellPlus, BellRing, Trash2, TrendingDown, TrendingUp } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { usePriceAlerts } from "@/lib/price-alerts";
import { formatNpr } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * One-tap alert creation for a single scrip. Used by the scrip sheet header
 * and the terminal chart readout bar: wherever a price is on screen, an
 * alert is one click away. Full list management lives in PriceAlertsPanel.
 */
export function PriceAlertDialog({
  symbol,
  defaultPrice,
  open,
  onOpenChange,
}: {
  symbol: string;
  defaultPrice: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { alerts, add, remove } = usePriceAlerts();
  const [target, setTarget] = useState("");
  const [direction, setDirection] = useState<"above" | "below">("above");

  const base =
    defaultPrice && Number.isFinite(defaultPrice) && defaultPrice > 0 ? defaultPrice : null;

  useEffect(() => {
    if (open) {
      setTarget(base ? String(Math.round(base * 100) / 100) : "");
      setDirection("above");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultPrice]);

  const existing = alerts.filter((a) => a.symbol === symbol.toUpperCase());

  const save = () => {
    const created = add(symbol, Number(target.replace(/,/g, "")), direction);
    if (!created) {
      toast.error("Enter a positive target price.");
      return;
    }
    toast.success(`Alert set: ${created.symbol} ${direction} ${formatNpr(created.target)}`);
    onOpenChange(false);
  };

  const chip = (pct: number) => {
    if (!base) return;
    const value = Math.round(base * (1 + pct / 100) * 100) / 100;
    setTarget(String(value));
    setDirection(pct >= 0 ? "above" : "below");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400">
              <BellRing className="size-4" />
            </span>
            {symbol.toUpperCase()}
            {base ? (
              <span className="num text-base font-semibold text-muted-foreground">
                {formatNpr(base)}
              </span>
            ) : null}
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-2">
          {(
            [
              { d: "above", icon: TrendingUp, label: "Rises to" },
              { d: "below", icon: TrendingDown, label: "Falls to" },
            ] as const
          ).map(({ d, icon: Icon, label }) => (
            <button
              key={d}
              type="button"
              onClick={() => setDirection(d)}
              aria-pressed={direction === d}
              className={cn(
                "flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left transition-colors",
                direction === d
                  ? "border-amber-500/50 bg-amber-500/10"
                  : "border-border/60 hover:border-amber-500/30",
              )}
            >
              <Icon
                className={cn(
                  "size-4 shrink-0",
                  direction === d ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground",
                )}
              />
              <span
                className={cn(
                  "text-sm font-semibold",
                  direction === d ? "" : "text-muted-foreground",
                )}
              >
                {label}
              </span>
            </button>
          ))}
        </div>

        <div className="flex items-end gap-2">
          <div className="flex-1 space-y-1">
            <label htmlFor="pa-target" className="text-xs font-medium text-muted-foreground">
              Rs.
            </label>
            <Input
              id="pa-target"
              inputMode="decimal"
              autoFocus
              value={target}
              onChange={(e) => setTarget(e.target.value.replace(/[^0-9.]/g, "").slice(0, 12))}
              placeholder={base ? String(base) : "550"}
              className="num h-11 text-lg font-semibold"
              onKeyDown={(e) => {
                if (e.key === "Enter") save();
              }}
            />
          </div>
          <Button className="h-11 gap-1.5 px-5" onClick={save}>
            <BellPlus className="size-4" /> Set
          </Button>
        </div>

        {base ? (
          <div className="flex flex-wrap gap-1.5">
            {[-5, -3, -1, 1, 3, 5].map((pct) => (
              <button
                key={pct}
                type="button"
                onClick={() => chip(pct)}
                className="num rounded-full border border-border/60 px-2.5 py-1 text-xs font-semibold text-muted-foreground transition-colors hover:border-amber-500/40 hover:text-foreground"
              >
                {pct > 0 ? `+${pct}%` : `${pct}%`}
              </button>
            ))}
          </div>
        ) : null}

        {existing.length > 0 ? (
          <ul className="space-y-1.5 border-t border-border/60 pt-3">
            {existing.map((a) => (
              <li
                key={a.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-background px-3 py-2 text-sm"
              >
                <span>
                  {a.direction === "above" ? "≥" : "≤"}{" "}
                  <span className="num font-semibold">{a.target.toLocaleString("en-NP")}</span>{" "}
                  <span className="text-xs text-muted-foreground">
                    · {a.hitAt ? "fired" : "watching"}
                  </span>
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label="Delete alert"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => remove(a.id)}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
