import { useEffect, useState } from "react";
import { FlaskConical, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatNpr } from "@/lib/format";
import { loadYoWallet, saveYoWallet } from "@/lib/yobroker/store";
import { YO_INITIAL_CASH } from "@/lib/yobroker/types";

function dematForKey(): string | null {
  try {
    const raw = localStorage.getItem("ms-prefs.v1");
    if (raw) {
      const j = JSON.parse(raw) as Record<string, unknown>;
      if (typeof j["demat"] === "string") return j["demat"] as string;
    }
    const alt = localStorage.getItem("ms-session");
    if (alt) {
      const k = JSON.parse(alt) as Record<string, unknown>;
      if (typeof k["demat"] === "string") return k["demat"] as string;
    }
  } catch {}
  // fallback: read from any yobroker key prefix already stored
  return null;
}

export function YoBrokerModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [wallet, setWallet] = useState(() => loadYoWallet(dematForKey()));
  useEffect(() => {
    if (open) setWallet(loadYoWallet(dematForKey()));
  }, [open]);

  const activate = () => {
    const d = dematForKey();
    const w = loadYoWallet(d);
    const next = { ...w, active: true, cash: w.cash || YO_INITIAL_CASH };
    // keep holdings if already active, else seed cash
    if (!w.active && w.holdings.length === 0 && w.trades.length === 0) next.cash = YO_INITIAL_CASH;
    saveYoWallet(d, next);
    setWallet(next);
    onOpenChange(false);
  };
  const reset = () => {
    const d = dematForKey();
    const w = loadYoWallet(d);
    const next = { ...w, cash: YO_INITIAL_CASH, holdings: [], orders: [], trades: [], seq: 1 };
    saveYoWallet(d, next);
    setWallet(next);
  };
  const deactivate = () => {
    const d = dematForKey();
    const w = loadYoWallet(d);
    const next = { ...w, active: false };
    saveYoWallet(d, next);
    setWallet(next);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-xl bg-violet-500/15 text-violet-600">
              <FlaskConical className="size-4" />
            </span>
            Yo Broker
          </DialogTitle>
          <DialogDescription>
           practice without real money or settlement.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 rounded-2xl border border-border/60 bg-muted/20 p-3 text-sm leading-relaxed">
          <p>
            This is a practice account. You get a virtual {formatNpr(YO_INITIAL_CASH)} to buy and
            sell at live NEPSE prices. Orders fill against the live feed, not a broker.
          </p>
          <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
            <li>No real orders, no demat debit, no broker needed.</li>
            <li>Holdings and trades stay on this device (per demat).</li>
            <li>Use the Portfolio toggle to compare Actual vs Yo Broker.</li>
          </ul>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/60 bg-surface px-3 py-2.5 text-sm">
          <span className="text-muted-foreground">Status</span>
          <span
            className={
              wallet.active ? "font-semibold text-gain" : "font-semibold text-muted-foreground"
            }
          >
            {wallet.active ? "Active" : "Not active"}
          </span>
        </div>
        {wallet.active ? (
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>
              Virtual cash {formatNpr(wallet.cash)} · {wallet.holdings.length} holdings ·{" "}
              {wallet.trades.length} trades
            </span>
            <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={reset}>
              <RotateCcw className="size-3" /> Reset balance
            </Button>
          </div>
        ) : null}

        <div className="flex justify-end gap-2">
          {wallet.active ? (
            <Button variant="outline" onClick={deactivate}>
              Deactivate
            </Button>
          ) : (
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
          )}
          {!wallet.active ? (
            <Button onClick={activate}>Activate Yo Broker</Button>
          ) : (
            <Button onClick={() => onOpenChange(false)}>Done</Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
