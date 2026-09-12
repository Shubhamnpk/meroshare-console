// Broker order ticket: live quote + depth + buy/sell on a SAVED broker connection.
// Shown only when a broker is linked; otherwise points at Settings → Advanced.
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DeltaPill } from "@/components/stat-card";
import {
  brokerAmoListQuery,
  brokerConnectionsQuery,
  brokerDepthQuery,
  brokerHoldingsQuery,
  brokerOrderBookQuery,
  brokerQuoteQuery,
  marketSnapshotQuery,
} from "@/lib/queries";
import { placeBrokerAmo, placeBrokerOrder } from "@/lib/brokers/brokers.functions";
import type { BrokerId } from "@/lib/brokers/types";
import { errorMessage, formatNpr } from "@/lib/format";
import { cn } from "@/lib/utils";

const VALIDITIES = ["DAY", "GTD", "GTC", "IOC", "FOK"] as const;

function num(v: number | null | undefined): string {
  return typeof v === "number" && Number.isFinite(v)
    ? v.toLocaleString("en-IN", { maximumFractionDigits: 2 })
    : "-";
}

export function OrderTicket({
  symbol,
  limitPrice,
}: {
  symbol: string;
  /** External limit price request (e.g. from the chart); applied on change. */
  limitPrice?: { price: number; side?: "BUY" | "SELL"; nonce: number } | null | undefined;
}) {
  const queryClient = useQueryClient();
  const connections = useQuery(brokerConnectionsQuery());
  const brokerId = (connections.data?.[0]?.brokerId ?? null) as BrokerId | null;

  const quote = useQuery({ ...brokerQuoteQuery(brokerId, symbol), refetchInterval: 20_000 });
  const depth = useQuery({ ...brokerDepthQuery(brokerId, symbol), refetchInterval: 20_000 });
  const holdings = useQuery(brokerHoldingsQuery(brokerId));
  const book = useQuery(brokerOrderBookQuery(brokerId));
  const amoList = useQuery(brokerAmoListQuery(brokerId));
  const market = useQuery(marketSnapshotQuery());

  // After-market orders: when NEPSE is closed, only limit orders with
  // standing validity queue for the next session (no market/IOC/FOK).
  const marketOpen = market.data?.status.isOpen ?? true;
  const amo = !marketOpen;

  const [side, setSide] = useState<"BUY" | "SELL">("BUY");
  const [quantity, setQuantity] = useState("");
  const [price, setPrice] = useState("");
  const [orderType, setOrderType] = useState<"LMT" | "MKT">("LMT");
  const [validity, setValidity] = useState<(typeof VALIDITIES)[number]>("DAY");
  const [validTill, setValidTill] = useState(() => new Date().toISOString().slice(0, 10));
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [placeError, setPlaceError] = useState<string | null>(null);

  const ltp = quote.data?.ltp ?? null;
  useEffect(() => {
    if (ltp !== null && price === "") setPrice(String(ltp));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ltp, symbol]);

  // Chart-driven limit price: switch to Limit and fill it in.
  useEffect(() => {
    if (limitPrice && limitPrice.price > 0) {
      if (limitPrice.side) setSide(limitPrice.side);
      setOrderType("LMT");
      setPrice(String(limitPrice.price));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [limitPrice?.nonce]);

  // AMO guardrails: market orders and instant validities need a live market.
  useEffect(() => {
    if (amo && orderType === "MKT") setOrderType("LMT");
    if (amo && (validity === "IOC" || validity === "FOK")) setValidity("DAY");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amo]);

  useEffect(() => {
    setQuantity("");
    setPrice("");
    setConfirmOpen(false);
    setPlaceError(null);
  }, [symbol]);

  const holding = useMemo(
    () => holdings.data?.find((h) => h.symbol === symbol) ?? null,
    [holdings.data, symbol],
  );
  const openOrders = useMemo(
    () =>
      (book.data ?? []).filter(
        (o) => o.symbol === symbol && /OPEN|PARTIALLY/.test(o.status.toUpperCase()),
      ),
    [book.data, symbol],
  );
  const symbolAmoOrders = useMemo(
    () => (amoList.data ?? []).filter((o) => o.scrip === symbol),
    [amoList.data, symbol],
  );

  const qty = Math.floor(Number(quantity));
  const px = Number(price);
  const validQty = Number.isInteger(qty) && qty >= 1;
  const validPx = orderType === "MKT" || (Number.isFinite(px) && px > 0);
  const amoOddLot = amo && side === "SELL" && validQty && qty < 10;
  const estimated =
    validQty && (orderType === "MKT" ? ltp !== null : validPx)
      ? qty * (orderType === "MKT" ? (ltp ?? 0) : px)
      : null;
  const shortfall =
    side === "SELL" && validQty && holding ? Math.max(0, qty - holding.availableQty) : 0;

  const place = useMutation({
    mutationFn: () => {
      if (amo) {
        const ref = ltp ?? quote.data?.close ?? px;
        return placeBrokerAmo({
          data: {
            brokerId: brokerId!,
            side,
            symbol,
            quantity: qty,
            price: px,
            ltp: ref > 0 ? ref : px,
            confirmed: true as const,
          },
        });
      }
      return placeBrokerOrder({
        data: {
          brokerId: brokerId!,
          side,
          symbol,
          quantity: qty,
          price: orderType === "MKT" ? 0 : px,
          orderType,
          validity,
          ...(validity === "GTD" ? { validTill } : {}),
          confirmed: true as const,
        },
      });
    },
    onSuccess: (r) => {
      setConfirmOpen(false);
      if (r.ok) {
        toast.success(r.message);
        setQuantity("");
        setPlaceError(null);
        void queryClient.invalidateQueries({ queryKey: ["broker-order-book"] });
        void queryClient.invalidateQueries({ queryKey: ["broker-amo-list"] });
      } else {
        // eslint-disable-next-line no-console
        console.error("[order-ticket] broker rejected order", {
          symbol,
          side,
          quantity: qty,
          price: orderType === "MKT" ? 0 : px,
          orderType,
          validity,
          amo,
          marketOpen,
          message: r.message,
        });
        setPlaceError(r.message);
        toast.error(r.message);
      }
    },
    onError: (err) => {
      const message = errorMessage(err, "Order failed.");
      // eslint-disable-next-line no-console
      console.error("[order-ticket] order request failed", {
        symbol,
        side,
        quantity: qty,
        amo,
        marketOpen,
        message,
      });
      setPlaceError(message);
      toast.error(message);
    },
  });

  if (connections.isPending || !brokerId) {
    return null;
  }

  return (
    <div id="order-ticket" className="grid scroll-mt-4 gap-3 lg:grid-cols-5">
      {/* Ticket */}
      <div className="rounded-2xl border border-border/60 bg-surface p-4 lg:col-span-3">
        <div className="flex items-center justify-between gap-2">
          <p className="font-display text-base font-semibold">
            {symbol}{" "}
            <span className="text-xs font-normal text-muted-foreground">
              via {brokerId === "naasa-x" ? "Naasa X" : brokerId}
            </span>
          </p>
          <div className="flex items-center gap-2">
            {amo ? (
              <span
                title="Market is closed. This order queues for the next session."
                className="num rounded-full bg-warning/15 px-2 py-0.5 text-[0.68rem] font-semibold text-warning"
              >
                AMO
              </span>
            ) : null}
          {quote.data ? (
            <div className="text-right">
              <p className="num text-base font-semibold">{formatNpr(quote.data.ltp ?? 0)}</p>
              <DeltaPill value={quote.data.changePercent ?? 0}>
                {quote.data.changePercent !== null
                  ? `${quote.data.changePercent.toFixed(2)}%`
                  : "-"}
              </DeltaPill>
            </div>
          ) : (
            <p
              className="text-xs text-muted-foreground"
              title={quote.error ? errorMessage(quote.error, "") : ""}
            >
              {quote.isPending
                ? "Live quote…"
                : quote.isError
                  ? `Quote failed: ${errorMessage(quote.error, "unknown")}`
                  : "Quote unavailable"}
            </p>
          )}
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
            <Label htmlFor="ticket-qty">Quantity</Label>
            <Input
              id="ticket-qty"
              inputMode="numeric"
              placeholder="10"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
            />
            {holding ? (
              <p className="text-[0.7rem] text-muted-foreground">
                You hold {holding.availableQty.toLocaleString("en-IN")} {symbol}
              </p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ticket-price">Price {orderType === "MKT" ? "(market)" : ""}</Label>
            <Input
              id="ticket-price"
              inputMode="decimal"
              placeholder={ltp !== null ? String(ltp) : "0.00"}
              value={orderType === "MKT" ? "" : price}
              disabled={orderType === "MKT"}
              onChange={(e) => setPrice(e.target.value.replace(/[^0-9.]/g, "").slice(0, 12))}
            />
            <p className="text-[0.7rem] text-muted-foreground">
              {orderType === "MKT"
                ? "Executes at the best available price."
                : `LTP ${num(ltp)} · Close ${num(quote.data?.close)}`}
            </p>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Type</Label>
            <div className="flex gap-1 rounded-lg border border-border/60 p-1">
              {(["LMT", "MKT"] as const).map((t) => {
                const off = amo && t === "MKT";
                return (
                  <button
                    key={t}
                    type="button"
                    disabled={off}
                    title={off ? "Market orders need a live market" : undefined}
                    onClick={() => setOrderType(t)}
                    className={cn(
                      "flex-1 rounded-md px-2 py-1 text-xs font-semibold transition-colors",
                      orderType === t ? "bg-primary/15 text-primary" : "text-muted-foreground",
                      off && "cursor-not-allowed opacity-40",
                    )}
                  >
                    {t === "LMT" ? "Limit" : "Market"}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Validity</Label>
            <select
              value={validity}
              onChange={(e) => setValidity(e.target.value as (typeof VALIDITIES)[number])}
              className="h-9 w-full rounded-lg border border-border/60 bg-background px-2 text-xs"
            >
              {VALIDITIES.map((v) => {
                const off = amo && (v === "IOC" || v === "FOK");
                return (
                  <option key={v} value={v} disabled={off}>
                    {v}
                    {off ? " (live only)" : ""}
                  </option>
                );
              })}
            </select>
          </div>
        </div>

        {validity === "GTD" ? (
          <div className="mt-3 space-y-1.5">
            <Label htmlFor="ticket-till">Valid till</Label>
            <Input
              id="ticket-till"
              type="date"
              value={validTill}
              onChange={(e) => setValidTill(e.target.value)}
              className="h-9"
            />
          </div>
        ) : null}

        <div className="mt-3 flex items-center justify-between rounded-xl bg-muted/40 px-3 py-2 text-sm">
          <span className="text-muted-foreground">Estimated value</span>
          <span className="num font-semibold">
            {estimated !== null ? formatNpr(estimated) : "-"}
          </span>
        </div>
        {shortfall > 0 ? (
          <p className="mt-2 text-xs font-medium text-destructive">
            You hold {holding?.availableQty ?? 0} but are selling {qty}. Short by {shortfall}.
            Intraday short-selling is blocked by the broker.
          </p>
        ) : null}
        {amoOddLot ? (
          <p className="mt-2 text-xs font-medium text-destructive">
            AMO sell needs at least 10 units. Odd-lot AMO sell is rejected by the broker.
          </p>
        ) : null}
        {placeError ? (
          <div className="mt-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3">
            <p className="text-xs font-semibold text-destructive">Order rejected</p>
            <p className="num mt-1 break-words text-xs text-muted-foreground">{placeError}</p>
            <p className="mt-1 text-[0.68rem] text-muted-foreground">
              Full detail is in the browser console ([order-ticket]). Copy it when reporting.
            </p>
          </div>
        ) : null}

        <Button
          className={cn(
            "mt-3 w-full font-bold",
            side === "BUY"
              ? "bg-gain hover:bg-gain/90 text-white"
              : "bg-destructive hover:bg-destructive/90 text-white",
          )}
          disabled={!validQty || !validPx || shortfall > 0 || amoOddLot || place.isPending}
          onClick={() => setConfirmOpen(true)}
        >
          {place.isPending ? "Sending…" : amo ? `Review ${side} order (AMO)` : `Review ${side} order`}
        </Button>
        {amo ? (
          <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
            Market is closed. This queues as an after-market order for the next session.
          </p>
        ) : null}

        {openOrders.length > 0 ? (
          <div className="mt-3 rounded-xl border border-border/60 p-2.5">
            <p className="px-1 pb-1.5 text-xs font-semibold text-muted-foreground">
              Your open orders · {symbol}
            </p>
            {openOrders.map((o) => (
              <div
                key={o.id || `${o.side}-${o.price}-${o.quantity}`}
                className="flex items-center justify-between px-1 py-1 text-xs"
              >
                <span
                  className={cn("font-bold", o.side === "BUY" ? "text-gain" : "text-destructive")}
                >
                  {o.side} {o.quantity.toLocaleString("en-IN")}
                </span>
                <span className="num text-muted-foreground">
                  @ {o.price !== null ? o.price.toLocaleString("en-IN") : "MKT"} · {o.status}
                </span>
              </div>
            ))}
          </div>
        ) : null}

        {symbolAmoOrders.length > 0 ? (
          <div className="mt-3 rounded-xl border border-warning/40 bg-warning/5 p-2.5">
            <p className="px-1 pb-1.5 text-xs font-semibold text-muted-foreground">
              Queued AMO orders · {symbol}
            </p>
            {symbolAmoOrders.map((o, i) => (
              <div
                key={o.alertName || `${o.side}-${o.price}-${o.quantity}-${i}`}
                className="flex items-center justify-between px-1 py-1 text-xs"
              >
                <span
                  className={cn("font-bold", o.side === "BUY" ? "text-gain" : "text-destructive")}
                >
                  {o.side} {o.quantity.toLocaleString("en-IN")}
                </span>
                <span className="num text-muted-foreground">
                  @ {o.price !== null ? o.price.toLocaleString("en-IN") : "-"}
                  {o.validTill ? ` · till ${o.validTill}` : ""}
                </span>
              </div>
            ))}
          </div>
        ) : null}

        <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className={cn(side === "BUY" ? "text-gain" : "text-destructive")}>
                Confirm {side} {qty.toLocaleString("en-IN")} × {symbol}
              </DialogTitle>
              <DialogDescription>
                This places a <strong>real order</strong> at your broker. Real money moves.
              </DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-2 rounded-xl bg-muted/40 p-3 text-sm">
              <span className="text-muted-foreground">Side</span>
              <span className="text-right font-bold">{side}</span>
              <span className="text-muted-foreground">Scrip</span>
              <span className="num text-right font-semibold">{symbol}</span>
              <span className="text-muted-foreground">Quantity</span>
              <span className="num text-right font-semibold">
                {validQty ? qty.toLocaleString("en-IN") : "-"}
              </span>
              <span className="text-muted-foreground">Price</span>
              <span className="num text-right font-semibold">
                {orderType === "MKT" ? "MARKET" : validPx ? num(px) : "-"}
              </span>
              <span className="text-muted-foreground">Type / Validity</span>
              <span className="text-right font-semibold">
                {orderType}
                {validity !== "DAY" ? ` · ${validity}` : ""}
              </span>
              <span className="text-muted-foreground">Est. value</span>
              <span className="num text-right font-bold">
                {estimated !== null ? formatNpr(estimated) : "-"}
              </span>
            </div>
            <Button
              className={cn(
                "w-full font-bold",
                side === "BUY"
                  ? "bg-gain hover:bg-gain/90 text-white"
                  : "bg-destructive hover:bg-destructive/90 text-white",
              )}
              disabled={place.isPending}
              onClick={() => place.mutate()}
            >
              {place.isPending ? "Placing…" : `Place ${side} order now`}
            </Button>
          </DialogContent>
        </Dialog>
      </div>

      {/* Depth */}
      <div className="rounded-2xl border border-border/60 bg-surface p-4 lg:col-span-2">
        <p className="text-sm font-semibold">Market depth</p>
        <p className="text-[0.7rem] text-muted-foreground">
          {depth.isError
            ? `Depth failed: ${errorMessage(depth.error, "unknown")}`
            : depth.data && depth.data.errorCode !== 0
              ? depth.data.message || "No depth right now. Streams during market hours."
              : "Top of book, live from your broker."}
        </p>
        <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
          <div>
            <p className="mb-1 font-semibold text-gain">Bids</p>
            {(depth.data?.bids ?? []).length === 0 ? (
              <p className="text-muted-foreground">-</p>
            ) : (
              depth.data!.bids.map((r, i) => (
                <div key={i} className="flex justify-between py-0.5 num">
                  <span>{r.quantity !== null ? r.quantity.toLocaleString("en-IN") : "-"}</span>
                  <span className="font-semibold text-gain">
                    {r.price !== null ? num(r.price) : "-"}
                  </span>
                </div>
              ))
            )}
          </div>
          <div>
            <p className="mb-1 font-semibold text-destructive">Asks</p>
            {(depth.data?.asks ?? []).length === 0 ? (
              <p className="text-muted-foreground">-</p>
            ) : (
              depth.data!.asks.map((r, i) => (
                <div key={i} className="flex justify-between py-0.5 num">
                  <span className="font-semibold text-destructive">
                    {r.price !== null ? num(r.price) : "-"}
                  </span>
                  <span>{r.quantity !== null ? r.quantity.toLocaleString("en-IN") : "-"}</span>
                </div>
              ))
            )}
          </div>
        </div>
        <div className="mt-3 space-y-1 border-t border-border/60 pt-2 text-xs text-muted-foreground">
          <div className="flex justify-between">
            <span>High / Low</span>
            <span className="num">
              {num(quote.data?.high)} / {num(quote.data?.low)}
            </span>
          </div>
          <div className="flex justify-between">
            <span>52w H / L</span>
            <span className="num">
              {num(quote.data?.weekHigh52)} / {num(quote.data?.weekLow52)}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Volume</span>
            <span className="num">
              {quote.data?.volume !== null && quote.data?.volume !== undefined
                ? quote.data.volume.toLocaleString("en-IN")
                : "-"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
