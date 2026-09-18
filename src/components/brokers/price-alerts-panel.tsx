import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { BellPlus, BellRing, Trash2 } from "lucide-react";
import { Panel } from "@/components/ui/panel";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { marketSnapshotQuery } from "@/lib/queries";
import { isAlertHit, usePriceAlerts } from "@/lib/price-alerts";
import { formatNpr } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Local price alerts. Lives on the broker Overview tab because that is where
 * trading decisions happen, but it needs no broker session: it watches the
 * public live-price snapshot and fires a toast the moment a line is crossed.
 */
export function PriceAlertsPanel() {
  const { alerts, add, remove, reset } = usePriceAlerts();
  const snapshot = useQuery(marketSnapshotQuery());
  const [symbol, setSymbol] = useState("");
  const [target, setTarget] = useState("");
  const [direction, setDirection] = useState<"above" | "below">("above");

  const prices = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of snapshot.data?.prices ?? []) map.set(p.symbol, p.ltp);
    return map;
  }, [snapshot.data]);

  // Firing is handled globally by the notification bell (always mounted), so
  // alerts toast on any page: this panel is manage-only.

  const submit = () => {
    const created = add(symbol, Number(target.replace(/,/g, "")), direction);
    if (!created) {
      toast.error("Check the symbol (3+ letters) and a positive target price.");
      return;
    }
    setSymbol("");
    setTarget("");
    toast.success(`Alert set: ${created.symbol} ${direction} ${formatNpr(created.target)}`);
  };

  return (
    <Panel padding="lg" shadow className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <BellRing className="size-4 text-primary" /> Price alerts · {alerts.length}
        </p>
        <p className="text-[0.7rem] text-muted-foreground">Stored on this device</p>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-28 flex-1 space-y-1">
          <label
            htmlFor="alert-symbol"
            className="text-[0.68rem] font-medium text-muted-foreground"
          >
            Symbol
          </label>
          <Input
            id="alert-symbol"
            value={symbol}
            onChange={(e) =>
              setSymbol(
                e.target.value
                  .toUpperCase()
                  .replace(/[^A-Z0-9]/g, "")
                  .slice(0, 24),
              )
            }
            placeholder="NABIL"
            className="h-8 text-xs"
          />
        </div>
        <div
          className="flex gap-1 rounded-lg border border-border/60 bg-background p-1"
          role="group"
          aria-label="Direction"
        >
          {(["above", "below"] as const).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDirection(d)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-semibold capitalize transition-colors",
                direction === d ? "bg-primary/15 text-primary" : "text-muted-foreground",
              )}
            >
              {d === "above" ? "≥ Above" : "≤ Below"}
            </button>
          ))}
        </div>
        <div className="min-w-28 flex-1 space-y-1">
          <label
            htmlFor="alert-target"
            className="text-[0.68rem] font-medium text-muted-foreground"
          >
            Target price
          </label>
          <Input
            id="alert-target"
            inputMode="decimal"
            value={target}
            onChange={(e) => setTarget(e.target.value.replace(/[^0-9.]/g, "").slice(0, 12))}
            placeholder="550"
            className="h-8 text-xs"
          />
        </div>
        <Button size="sm" className="gap-1.5 text-xs" onClick={submit}>
          <BellPlus className="size-3.5" /> Add alert
        </Button>
      </div>
      {alerts.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No alerts yet. Set one and you&apos;ll get a toast the moment the live price crosses it -
          even without a broker linked.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {alerts.map((a) => {
            const ltp = prices.get(a.symbol);
            const hit = Boolean(a.hitAt) || isAlertHit(a, ltp);
            return (
              <li
                key={a.id}
                className={cn(
                  "flex items-center justify-between gap-3 rounded-xl border px-3 py-2",
                  hit ? "border-amber-500/40 bg-amber-500/5" : "border-border/60 bg-background",
                )}
              >
                <div className="min-w-0">
                  <p className="text-sm">
                    <span className="font-bold">{a.symbol}</span>{" "}
                    <span className="text-muted-foreground">
                      {a.direction === "above" ? "≥" : "≤"}{" "}
                      <span className="num font-semibold text-foreground">
                        {a.target.toLocaleString("en-IN")}
                      </span>
                    </span>
                  </p>
                  <p className="num text-[0.7rem] text-muted-foreground">
                    Live {ltp != null ? formatNpr(ltp) : "-"} ·{" "}
                    {a.hitAt ? "fired" : hit ? "crossed now" : "watching"}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  {a.hitAt ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs"
                      onClick={() => reset(a.id)}
                    >
                      Re-arm
                    </Button>
                  ) : null}
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Delete alert for ${a.symbol}`}
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => remove(a.id)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
