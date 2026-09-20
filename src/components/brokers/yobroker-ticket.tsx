// Yo Broker order ticket — paper trading, fills against live NEPSE feed.
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DeltaPill } from "@/components/stat-card";
import { marketSnapshotQuery } from "@/lib/queries";
import { formatNpr } from "@/lib/format";
import { cn } from "@/lib/utils";
import { loadYoWallet, saveYoWallet } from "@/lib/yobroker/store";
import { matchYoOrders, placeYoOrder } from "@/lib/yobroker/engine";

function num(v: number | null | undefined): string {
  return typeof v === "number" && Number.isFinite(v)
    ? v.toLocaleString("en-IN", { maximumFractionDigits: 2 })
    : "-";
}

export function YoOrderTicket({ symbol }: { symbol: string }) {
  const market = useQuery(marketSnapshotQuery());
  const live = market.data?.prices.find((p) => p.symbol === symbol.toUpperCase()) ?? null;
  const ltp = live?.ltp ?? null;

  const [side, setSide] = useState<"BUY" | "SELL">("BUY");
  const [qty, setQty] = useState("");
  const [price, setPrice] = useState("");
  const [orderType, setOrderType] = useState<"LMT" | "MKT">("LMT");
  const [tick, setTick] = useState(0);

  // auto-fill LMT price from LTP
  useEffect(() => {
    if (ltp !== null && price === "") setPrice(String(ltp));
  }, [ltp, symbol]);

  useEffect(() => {
    setQty("");
    setPrice("");
  }, [symbol]);

  // LMT auto-match against live feed every poll
  useEffect(() => {
    if (!live?.ltp) return;
    const map = new Map<string, number>();
    for (const p of market.data?.prices ?? []) if (p.ltp) map.set(p.symbol, p.ltp);
    const w = loadYoWallet(null);
    const openLmt = w.orders.some((o) => o.status === "open" && o.orderType === "LMT");
    if (!openLmt) return;
    const next = matchYoOrders(w, map);
    if (next !== w) {
      saveYoWallet(null, next);
      setTick((v) => v + 1);
    }
  }, [market.data, live?.ltp]);

  void tick;
  const wallet = loadYoWallet(null);
  const holding = useMemo(
    () => wallet.holdings.find((h) => h.symbol === symbol.toUpperCase()) ?? null,
    [wallet.holdings, symbol],
  );

  const q = Math.floor(Number(qty));
  const px = Number(price);
  const validQty = Number.isInteger(q) && q >= 1;
  const validPx = orderType === "MKT" || (Number.isFinite(px) && px > 0);
  const estimated =
    validQty && (orderType === "MKT" ? ltp !== null : validPx)
      ? q * (orderType === "MKT" ? (ltp ?? 0) : px)
      : null;
  const short = side === "SELL" && validQty && holding ? Math.max(0, q - holding.qty) : 0;

  const place = () => {
    const w = loadYoWallet(null);
    const res = placeYoOrder(
      w,
      { symbol, side, qty: q, price: orderType === "MKT" ? null : px, orderType },
      ltp,
    );
    if (res.error || !res.order) {
      toast.error(res.error ?? "Order failed.");
      return;
    }
    saveYoWallet(null, res.wallet);
    setTick((v) => v + 1);
    toast.success(
      res.wallet.orders[0]?.status === "filled"
        ? `Filled ${side} ${q} ${symbol} @ ${formatNpr(res.wallet.trades[0]?.price ?? px)}`
        : `Paper order placed: ${side} ${q} ${symbol}`,
    );
    setQty("");
  };

  const canPlace = validQty && validPx && short === 0;

  return (
    <div className="rounded-2xl border border-violet-500/20 bg-violet-500/5 p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="font-display text-base font-semibold">
          {symbol}{" "}
          <span className="text-xs font-normal text-muted-foreground">via Yo Broker (paper)</span>
        </p>
        <div className="text-right">
          <p className="num text-base font-semibold">{ltp !== null ? formatNpr(ltp) : "-"}</p>
          {live ? (
            <DeltaPill value={live.percentChange}>{live.percentChange.toFixed(2)}%</DeltaPill>
          ) : null}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-1 rounded-xl bg-muted/50 p-1">
        {(["BUY", "SELL"] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSide(s)}
            className={cn(
              "flex items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-bold transition-colors",
              side === s
                ? s === "BUY"
                  ? "bg-gain text-white shadow-sm"
                  : "bg-destructive text-white shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {s === "BUY" ? (
              <ArrowUpRight className="size-4" />
            ) : (
              <ArrowDownRight className="size-4" />
            )}
            {s}
          </button>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="yo-qty">Quantity</Label>
          <Input
            id="yo-qty"
            inputMode="numeric"
            placeholder="10"
            value={qty}
            onChange={(e) => setQty(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
          />
          {holding ? (
            <p className="text-[0.7rem] text-muted-foreground">
              You hold {holding.qty} {symbol} (virtual)
            </p>
          ) : (
            <p className="text-[0.7rem] text-muted-foreground">
              Virtual cash {formatNpr(wallet.cash)}
            </p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="yo-price">Price {orderType === "MKT" ? "(market)" : ""}</Label>
          <Input
            id="yo-price"
            inputMode="decimal"
            placeholder={ltp !== null ? String(ltp) : "0.00"}
            value={orderType === "MKT" ? "" : price}
            disabled={orderType === "MKT"}
            onChange={(e) => setPrice(e.target.value.replace(/[^0-9.]/g, "").slice(0, 12))}
          />
          <p className="text-[0.7rem] text-muted-foreground">
            LTP {num(ltp)} · {live ? `Prev ${num(live.previousClose)}` : ""}
          </p>
        </div>
      </div>

      <div className="mt-3 flex gap-1 rounded-lg border border-border/60 p-1">
        {(["LMT", "MKT"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setOrderType(t)}
            className={cn(
              "flex-1 rounded-md px-2 py-1 text-xs font-semibold",
              orderType === t ? "bg-violet-500/15 text-violet-600" : "text-muted-foreground",
            )}
          >
            {t === "LMT" ? "Limit" : "Market"}
          </button>
        ))}
      </div>

      <div className="mt-3 flex items-center justify-between rounded-xl bg-muted/40 px-3 py-2 text-sm">
        <span className="text-muted-foreground">Estimated value</span>
        <span className="num font-semibold">{estimated !== null ? formatNpr(estimated) : "-"}</span>
      </div>
      {short > 0 ? (
        <p className="mt-2 text-xs font-medium text-destructive">
          You hold {holding?.qty ?? 0} but selling {q}. Short {short}.
        </p>
      ) : null}

      <Button
        className={cn(
          "mt-3 w-full font-bold",
          side === "BUY"
            ? "bg-gain hover:bg-gain/90 text-white"
            : "bg-destructive hover:bg-destructive/90 text-white",
        )}
        disabled={!canPlace}
        onClick={place}
      >
        Place paper {side} order
      </Button>
      <p className="mt-2 text-[0.68rem] leading-relaxed text-muted-foreground">
        Paper fills against live NEPSE prices. No real money moves.
      </p>
    </div>
  );
}
