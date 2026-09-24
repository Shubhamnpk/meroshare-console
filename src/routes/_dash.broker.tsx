// Broker terminal account: overview, holdings, orders, trades and funds
// on the SAVED broker connection. Read-only except explicit order actions,
// each guarded by its own confirmation.
import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeftRight, FlaskConical, Plug, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { YoBrokerModal } from "@/components/brokers/yobroker-modal";
import { loadYoWallet, saveYoWallet } from "@/lib/yobroker/store";
import { cancelYoOrder } from "@/lib/yobroker/engine";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Panel } from "@/components/ui/panel";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  brokerAmoListQuery,
  brokerBanksQuery,
  brokerConnectionsQuery,
  brokerFundsQuery,
  brokerFundTxnsQuery,
  brokerHoldingsQuery,
  brokerMarketStatusQuery,
  brokerOrderBookQuery,
  brokerOrderHistoryQuery,
  brokerQuoteQuery,
  brokerTradeBookQuery,
  brokerTriggersQuery,
  brokerWatchlistsQuery,
  type BrokerRange,
} from "@/lib/queries";
import {
  cancelBrokerAmo,
  cancelBrokerOrder,
  getBrokerStatement,
  modifyBrokerOrder,
  placeBrokerAmo,
  requestBrokerWithdraw,
  retestBrokerConnection,
  saveBrokerWatchlist,
} from "@/lib/brokers/brokers.functions";
import { useWatchlist } from "@/lib/prefs";
import type { BrokerId } from "@/lib/brokers/types";
import { errorMessage, formatNpr, formatQty } from "@/lib/format";
import { cn } from "@/lib/utils";
import { SortableTh, sortBy, useSort } from "@/components/sortable-table";
import { PriceAlertsPanel } from "@/components/brokers/price-alerts-panel";
import { BrokerTicketsPanel } from "@/components/brokers/tickets-panel";
import { TmsReauthModal } from "@/components/brokers/tms-reauth-modal";
import { useTmsReauth } from "@/hooks/use-tms-reauth";
import { ogImage, canonicalLink } from "@/lib/seo";

export const Route = createFileRoute("/_dash/broker")({
  head: () => ({
    meta: [
      { title: "Broker Account | MeroShare Investor Console" },
      {
        name: "description",
        content: "Live broker holdings, orders, trades and funds on your linked broker terminal.",
      },
      ogImage(),
    ],
    links: [canonicalLink("/broker")],
  }),
  component: BrokerPage,
});

type BrokerTab = "overview" | "holdings" | "orders" | "trades" | "funds";

const TABS: { id: BrokerTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "holdings", label: "Holdings" },
  { id: "orders", label: "Orders" },
  { id: "trades", label: "Trades" },
  { id: "funds", label: "Funds" },
];

type Preset = "today" | "7d" | "15d" | "1m" | "custom";
const PRESETS: { id: Preset; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "7d", label: "7D" },
  { id: "15d", label: "15D" },
  { id: "1m", label: "1M" },
  { id: "custom", label: "Custom" },
];

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function rangeFor(preset: Preset, custom: { from: string; to: string }): BrokerRange {
  const today = isoDay(new Date());
  // The broker API only filters when dates are actually sent, so even
  // "Today" carries fromDate=toDate=today (mirrors the broker's own app).
  if (preset === "today") return { fromDate: today, toDate: today };
  if (preset === "custom") {
    return {
      ...(custom.from ? { fromDate: custom.from } : {}),
      ...(custom.to ? { toDate: custom.to } : {}),
    };
  }
  const days = preset === "7d" ? 7 : preset === "15d" ? 15 : 30;
  const from = new Date();
  from.setDate(from.getDate() - (days - 1));
  return { fromDate: isoDay(from), toDate: today };
}

function money(v: number | null | undefined): string {
  return typeof v === "number" && Number.isFinite(v) ? formatNpr(v) : "-";
}

const WALLET_APP_URL = "https://wallet.naasasecurities.com.np/";

/** Compact side-by-side money moves: withdraw dialog trigger + wallet redirect. */
function FundsMoveRow({
  brokerId,
  withdrawable,
  onDone,
}: {
  brokerId: BrokerId;
  withdrawable: number | null;
  onDone: () => void;
}) {
  const QUICK_MAX = 10_000;
  const QUICK_KEY = "meroshare.quick-refund.v1";
  const todayKey = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const banks = useQuery(brokerBanksQuery(brokerId));
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [armed, setArmed] = useState(false);
  const [method, setMethod] = useState<"normal" | "quick">("quick");
  const [quickUsedOn, setQuickUsedOn] = useState<string | null>(() =>
    typeof window === "undefined" ? null : window.localStorage.getItem(QUICK_KEY),
  );
  const quickUsedToday = quickUsedOn === todayKey();

  const primary = (banks.data ?? []).find((b) => b.isPrimary) ?? banks.data?.[0] ?? null;
  const amt = Math.floor(Number(amount));
  const valid = Number.isInteger(amt) && amt >= 1;
  const overLimit = valid && amt > 1_000_000;
  const over = valid && withdrawable !== null && amt > withdrawable;
  const quickOver = method === "quick" && valid && amt > QUICK_MAX;
  const quickBlockedToday = method === "quick" && quickUsedToday;

  const withdraw = useMutation({
    mutationFn: () =>
      requestBrokerWithdraw({
        data: {
          brokerId,
          amount: amt,
          isQuickRefund: method === "quick",
          confirmed: true as const,
        },
      }),
    onSuccess: (r) => {
      setArmed(false);
      if (r.ok) {
        toast.success(r.message);
        setAmount("");
        setOpen(false);
        if (method === "quick") {
          const key = todayKey();
          setQuickUsedOn(key);
          try {
            window.localStorage.setItem(QUICK_KEY, key);
          } catch {
            // storage blocked: limit just won't persist
          }
        }
        onDone();
      } else {
        toast.error(r.message);
      }
    },
    onError: (err) => {
      setArmed(false);
      toast.error(errorMessage(err, "Withdrawal failed."));
    },
  });
  const canSend =
    valid && !over && !overLimit && !quickOver && !quickBlockedToday && !withdraw.isPending;

  return (
    <div className="grid grid-cols-2 gap-2">
      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setArmed(false);
        }}
      >
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" className="w-full">
            Withdraw
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Withdraw to bank</DialogTitle>
            <DialogDescription>
              This moves <strong>real money</strong> from your broker account to your bank.
            </DialogDescription>
          </DialogHeader>
          {banks.isPending ? (
            <p className="mt-2 text-xs text-muted-foreground">Loading linked banks…</p>
          ) : (
            <div className="space-y-2.5">
              <div className="grid grid-cols-2 gap-2" role="group" aria-label="Withdrawal speed">
                {(
                  [
                    { id: "normal", label: "Standard", hint: "≈2 days" },
                    {
                      id: "quick",
                      label: "Quick refund",
                      hint: quickUsedToday ? "Used today" : "Instant · ≤ Rs. 10k",
                    },
                  ] as const
                ).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    disabled={m.id === "quick" && quickUsedToday}
                    onClick={() => {
                      setMethod(m.id);
                      setArmed(false);
                    }}
                    aria-pressed={method === m.id}
                    className={cn(
                      "rounded-xl border px-3 py-2 text-left transition-colors",
                      method === m.id
                        ? "border-primary/50 bg-primary/10"
                        : "border-border/60 hover:border-primary/30",
                    )}
                  >
                    <span
                      className={cn(
                        "block text-xs font-bold",
                        method === m.id ? "" : "text-muted-foreground",
                      )}
                    >
                      {m.label}
                    </span>
                    <span className="block text-[0.68rem] text-muted-foreground">{m.hint}</span>
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                {primary ? (
                  <>
                    To <span className="font-semibold text-foreground">{primary.bankName}</span>
                    {primary.accountNumber ? (
                      <span className="num"> · {primary.accountNumber}</span>
                    ) : null}
                  </>
                ) : (
                  "To your primary bank on file at the broker."
                )}
              </p>
              <div className="space-y-1.5">
                <div className="flex items-baseline justify-between gap-2">
                  <Label htmlFor="withdraw-amount">Amount (NPR)</Label>
                  <span className="num text-[0.68rem] text-muted-foreground">
                    Max{" "}
                    {method === "quick"
                      ? formatNpr(QUICK_MAX)
                      : (withdrawable ?? 1_000_000).toLocaleString("en-NP")}
                  </span>
                </div>
                <Input
                  id="withdraw-amount"
                  inputMode="numeric"
                  placeholder="Enter amount"
                  value={amount}
                  onChange={(e) => {
                    const next = e.target.value.replace(/[^0-9]/g, "").slice(0, 10);
                    setAmount(next);
                    const v = Math.floor(Number(next));
                    if (method === "quick" && Number.isInteger(v) && v > QUICK_MAX) {
                      setMethod("normal");
                      setArmed(false);
                      toast.message("Switched to Standard: Quick caps at Rs. 10,000.");
                    }
                  }}
                />
              </div>
              {overLimit ? (
                <p className="text-xs font-medium text-destructive">
                  Per-transaction limit is NPR 10 lakhs. Split larger amounts into multiple
                  requests.
                </p>
              ) : over ? (
                <p className="text-xs font-medium text-destructive">
                  Above the withdrawable {withdrawable!.toLocaleString("en-NP")}.
                </p>
              ) : quickOver ? (
                <p className="text-xs font-medium text-destructive">
                  Quick refund caps at {formatNpr(QUICK_MAX)}. Use Standard for larger amounts.
                </p>
              ) : quickBlockedToday ? (
                <p className="text-xs font-medium text-destructive">
                  Quick refund is once a day: already used today. Use Standard instead.
                </p>
              ) : null}
              <Button
                className="w-full font-bold"
                variant={armed ? "destructive" : "default"}
                disabled={!canSend}
                onClick={() => {
                  if (!armed) {
                    setArmed(true);
                    setTimeout(() => setArmed(false), 4000);
                    return;
                  }
                  withdraw.mutate();
                }}
              >
                {withdraw.isPending
                  ? "Submitting…"
                  : armed
                    ? `Tap again to ${method === "quick" ? "refund" : "withdraw"} ${formatNpr(amt)}`
                    : `${method === "quick" ? "Refund" : "Withdraw"} ${valid ? formatNpr(amt) : ""}`}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <Button variant="outline" size="sm" asChild className="w-full">
        <a href={WALLET_APP_URL} target="_blank" rel="noopener noreferrer">
          Add fund
        </a>
      </Button>
    </div>
  );
}

function QueryNote({ query }: { query: { isPending: boolean; isError: boolean; error: unknown } }) {
  if (query.isPending) return <p className="text-xs text-muted-foreground">Loading…</p>;
  if (query.isError)
    return (
      <p className="text-xs text-destructive">
        {errorMessage(query.error, "Could not load right now.")}
      </p>
    );
  return null;
}

type TxnSortKey = "date" | "type" | "amount" | "status";

function AmoPanel({ brokerId }: { brokerId: BrokerId }) {
  const queryClient = useQueryClient();
  const amos = useQuery(brokerAmoListQuery(brokerId));
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [armedKey, setArmedKey] = useState<string | null>(null);
  const [editKey, setEditKey] = useState<string | null>(null);
  const [eqty, setEqty] = useState("");
  const [eprice, setEprice] = useState("");

  const rows = amos.data ?? [];
  const keyOf = (o: (typeof rows)[number], i: number) =>
    o.alertName || `${o.scrip}-${o.side}-${o.price}-${o.quantity}-${i}`;
  const editing = rows.find((r, i) => keyOf(r, i) === editKey) ?? null;
  const editQuote = useQuery({
    ...brokerQuoteQuery(brokerId, editing?.scrip ?? ""),
    enabled: Boolean(editing),
  });

  const refresh = () => void queryClient.invalidateQueries({ queryKey: ["broker-amo-list"] });

  const cancelAmo = useMutation({
    mutationFn: (o: {
      alertName: string | null;
      scrip: string;
      price: number | null;
      triggerPrice: number | null;
      quantity: number;
      side: "BUY" | "SELL";
      validTill: string | null;
    }) => cancelBrokerAmo({ data: { brokerId, ...o, confirmed: true as const } }),
    onSuccess: (r) => {
      setArmedKey(null);
      if (r.ok) {
        toast.success(r.message);
        refresh();
      } else {
        toast.error(r.message);
      }
    },
    onError: (err) => {
      setArmedKey(null);
      toast.error(errorMessage(err, "AMO cancel failed."));
    },
  });

  const replaceAmo = useMutation({
    mutationFn: async () => {
      if (!editing || editing.side === "UNKNOWN") throw new Error("Nothing to replace.");
      const qty = Math.floor(Number(eqty));
      const px = Number(eprice);
      if (!Number.isInteger(qty) || qty < 1) throw new Error("Quantity must be at least 1.");
      if (!Number.isFinite(px) || px <= 0) throw new Error("Price must be positive.");
      if (editing.side === "SELL" && qty < 10) {
        throw new Error("AMO order not available for odd lot.");
      }
      const cancelled = await cancelBrokerAmo({
        data: {
          brokerId,
          alertName: editing.alertName,
          scrip: editing.scrip,
          price: editing.price,
          triggerPrice: editing.triggerPrice,
          quantity: editing.quantity,
          side: editing.side,
          validTill: editing.validTill,
          confirmed: true as const,
        },
      });
      if (!cancelled.ok) throw new Error(cancelled.message);
      const ltp = editQuote.data?.ltp ?? editQuote.data?.close ?? px;
      const placed = await placeBrokerAmo({
        data: {
          brokerId,
          side: editing.side,
          symbol: editing.scrip,
          quantity: qty,
          price: px,
          ltp: ltp > 0 ? ltp : px,
          confirmed: true as const,
        },
      });
      if (!placed.ok) {
        throw new Error(`Old order cancelled, but replacement failed: ${placed.message}`);
      }
      return placed.message;
    },
    onSuccess: (message) => {
      toast.success(message);
      setEditKey(null);
      refresh();
    },
    onError: (err) => toast.error(errorMessage(err, "Replace failed.")),
  });

  const buy = rows.filter((r) => r.side === "BUY").length;
  const sell = rows.filter((r) => r.side === "SELL").length;
  const amoIsActive = (o: (typeof rows)[number]) =>
    (o.side === "BUY" || o.side === "SELL") &&
    (!o.status ||
      !/DISABLE|INACTIVE|EXPIRED|CANCEL|REJECT|EXECUTED|COMPLETE|FILLED|CLOSED|DONE|FALSE/i.test(
        o.status,
      ));
  const amoIndexed = rows.map((o, i) => ({ o, i }));
  const amoActiveList = amoIndexed.filter(({ o }) => amoIsActive(o));
  const amoDisabledList = amoIndexed.filter(({ o }) => !amoIsActive(o));

  return (
    <Panel padding="lg" shadow className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold">
          After-market orders · {rows.length}
          <span className="ml-2 rounded-full bg-warning/15 px-2 py-0.5 text-[0.68rem] font-semibold text-warning">
            Queued for next session
          </span>
        </p>
        <p className="text-[0.7rem] text-muted-foreground">
          {buy} buy · {sell} sell ·{" "}
          {rows.reduce((s, r) => s + (r.quantity || 0), 0).toLocaleString("en-NP")} units
          {amoDisabledList.length > 0 ? ` · ${amoDisabledList.length} disabled` : ""}
        </p>
      </div>
      <QueryNote query={amos} />
      {rows.length === 0 && !amos.isPending && !amos.isError ? (
        <p className="text-xs text-muted-foreground">
          No AMO orders queued. Place one from the ticket while the market is closed.
        </p>
      ) : (
        <div className="space-y-2">
          {amoActiveList.map(({ o, i }) => {
            const key = keyOf(o, i);
            const open = openKey === key;
            const armed = armedKey === key;
            const editingThis = editKey === key;
            const active = true;
            return (
              <div
                key={key}
                className="rounded-xl border border-border/60 bg-background px-3 py-2.5"
              >
                <button
                  type="button"
                  onClick={() => {
                    setOpenKey(open ? null : key);
                    setEditKey(null);
                  }}
                  className="flex w-full items-center justify-between gap-3 text-left"
                >
                  <span className="min-w-0 text-sm">
                    <span
                      className={cn(
                        "font-bold",
                        o.side === "BUY"
                          ? "text-gain"
                          : o.side === "SELL"
                            ? "text-destructive"
                            : "",
                      )}
                    >
                      {o.side}
                    </span>{" "}
                    <span className="num font-semibold">{o.quantity.toLocaleString("en-NP")}</span>{" "}
                    <span className="font-semibold">{o.scrip}</span>{" "}
                    <span className="num text-muted-foreground">
                      @ {o.price !== null ? o.price.toLocaleString("en-NP") : "-"}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {open ? "Hide" : "Detail"}
                  </span>
                </button>
                {open ? (
                  <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 border-t border-border/60 pt-2 text-xs">
                    <div className="flex justify-between gap-2">
                      <dt className="text-muted-foreground">Alert</dt>
                      <dd className="truncate font-medium">{o.alertName ?? "-"}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-muted-foreground">Trigger</dt>
                      <dd className="num font-medium">
                        {o.triggerPrice !== null ? o.triggerPrice.toLocaleString("en-NP") : "-"}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-muted-foreground">Valid till</dt>
                      <dd className="num font-medium">{o.validTill ?? "-"}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-muted-foreground">Side</dt>
                      <dd className="font-medium">{o.side}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-muted-foreground">Status</dt>
                      <dd className="font-medium">{o.status ?? "Active"}</dd>
                    </div>
                  </dl>
                ) : null}
                {editingThis ? (
                  <div className="mt-2 grid grid-cols-2 gap-2 border-t border-border/60 pt-2">
                    <div className="space-y-1">
                      <Label htmlFor={`amo-qty-${key}`}>Quantity</Label>
                      <Input
                        id={`amo-qty-${key}`}
                        inputMode="numeric"
                        value={eqty}
                        onChange={(e) => setEqty(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`amo-price-${key}`}>Price</Label>
                      <Input
                        id={`amo-price-${key}`}
                        inputMode="decimal"
                        value={eprice}
                        onChange={(e) =>
                          setEprice(e.target.value.replace(/[^0-9.]/g, "").slice(0, 12))
                        }
                        className="h-8 text-xs"
                      />
                    </div>
                    <p className="col-span-2 text-[0.7rem] text-muted-foreground">
                      Replace cancels this order and places a new one. Live LTP is used as the
                      reference{editQuote.data?.ltp ? ` (${editQuote.data.ltp})` : ""}.
                    </p>
                    <div className="col-span-2 flex gap-2">
                      <Button
                        size="sm"
                        disabled={replaceAmo.isPending}
                        onClick={() => replaceAmo.mutate()}
                        className="text-xs"
                      >
                        {replaceAmo.isPending ? "Replacing…" : "Replace order"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditKey(null)}
                        className="text-xs"
                      >
                        Keep as is
                      </Button>
                    </div>
                  </div>
                ) : active ? (
                  <div className="mt-2 flex flex-wrap gap-2 border-t border-border/60 pt-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs"
                      onClick={() => {
                        setEditKey(key);
                        setEqty(String(o.quantity));
                        setEprice(o.price !== null ? String(o.price) : "");
                        setArmedKey(null);
                      }}
                    >
                      Edit
                    </Button>
                    {o.side !== "UNKNOWN" ? (
                      <Button
                        size="sm"
                        variant={armed ? "destructive" : "ghost"}
                        disabled={cancelAmo.isPending}
                        className={cn(
                          !armed && "text-destructive hover:text-destructive",
                          "text-xs",
                        )}
                        onClick={() => {
                          if (!armed) {
                            setArmedKey(key);
                            setTimeout(
                              () => setArmedKey((cur) => (cur === key ? null : cur)),
                              4000,
                            );
                            return;
                          }
                          cancelAmo.mutate({
                            alertName: o.alertName,
                            scrip: o.scrip,
                            price: o.price,
                            triggerPrice: o.triggerPrice,
                            quantity: o.quantity,
                            side: o.side as "BUY" | "SELL",
                            validTill: o.validTill,
                          });
                        }}
                      >
                        {armed ? "Tap again to cancel" : "Cancel"}
                      </Button>
                    ) : null}
                  </div>
                ) : (
                  <p className="mt-2 border-t border-border/60 pt-2 text-[0.7rem] text-muted-foreground">
                    {o.status ? `No actions — order is ${o.status}.` : "No actions available."}
                  </p>
                )}
              </div>
            );
          })}
          {amoDisabledList.length > 0 ? (
            <div className="border-t border-border/60 pt-2">
              <p className="text-[0.7rem] font-semibold text-muted-foreground">
                Disabled · {amoDisabledList.length}
              </p>
              <div className="mt-2 space-y-2 opacity-60">
                {amoDisabledList.map(({ o, i }) => {
                  const key = keyOf(o, i);
                  return (
                    <div
                      key={key}
                      className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-background px-3 py-2.5"
                    >
                      <span className="min-w-0 text-sm">
                        <span className="font-bold text-muted-foreground">{o.side}</span>{" "}
                        <span className="num font-semibold">
                          {o.quantity.toLocaleString("en-NP")}
                        </span>{" "}
                        <span className="font-semibold">{o.scrip}</span>{" "}
                        <span className="num text-muted-foreground">
                          @ {o.price !== null ? o.price.toLocaleString("en-NP") : "-"}
                          {o.validTill ? ` · till ${o.validTill}` : ""}
                        </span>
                      </span>
                      <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[0.68rem] font-semibold text-muted-foreground">
                        {o.status ?? "Disabled"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </Panel>
  );
}

function TriggerPanel({ brokerId }: { brokerId: BrokerId }) {
  const triggers = useQuery(brokerTriggersQuery(brokerId));
  const rows = triggers.data ?? [];
  return (
    <Panel padding="lg" shadow className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold">Trigger / stop orders · {rows.length}</p>
        <p className="text-[0.7rem] text-muted-foreground">BLAZE TriggerOrder book</p>
      </div>
      {triggers.isPending ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : triggers.isError ? (
        <p className="text-xs text-destructive">
          {errorMessage(triggers.error, "Could not load triggers.")}
        </p>
      ) : rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No pending trigger orders.
        </p>
      ) : (
        <div className="space-y-2">
          {rows.map((t) => (
            <div
              key={t.id || `${t.symbol}-${t.orderQty}-${t.orderPrice}`}
              className="rounded-xl border border-border/60 bg-background px-3 py-2.5 text-xs"
            >
              <p className="text-sm">
                <span
                  className={cn(
                    "font-bold",
                    t.side === "BUY" ? "text-gain" : "text-destructive",
                  )}
                >
                  {t.side}
                </span>{" "}
                <span className="num font-semibold">{t.orderQty.toLocaleString("en-NP")}</span>{" "}
                <span className="font-semibold">{t.symbol}</span>{" "}
                <span className="num text-muted-foreground">
                  @ {t.orderPrice !== null ? t.orderPrice.toLocaleString("en-NP") : "-"}
                </span>
              </p>
              <p className="mt-0.5 text-[0.7rem] text-muted-foreground">
                Trigger {t.triggerPrice !== null ? t.triggerPrice.toLocaleString("en-NP") : "-"} ·{" "}
                {t.status || "-"}
                {t.validTill ? ` · till ${t.validTill}` : ""}
              </p>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

function CollateralBreakdown({ funds }: { funds: import("@/lib/brokers/types").BrokerFunds }) {
  const total = funds.finalCollateral ?? 0;
  const used = funds.collateralUsed ?? 0;
  const pending = funds.pendingOrder ?? 0;
  const ledger = funds.ledgerBalance ?? 0;
  const withdrawable = funds.availableForWithdraw ?? 0;
  const unbilled = funds.unbilledSales ?? 0;

  const usedPct = total > 0 ? Math.min(100, (used / total) * 100) : 0;
  const pendingPct = total > 0 ? Math.min(100 - usedPct, (pending / total) * 100) : 0;
  const freePct = Math.max(0, 100 - usedPct - pendingPct);

  if (total <= 0) return null;

  return (
    <div className="rounded-2xl border border-border/60 bg-surface p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold">Collateral utilization</p>
          <p className="text-xs text-muted-foreground">How your {money(total)} is deployed</p>
        </div>
        <div className="text-right">
          <p className="num text-lg font-bold">{usedPct.toFixed(1)}%</p>
          <p className="text-[0.68rem] text-muted-foreground">utilized</p>
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex h-4 w-full overflow-hidden rounded-full border border-border/60 bg-background">
          {used > 0 ? (
            <div
              className="bg-primary/80 transition-all"
              style={{ width: `${usedPct}%` }}
              title={`Collateral used: ${money(used)}`}
            />
          ) : null}
          {pending > 0 ? (
            <div
              className="bg-amber-400/80 transition-all"
              style={{ width: `${pendingPct}%` }}
              title={`Pending orders: ${money(pending)}`}
            />
          ) : null}
          {freePct > 0 ? (
            <div
              className="bg-emerald-400/60 transition-all"
              style={{ width: `${freePct}%` }}
              title={`Free: ${money(total - used - pending)}`}
            />
          ) : null}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[0.68rem]">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-primary/80" />
            Used <span className="num font-semibold">{money(used)}</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-amber-400/80" />
            Pending <span className="num font-semibold">{money(pending)}</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-emerald-400/60" />
            Free <span className="num font-semibold">{money(total - used - pending)}</span>
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {[
          { label: "Ledger balance", value: ledger },
          { label: "Available to withdraw", value: withdrawable },
          { label: "Unbilled sales", value: unbilled },
        ].map((item) => (
          <div key={item.label} className="rounded-xl border border-border/60 bg-background p-2.5">
            <p className="text-[0.62rem] uppercase tracking-wide text-muted-foreground">
              {item.label}
            </p>
            <p className="num mt-0.5 text-sm font-semibold">{money(item.value)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function MarketStatusPill({ brokerId }: { brokerId: BrokerId | null }) {
  const status = useQuery(brokerMarketStatusQuery(brokerId));
  if (!brokerId || status.isPending) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 px-2.5 py-0.5 text-[0.7rem] font-medium text-muted-foreground">
        <span className="size-1.5 rounded-full bg-muted-foreground/40" />
        Market status…
      </span>
    );
  }
  if (status.isError || !status.data) return null;
  const open = status.data.isOpen;
  return (
    <span
      title={open ? "Regular session open at the broker" : "Broker-reported session state"}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[0.7rem] font-semibold",
        open
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
          : "border-border/60 bg-surface text-muted-foreground",
      )}
    >
      <span className={cn("size-1.5 rounded-full", open ? "bg-emerald-500" : "bg-amber-500")} />
      {status.data.status}
    </span>
  );
}

function DetailGrid({ rows }: { rows: [string, string][] }) {
  if (rows.length === 0) return null;
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-2">
          <dt className="text-muted-foreground">{k}</dt>
          <dd className="truncate text-right font-medium" title={v}>
            {v}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function OrderHistoryBox({
  brokerId,
  orderId,
  order,
}: {
  brokerId: BrokerId;
  orderId: string;
  order?: {
    symbol: string;
    side: string;
    quantity: number;
    price: number | null;
    status: string;
    orderType: string;
    validity: string;
    orderId: string;
    tranId: string;
    remainingQty: number;
    tradedQty?: number | null;
    amount?: number | null;
    exchangeOrderNo?: string;
    date: string;
    time: string;
  };
}) {
  const history = useQuery(brokerOrderHistoryQuery(brokerId, orderId));
  const detailRows: [string, string][] = order
    ? (
        [
          ["Scrip", order.symbol],
          ["Side", order.side],
          ["Quantity", String(order.quantity)],
          ["Price", order.price !== null ? String(order.price) : "MKT"],
          ["Filled", order.tradedQty != null && order.tradedQty > 0 ? String(order.tradedQty) : ""],
          ["Remaining", String(order.remainingQty)],
          ["Amount", order.amount != null ? String(order.amount) : ""],
          ["Status", order.status],
          ["Type", `${order.orderType} · ${order.validity}`],
          ["Date", [order.date, order.time].filter(Boolean).join(" ") || "-"],
          ["Exch. order", order.exchangeOrderNo || ""],
          ["Order ID", order.orderId || orderId],
          ["Tran ID", order.tranId || orderId],
        ] as [string, string][]
      ).filter(([, v]) => v !== "")
    : [];
  if (history.isPending) {
    return (
      <div className="mt-2 border-t border-border/60 pt-2">
        <DetailGrid rows={detailRows} />
        <p className="mt-2 text-[0.7rem] text-muted-foreground">Loading timeline…</p>
      </div>
    );
  }
  if (history.isError) {
    return (
      <div className="mt-2 border-t border-border/60 pt-2">
        <DetailGrid rows={detailRows} />
        <p className="mt-2 text-[0.7rem] text-muted-foreground">
          Timeline unavailable.{" "}
          <button
            type="button"
            className="font-semibold text-primary hover:underline"
            onClick={() => void history.refetch()}
          >
            Retry
          </button>
        </p>
      </div>
    );
  }
  const events = history.data ?? [];
  if (events.length === 0) {
    return (
      <div className="mt-2 border-t border-border/60 pt-2">
        <DetailGrid rows={detailRows} />
        <p className="mt-2 text-[0.7rem] text-muted-foreground">
          No lifecycle events returned — details above are from the order book.
        </p>
      </div>
    );
  }
  return (
    <div className="mt-2 border-t border-border/60 pt-2">
      <DetailGrid rows={detailRows} />
      <ol className="mt-2 space-y-0 border-t border-border/60 pt-2">
      {events.map((e, i) => (
        <li key={i} className="flex gap-2.5 text-[0.7rem]">
          <span className="flex flex-col items-center" aria-hidden>
            <span className="mt-1 size-1.5 shrink-0 rounded-full bg-primary" />
            {i < events.length - 1 ? <span className="w-px flex-1 bg-border/70" /> : null}
          </span>
          <div className="min-w-0 flex-1 pb-2">
            <p className="font-semibold">
              {e.status || "Update"}
              {e.price !== null && e.price !== undefined ? (
                <span className="num font-normal text-muted-foreground">
                  {` @ ${e.price.toLocaleString("en-NP")}`}
                </span>
              ) : null}
            </p>
            <p className="num text-muted-foreground">
              {[
                e.quantity !== null ? `qty ${e.quantity}` : null,
                e.tradedQty !== null ? `filled ${e.tradedQty}` : null,
                e.remainingQty !== null ? `left ${e.remainingQty}` : null,
              ]
                .filter(Boolean)
                .join(" · ") || "-"}
              {[e.date, e.time].filter(Boolean).join(" ").trim()
                ? ` · ${[e.date, e.time].filter(Boolean).join(" ")}`
                : ""}
            </p>
            {e.message ? (
              <p className="truncate text-muted-foreground" title={e.message}>
                {e.message}
              </p>
            ) : null}
          </div>
        </li>
      ))}
      </ol>
    </div>
  );
}

function BrokerPage() {
  const queryClient = useQueryClient();
  const connections = useQuery(brokerConnectionsQuery());
  const [yoOpen, setYoOpen] = useState(false);
  const [yoTick, setYoTick] = useState(0);
  const [yoSymbol, setYoSymbol] = useState("NABIL");
  useEffect(() => {
    const bump = () => setYoTick((v) => v + 1);
    window.addEventListener("yobroker:change", bump);
    window.addEventListener("storage", bump);
    return () => {
      window.removeEventListener("yobroker:change", bump);
      window.removeEventListener("storage", bump);
    };
  }, []);
  void yoTick;
  const yoActive = (() => {
    try {
      return loadYoWallet(null).active;
    } catch {
      return false;
    }
  })();
  const realId = (connections.data?.find((c) => c.brokerId !== "yobroker")?.brokerId ?? null) as BrokerId | null;
  const [brokerView, setBrokerView] = useState<"real" | "yobroker">("real");
  useEffect(() => {
    if (yoActive && !realId) setBrokerView("yobroker");
    else if (realId) setBrokerView("real");
  }, [yoActive, realId]);
  const brokerId: BrokerId | null =
    brokerView === "yobroker" && yoActive ? ("yobroker" as BrokerId) : realId;
  const connection = connections.data?.find((c) => c.brokerId === brokerId) ?? connections.data?.[0] ?? null;

  const [tab, setTab] = useState<BrokerTab>("funds");
  const [preset, setPreset] = useState<Preset>("today");
  const [custom, setCustom] = useState({ from: "", to: "" });
  const [txnPreset, setTxnPreset] = useState<Preset>("today");
  const [txnCustom, setTxnCustom] = useState({ from: "", to: "" });
  const [holdingSearch, setHoldingSearch] = useState("");
  const [txnSearch, setTxnSearch] = useState("");
  const [txnType, setTxnType] = useState("");
  const [txnStatus, setTxnStatus] = useState("");
  const [txnPage, setTxnPage] = useState(1);
  const [armedCancel, setArmedCancel] = useState<string | null>(null);
  const [histKey, setHistKey] = useState<string | null>(null);
  const [exportingStatement, setExportingStatement] = useState(false);
  const { reauthOpen, setReauthOpen, handleSessionError } = useTmsReauth();

  const exportStatement = async () => {
    if (!brokerId || exportingStatement) return;
    setExportingStatement(true);
    try {
      const rows = await getBrokerStatement({ data: { brokerId, ...txnRange } });
      const cell = (v: string | number | null): string => {
        if (v === null) return "";
        const s = String(v).replace(/"/g, '""');
        return /[",\n]/.test(s) ? `"${s}"` : s;
      };
      const csv = [
        "date,narration,debit,credit,balance",
        ...rows.map((r) => [r.date, r.narration, r.debit, r.credit, r.balance].map(cell).join(",")),
      ].join("\n");
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `broker-statement-${txnRange.fromDate ?? "all"}_${txnRange.toDate ?? "all"}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${rows.length} statement rows.`);
    } catch (err) {
      toast.error(errorMessage(err, "Statement export failed."));
    } finally {
      setExportingStatement(false);
    }
  };

  const range = useMemo(() => rangeFor(preset, custom), [preset, custom]);
  const txnRange = useMemo(() => rangeFor(txnPreset, txnCustom), [txnPreset, txnCustom]);

  const funds = useQuery(brokerFundsQuery(brokerId));
  const holdings = useQuery(brokerHoldingsQuery(brokerId));
  const orders = useQuery(brokerOrderBookQuery(brokerId, range));
  const trades = useQuery(brokerTradeBookQuery(brokerId, range));

  // Watch for TMS session expiry across key queries and trigger re-auth.
  useEffect(() => {
    for (const q of [holdings, orders, trades, funds]) {
      if (q.isError) handleSessionError(q.error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to error state changes
  }, [holdings.isError, orders.isError, trades.isError, funds.isError]);
  const fundTxns = useQuery(
    brokerFundTxnsQuery(brokerId, {
      ...(txnSearch.trim() ? { search: txnSearch.trim() } : {}),
      ...(txnType ? { transactionType: txnType } : {}),
      ...(txnStatus ? { status: txnStatus } : {}),
      ...txnRange,
      page: txnPage,
    }),
  );

  type HoldingSortKey = "symbol" | "availableQty" | "closePrice" | "marketValue";
  const { sort: holdingSort, toggle: toggleHoldingSort } = useSort<HoldingSortKey>(
    { key: "marketValue", dir: "desc" },
    { symbol: "text", availableQty: "number", closePrice: "number", marketValue: "number" },
  );

  type TradeSortKey =
    "id" | "orderNo" | "symbol" | "side" | "quantity" | "price" | "amount" | "date";
  const { sort: tradeSort, toggle: toggleTradeSort } = useSort<TradeSortKey>(
    { key: "date", dir: "desc" },
    {
      id: "text",
      orderNo: "text",
      symbol: "text",
      side: "text",
      quantity: "number",
      price: "number",
      amount: "number",
      date: "text",
    },
  );

  const { sort: txnSort, toggle: toggleTxnSort } = useSort<TxnSortKey>(
    { key: "date", dir: "desc" },
    { date: "text", type: "text", amount: "number", status: "text" },
  );

  const sortedTxns = useMemo(() => {
    const rows = [...(fundTxns.data?.rows ?? [])];
    const getter = (t: (typeof rows)[number]): string | number => {
      switch (txnSort.key) {
        case "date":
          return t.date ?? "";
        case "type":
          return t.type ?? "";
        case "amount":
          return t.amount ?? Number.NEGATIVE_INFINITY;
        case "status":
          return t.status ?? "";
        default:
          return "";
      }
    };
    return sortBy(rows, getter, txnSort.dir);
  }, [fundTxns.data?.rows, txnSort]);

  const refreshAll = () => {
    for (const k of [
      "broker-funds",
      "broker-holdings",
      "broker-order-book",
      "broker-trade-book",
      "broker-fund-txns",
      "broker-amo-list",
    ]) {
      void queryClient.invalidateQueries({ queryKey: [k] });
    }
  };

  useEffect(() => {
    setTxnPage(1);
  }, [txnPreset, txnCustom, txnSearch, txnType, txnStatus]);

  const retest = useMutation({
    mutationFn: () => retestBrokerConnection({ data: { brokerId: brokerId! } }),
    onSuccess: (r) =>
      r.ok
        ? toast.success(`Signed in as ${r.displayName ?? "broker user"}.`)
        : toast.error(r.error ?? "Retest failed."),
    onError: (err) => toast.error(errorMessage(err, "Retest failed.")),
  });

  const cancel = useMutation({
    mutationFn: async (o: {
      orderId: string;
      tranId: string;
      orderStatus: string;
      buySellType: string;
      deliveryFlag: string;
      orderTerms: string;
      price: string;
      quantity: number;
      symbol: string;
    }) => {
      if (brokerId === "yobroker") {
        const w = loadYoWallet(null);
        const next = cancelYoOrder(w, o.orderId || o.tranId);
        saveYoWallet(null, next);
        const changed = next.orders.find((x) => x.id === (o.orderId || o.tranId))?.status === "cancelled";
        return { ok: changed, message: changed ? "Paper order cancelled." : "Order not found or already closed." } as Awaited<ReturnType<typeof cancelBrokerOrder>>;
      }
      return cancelBrokerOrder({ data: { brokerId: brokerId!, ...o, confirmed: true as const } });
    },
    onSuccess: (r) => {
      setArmedCancel(null);
      if (r.ok) {
        toast.success(r.message);
        void queryClient.invalidateQueries({ queryKey: ["broker-order-book"] });
        if (brokerId === "yobroker") setYoTick((v) => v + 1);
      } else {
        toast.error(r.message);
      }
    },
    onError: (err) => {
      setArmedCancel(null);
      toast.error(errorMessage(err, "Cancel failed."));
    },
  });

  const modify = useMutation({
    mutationFn: (o: {
      tranId: string;
      orderId: string;
      orderStatus: string;
      remainingQty: number;
      side: "BUY" | "SELL";
      symbol: string;
      quantity: number;
      price: number;
      orderType: "LMT" | "MKT";
      validity: string;
      validTill?: string;
    }) =>
      modifyBrokerOrder({
        data: {
          brokerId: brokerId!,
          ...o,
          validity: o.validity as "DAY" | "GTD" | "GTC" | "IOC" | "FOK",
          ...(o.validity === "GTD" && o.validTill ? { validTill: o.validTill } : {}),
          confirmed: true as const,
        },
      }),
    onSuccess: (r) => {
      if (r.ok) {
        toast.success(r.message);
        setModKey(null);
        void queryClient.invalidateQueries({ queryKey: ["broker-order-book"] });
      } else {
        toast.error(r.message);
      }
    },
    onError: (err) => toast.error(errorMessage(err, "Modify failed.")),
  });

  const [armedAll, setArmedAll] = useState(false);
  const cancelAll = useMutation({
    mutationFn: async () => {
      const rows = (orders.data ?? []).filter((o) =>
        /OPEN|PARTIALLY|ACCEPTED|QUEUED|PENDING/.test(o.status.toUpperCase()),
      );
      const targets = rows.filter((o) => o.orderId || o.tranId || o.id);
      // AMO orders live outside the order book — include the cached AMO list
      // so "Cancel all" actually clears them too.
      const amoCached =
        queryClient.getQueryData<{ alertName: string | null; scrip: string }[] | undefined>([
          "broker-amo-list",
          brokerId,
        ]) ?? [];
      if (targets.length === 0 && amoCached.length === 0)
        throw new Error("No open or AMO orders to cancel.");
      let ok = 0;
      let total = 0;
      const failed: string[] = [];
      for (const o of targets) {
        total++;
        const cid = o.orderId || o.tranId || o.id;
        try {
          const r =
            brokerId === "yobroker"
              ? (() => {
                  const w = loadYoWallet(null);
                  const next = cancelYoOrder(w, cid);
                  saveYoWallet(null, next);
                  const changed =
                    next.orders.find((x) => x.id === cid)?.status === "cancelled";
                  return { ok: changed, message: changed ? "cancelled" : "not found" };
                })()
              : await cancelBrokerOrder({
                  data: {
                    brokerId: brokerId!,
                    orderId: o.orderId || cid,
                    tranId: o.tranId || cid,
                    orderStatus: o.orderStatus || o.status,
                    buySellType: o.side === "SELL" ? "Sell" : ("Buy" as const),
                    deliveryFlag: o.deliveryFlag,
                    orderTerms: o.validity,
                    price: o.price !== null ? String(o.price) : "0",
                    quantity: Math.max(1, Math.floor(o.remainingQty || o.quantity)),
                    symbol: o.symbol,
                    confirmed: true as const,
                  },
                });
          if (r.ok) ok++;
          else failed.push(o.symbol);
        } catch {
          failed.push(o.symbol);
        }
      }
      if (brokerId !== "yobroker") {
        const amoRows =
          queryClient.getQueryData<
            {
              alertName: string | null;
              scrip: string;
              price: number | null;
              triggerPrice: number | null;
              quantity: number;
              side: "BUY" | "SELL" | "UNKNOWN";
              validTill: string | null;
            }[]
          >(["broker-amo-list", brokerId]) ?? [];
        for (const a of amoRows) {
          if (a.side !== "BUY" && a.side !== "SELL") continue;
          total++;
          try {
            const r = await cancelBrokerAmo({
              data: {
                brokerId: brokerId!,
                alertName: a.alertName,
                scrip: a.scrip,
                price: a.price,
                triggerPrice: a.triggerPrice,
                quantity: a.quantity,
                side: a.side,
                validTill: a.validTill,
                confirmed: true as const,
              },
            });
            if (r.ok) ok++;
            else failed.push(`AMO:${a.scrip}`);
          } catch {
            failed.push(`AMO:${a.scrip}`);
          }
        }
      }
      return { ok, total, failed };
    },
    onSuccess: ({ ok, total, failed }) => {
      setArmedAll(false);
      void queryClient.invalidateQueries({ queryKey: ["broker-order-book"] });
      void queryClient.invalidateQueries({ queryKey: ["broker-amo-list"] });
      if (brokerId === "yobroker") setYoTick((v) => v + 1);
      if (ok === total) toast.success(`Cancelled ${ok} order${ok === 1 ? "" : "s"} (incl. AMO).`);
      else toast.error(`Cancelled ${ok}/${total}. Failed: ${failed.join(", ") || "-"}.`);
    },
    onError: (err) => {
      setArmedAll(false);
      toast.error(errorMessage(err, "Cancel-all failed."));
    },
  });

  const [modKey, setModKey] = useState<string | null>(null);
  const [mqty, setMqty] = useState("");
  const [mprice, setMprice] = useState("");
  const [mtill, setMtill] = useState(() => new Date().toISOString().slice(0, 10));

  const holdingRows = useMemo(() => {
    const term = holdingSearch.trim().toLowerCase();
    const rows = holdings.data ?? [];
    const filtered = !term ? rows : rows.filter((h) => h.symbol.toLowerCase().includes(term));
    const getter = (h: (typeof filtered)[number]): string | number => {
      switch (holdingSort.key) {
        case "symbol":
          return h.symbol;
        case "availableQty":
          return h.availableQty;
        case "closePrice":
          return h.closePrice ?? 0;
        case "marketValue":
          return h.marketValue ?? 0;
        default:
          return "";
      }
    };
    return sortBy(filtered, getter, holdingSort.dir);
  }, [holdings.data, holdingSearch, holdingSort]);

  const openOrders = useMemo(
    () =>
      (orders.data ?? []).filter((o) =>
        /OPEN|PARTIALLY|ACCEPTED|QUEUED|PENDING/.test(o.status.toUpperCase()),
      ),
    [orders.data],
  );

  const orderSummary = useMemo(() => {
    const rows = orders.data ?? [];
    let buy = 0;
    let sell = 0;
    let buyQty = 0;
    let sellQty = 0;
    for (const o of rows) {
      if (o.side === "BUY") {
        buy++;
        buyQty += o.quantity;
      } else if (o.side === "SELL") {
        sell++;
        sellQty += o.quantity;
      }
    }
    return { total: rows.length, open: openOrders.length, buy, sell, buyQty, sellQty };
  }, [orders.data, openOrders.length]);

  const tradeSummary = useMemo(() => {
    const rows = trades.data ?? [];
    let buyQty = 0;
    let sellQty = 0;
    let buyVal = 0;
    let sellVal = 0;
    for (const t of rows) {
      const val = (t.price ?? 0) * t.quantity;
      if (t.side === "BUY") {
        buyQty += t.quantity;
        buyVal += val;
      } else if (t.side === "SELL") {
        sellQty += t.quantity;
        sellVal += val;
      }
    }
    return { count: rows.length, buyQty, sellQty, buyVal, sellVal, net: buyVal - sellVal };
  }, [trades.data]);

  if (connections.isPending) {
    return <p className="text-sm text-muted-foreground">Checking broker connections…</p>;
  }

  if ((!brokerId || !connection) && !yoActive) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="font-display text-2xl font-semibold sm:text-3xl">Broker Account</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your live trading account, once linked.
          </p>
        </div>
        <div className="flex flex-col gap-3 rounded-2xl border border-dashed border-border/70 bg-surface p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
              <Plug className="size-5" />
            </span>
            <div>
              <p className="text-sm font-semibold">No broker connected</p>
              <p className="text-xs text-muted-foreground">
                Link a broker terminal to see live holdings, orders, trades and funds here.
              </p>
            </div>
          </div>
          <Button size="sm" asChild className="shrink-0">
            <Link to="/settings" search={{ tab: "advanced" }}>
              Connect broker
            </Link>
          </Button>
        </div>

        <div className="flex flex-col gap-3 rounded-2xl border border-violet-500/20 bg-violet-500/5 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-violet-500/20 bg-violet-500/10 text-violet-600">
              <FlaskConical className="size-5" />
            </span>
            <div>
              <p className="text-sm font-semibold">Yo Broker — paper trading</p>
              <p className="text-xs text-muted-foreground">
                Practice with virtual Rs 1,000,000. No real money, no settlement.
                {yoActive ? " Active on this device." : ""}
              </p>
            </div>
          </div>
          <Button
            size="sm"
            variant={yoActive ? "outline" : "default"}
            className="shrink-0"
            onClick={() => setYoOpen(true)}
          >
            {yoActive ? "Manage" : "Activate Yo Broker"}
          </Button>
        </div>
        <YoBrokerModal open={yoOpen} onOpenChange={setYoOpen} />
      </div>
    );
  }

  const f = funds.data ?? null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold sm:text-3xl">Broker Account</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {connection?.displayName ?? connection?.username ?? (brokerId === "yobroker" ? "Yo Broker (Paper)" : "-")} ·{" "}
            {connection?.username ?? (brokerId === "yobroker" ? "paper@yo.local" : "-")}
          </p>
          <div className="mt-2">
            <MarketStatusPill brokerId={brokerId} />
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={refreshAll}
            disabled={
              funds.isFetching || holdings.isFetching || orders.isFetching || trades.isFetching
            }
            className="gap-1.5 text-xs"
          >
            <RefreshCw
              className={`size-3.5 ${funds.isFetching || holdings.isFetching || orders.isFetching || trades.isFetching ? "animate-spin" : ""}`}
            />{" "}
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={retest.isPending}
            onClick={() => retest.mutate()}
            className="gap-1.5 text-xs"
          >
            {retest.isPending ? "Testing…" : "Retest login"}
          </Button>
          <Button
            variant={yoActive ? "default" : "outline"}
            size="sm"
            onClick={() => setYoOpen(true)}
            className="gap-1.5 text-xs"
          >
            <FlaskConical className="size-3.5" /> Yo Broker{yoActive ? " · On" : ""}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-1 rounded-xl border border-border/60 bg-surface p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
              tab === t.id
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                label: "Holdings",
                value: `${(holdings.data ?? []).length} scrips`,
                sub: "broker demat",
              },
              {
                label: "Open orders",
                value: String(orderSummary.open),
                sub: `${orderSummary.total} in range`,
              },
              {
                label: "Trades (range)",
                value: String(tradeSummary.count),
                sub: `net ${money(tradeSummary.net)}`,
              },
              { label: "Collateral", value: money(f?.finalCollateral), sub: "deployable now" },
            ].map((c) => (
              <div key={c.label} className="rounded-2xl border border-border/60 bg-surface p-4">
                <p className="text-[0.68rem] uppercase tracking-wide text-muted-foreground">
                  {c.label}
                </p>
                <p className="num mt-1 text-xl font-bold">
                  {funds.isPending && c.label === "Collateral" ? "…" : c.value}
                </p>
                <p className="text-[0.7rem] text-muted-foreground">{c.sub}</p>
              </div>
            ))}
          </div>
          {f && !funds.isPending ? <CollateralBreakdown funds={f} /> : null}
          <PriceAlertsPanel />
          <BrokerTicketsPanel brokerId={brokerId} />
        </div>
      ) : null}

      {tab === "holdings" ? (
        <Panel padding="lg" shadow className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold">Holdings · {(holdingRows ?? []).length}</p>
            <Input
              value={holdingSearch}
              onChange={(e) => setHoldingSearch(e.target.value)}
              placeholder="Filter scrips…"
              className="h-8 w-44 text-xs"
            />
          </div>
          <QueryNote query={holdings} />
          {(holdingRows ?? []).length === 0 && !holdings.isPending && !holdings.isError ? (
            <p className="text-xs text-muted-foreground">No holdings match.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-surface">
                  <TableRow>
                    <SortableTh
                      label="Scrip"
                      active={holdingSort.key === "symbol"}
                      dir={holdingSort.dir}
                      onClick={() => toggleHoldingSort("symbol")}
                      kind="text"
                    />
                    <SortableTh
                      label="Avail. qty"
                      active={holdingSort.key === "availableQty"}
                      dir={holdingSort.dir}
                      onClick={() => toggleHoldingSort("availableQty")}
                      align="right"
                    />
                    <SortableTh
                      label="Close"
                      active={holdingSort.key === "closePrice"}
                      dir={holdingSort.dir}
                      onClick={() => toggleHoldingSort("closePrice")}
                      align="right"
                    />
                    <SortableTh
                      label="Market value"
                      active={holdingSort.key === "marketValue"}
                      dir={holdingSort.dir}
                      onClick={() => toggleHoldingSort("marketValue")}
                      align="right"
                    />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {holdingRows.map((h) => (
                    <TableRow key={h.symbol}>
                      <TableCell className="py-2 font-semibold">{h.symbol}</TableCell>
                      <TableCell className="num py-2 text-right">
                        {h.availableQty.toLocaleString("en-NP")}
                      </TableCell>
                      <TableCell className="num py-2 text-right">
                        {h.closePrice !== null ? money(h.closePrice) : "-"}
                      </TableCell>
                      <TableCell className="num py-2 text-right font-semibold">
                        {money(h.marketValue)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </Panel>
      ) : null}

      {tab === "orders" || tab === "trades" ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex gap-1 rounded-lg border border-border/60 bg-surface p-1">
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPreset(p.id)}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-xs font-semibold transition-colors",
                    preset === p.id ? "bg-primary/15 text-primary" : "text-muted-foreground",
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
            {preset === "custom" ? (
              <div className="flex items-center gap-2 text-xs">
                <Input
                  type="date"
                  value={custom.from}
                    onChange={(e) =>
                      setCustom((c) => ({
                        ...c,
                        from: e.target.value,
                        to: c.to || (e.target.value ? isoDay(new Date()) : c.to),
                      }))
                    }
                  className="h-8 text-xs"
                  aria-label="From date"
                />
                <span className="text-muted-foreground">→</span>
                <Input
                  type="date"
                  value={custom.to}
                  onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))}
                  className="h-8 text-xs"
                  aria-label="To date"
                />
              </div>
            ) : null}
          </div>

          {tab === "orders" ? (
            <Panel padding="lg" shadow className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold">Orders · {orderSummary.total}</p>
                <div className="flex items-center gap-2">
                  <p className="text-[0.7rem] text-muted-foreground">
                    {orderSummary.open} open · {orderSummary.buy} buy (
                    {orderSummary.buyQty.toLocaleString("en-NP")}) · {orderSummary.sell} sell (
                    {orderSummary.sellQty.toLocaleString("en-NP")})
                  </p>
                  {orderSummary.open > 0 ? (
                    <Button
                      variant={armedAll ? "destructive" : "outline"}
                      size="sm"
                      disabled={cancelAll.isPending}
                      className="text-xs"
                      onClick={() => {
                        if (!armedAll) {
                          setArmedAll(true);
                          setTimeout(() => setArmedAll(false), 4000);
                          return;
                        }
                        cancelAll.mutate();
                      }}
                    >
                      {cancelAll.isPending
                        ? "Cancelling…"
                        : armedAll
                          ? `Tap again: cancel ${orderSummary.open}`
                          : "Cancel all"}
                    </Button>
                  ) : null}
                </div>
              </div>
              <QueryNote query={orders} />
              {(orders.data ?? []).length === 0 && !orders.isPending && !orders.isError ? (
                <p className="text-xs text-muted-foreground">No orders in this range.</p>
              ) : (
                <div className="space-y-2">
                  {(orders.data ?? []).map((o) => {
                    const key = o.id || `${o.symbol}-${o.side}-${o.price}`;
                    const armed = armedCancel === key;
                    const modifying = modKey === key;
                    const canonicalId = o.orderId || o.tranId || o.id;
                    const cancellable = Boolean(
                      canonicalId &&
                        (o.remainingQty || o.quantity) > 0 &&
                        /OPEN|PARTIALLY|ACCEPTED|QUEUED|PENDING/.test(o.status.toUpperCase()),
                    );
                    const isMktRow = o.orderType === "MKT" || o.orderType === "MARKET";
                    return (
                      <div
                        key={key}
                        className="rounded-xl border border-border/60 bg-background px-3 py-2.5"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm">
                              <span
                                className={cn(
                                  "font-bold",
                                  o.side === "BUY" ? "text-gain" : "text-destructive",
                                )}
                              >
                                {o.side}
                              </span>{" "}
                              <span className="num font-semibold">
                                {o.quantity.toLocaleString("en-NP")}
                              </span>{" "}
                              <span className="font-semibold">{o.symbol}</span>{" "}
                              <span className="num text-muted-foreground">
                                @ {o.price !== null ? o.price.toLocaleString("en-NP") : "MKT"}
                              </span>
                            </p>
                            <p className="text-[0.7rem] text-muted-foreground">
                              {o.status} · {o.orderType} · {o.validity}
                              {o.tradedQty != null && o.tradedQty > 0
                                ? ` · filled ${o.tradedQty.toLocaleString("en-NP")}`
                                : ""}
                              {o.date ? ` · ${o.date}` : ""}
                              {o.time ? ` ${o.time}` : ""}
                            </p>
                          </div>
                          {cancellable ? (
                            <div className="flex shrink-0 gap-1.5">
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={cancel.isPending || modify.isPending}
                                className="text-xs"
                                onClick={() => {
                                  if (modifying) {
                                    setModKey(null);
                                  } else {
                                    setModKey(key);
                                    setMqty(
                                      String(Math.max(1, Math.floor(o.remainingQty || o.quantity))),
                                    );
                                    setMprice(o.price !== null ? String(o.price) : "");
                                    setMtill(new Date().toISOString().slice(0, 10));
                                    setArmedCancel(null);
                                  }
                                }}
                              >
                                {modifying ? "Close" : "Modify"}
                              </Button>
                              <Button
                                variant={armed ? "destructive" : "outline"}
                                size="sm"
                                disabled={cancel.isPending || modify.isPending}
                                className="text-xs"
                                onClick={() => {
                                  if (!armed) {
                                    setArmedCancel(key);
                                    setTimeout(
                                      () => setArmedCancel((cur) => (cur === key ? null : cur)),
                                      4000,
                                    );
                                    return;
                                  }
                                  cancel.mutate({
                                    orderId: o.orderId || canonicalId,
                                    tranId: o.tranId || canonicalId,
                                    orderStatus: o.orderStatus || o.status,
                                    buySellType: o.side === "SELL" ? "Sell" : "Buy",
                                    deliveryFlag: o.deliveryFlag,
                                    orderTerms: o.validity,
                                    price: o.price !== null ? String(o.price) : "0",
                                    quantity: Math.max(1, Math.floor(o.remainingQty || o.quantity)),
                                    symbol: o.symbol,
                                  });
                                }}
                              >
                                {armed ? "Tap again to cancel" : "Cancel"}
                              </Button>
                            </div>
                          ) : null}
                          {canonicalId ? (
                            <div className="flex shrink-0">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-xs text-muted-foreground"
                                onClick={() => setHistKey((cur) => (cur === key ? null : cur))}
                              >
                                {histKey === key ? "Hide details" : "Details"}
                              </Button>
                            </div>
                          ) : null}
                        </div>
                        {histKey === key && canonicalId && brokerId ? (
                          <OrderHistoryBox brokerId={brokerId} orderId={canonicalId} order={o} />
                        ) : null}
                        {modifying && cancellable && o.side !== "UNKNOWN" ? (
                          <div className="mt-2 grid grid-cols-2 gap-2 border-t border-border/60 pt-2">
                            <div className="space-y-1">
                              <Label htmlFor={`mod-qty-${key}`}>
                                Quantity (max{" "}
                                {Math.floor(o.remainingQty || o.quantity).toLocaleString("en-NP")})
                              </Label>
                              <Input
                                id={`mod-qty-${key}`}
                                inputMode="numeric"
                                value={mqty}
                                onChange={(e) =>
                                  setMqty(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))
                                }
                                className="h-8 text-xs"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label htmlFor={`mod-price-${key}`}>Price</Label>
                              <Input
                                id={`mod-price-${key}`}
                                inputMode="decimal"
                                value={mprice}
                                disabled={isMktRow}
                                onChange={(e) =>
                                  setMprice(e.target.value.replace(/[^0-9.]/g, "").slice(0, 12))
                                }
                                className="h-8 text-xs"
                              />
                            </div>
                            {o.validity === "GTD" ? (
                              <div className="col-span-2 space-y-1">
                                <Label htmlFor={`mod-till-${key}`}>Valid till</Label>
                                <Input
                                  id={`mod-till-${key}`}
                                  type="date"
                                  value={mtill}
                                  onChange={(e) => setMtill(e.target.value)}
                                  className="h-8 text-xs"
                                />
                              </div>
                            ) : null}
                            <p className="col-span-2 text-[0.7rem] text-muted-foreground">
                              Sends a real modify for the remaining{" "}
                              {Math.floor(o.remainingQty || o.quantity).toLocaleString("en-NP")}{" "}
                              units. If the order changed at the broker meanwhile, you&apos;ll be
                              asked to refresh.
                            </p>
                            <div className="col-span-2">
                              <Button
                                size="sm"
                                disabled={modify.isPending}
                                className="text-xs"
                                onClick={() => {
                                  if (o.side !== "BUY" && o.side !== "SELL") return;
                                  const qty = Math.floor(Number(mqty));
                                  const px = Number(mprice);
                                  modify.mutate({
                                    tranId: o.tranId || canonicalId,
                                    orderId: o.orderId || canonicalId,
                                    orderStatus: o.orderStatus || o.status,
                                    remainingQty: o.remainingQty || o.quantity,
                                    side: o.side,
                                    symbol: o.symbol,
                                    quantity: qty,
                                    price: isMktRow ? 0 : px,
                                    orderType: isMktRow ? "MKT" : "LMT",
                                    validity: o.validity,
                                    ...(o.validity === "GTD" ? { validTill: mtill } : {}),
                                  });
                                }}
                              >
                                {modify.isPending ? "Modifying…" : "Confirm modify"}
                              </Button>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </Panel>
          ) : (
            <Panel padding="lg" shadow className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold">Trades · {tradeSummary.count}</p>
                <p className="text-[0.7rem] text-muted-foreground">
                  Bought {tradeSummary.buyQty.toLocaleString("en-NP")} ({money(tradeSummary.buyVal)}
                  ) · Sold {tradeSummary.sellQty.toLocaleString("en-NP")} (
                  {money(tradeSummary.sellVal)}) · Net {money(tradeSummary.net)}
                </p>
              </div>
              <QueryNote query={trades} />
              {(trades.data ?? []).length === 0 && !trades.isPending && !trades.isError ? (
                <p className="text-xs text-muted-foreground">No trades in this range.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader className="sticky top-0 z-10 bg-surface">
                      <TableRow>
                        <SortableTh
                          label="Trade ID"
                          active={tradeSort.key === "id"}
                          dir={tradeSort.dir}
                          onClick={() => toggleTradeSort("id")}
                          kind="text"
                        />
                        <SortableTh
                          label="Order No"
                          active={tradeSort.key === "orderNo"}
                          dir={tradeSort.dir}
                          onClick={() => toggleTradeSort("orderNo")}
                          kind="text"
                        />
                        <SortableTh
                          label="Scrip"
                          active={tradeSort.key === "symbol"}
                          dir={tradeSort.dir}
                          onClick={() => toggleTradeSort("symbol")}
                          kind="text"
                        />
                        <SortableTh
                          label="Side"
                          active={tradeSort.key === "side"}
                          dir={tradeSort.dir}
                          onClick={() => toggleTradeSort("side")}
                          kind="text"
                        />
                        <SortableTh
                          label="Qty"
                          active={tradeSort.key === "quantity"}
                          dir={tradeSort.dir}
                          onClick={() => toggleTradeSort("quantity")}
                          align="right"
                        />
                        <SortableTh
                          label="Price"
                          active={tradeSort.key === "price"}
                          dir={tradeSort.dir}
                          onClick={() => toggleTradeSort("price")}
                          align="right"
                        />
                        <SortableTh
                          label="Amount"
                          active={tradeSort.key === "amount"}
                          dir={tradeSort.dir}
                          onClick={() => toggleTradeSort("amount")}
                          align="right"
                        />
                        <SortableTh
                          label="Date"
                          active={tradeSort.key === "date"}
                          dir={tradeSort.dir}
                          onClick={() => toggleTradeSort("date")}
                          kind="text"
                        />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(trades.data ?? []).map((t, i) => (
                        <TableRow key={t.id || i}>
                          <TableCell
                            className="max-w-24 truncate py-2 text-xs text-muted-foreground"
                            title={t.id}
                          >
                            {t.id ? `${t.id.slice(0, 8)}…` : "-"}
                          </TableCell>
                          <TableCell
                            className="max-w-24 truncate py-2 text-xs text-muted-foreground"
                            title={t.orderNo}
                          >
                            {t.orderNo || "-"}
                          </TableCell>
                          <TableCell className="py-2 font-semibold">{t.symbol}</TableCell>
                          <TableCell
                            className={cn(
                              "py-2 font-medium",
                              t.side === "BUY" ? "text-gain" : "text-destructive",
                            )}
                          >
                            {t.side}
                          </TableCell>
                          <TableCell className="num py-2 text-right">
                            {t.quantity.toLocaleString("en-NP")}
                          </TableCell>
                          <TableCell className="num py-2 text-right">
                            {t.price !== null ? t.price.toLocaleString("en-NP") : "-"}
                          </TableCell>
                          <TableCell className="num py-2 text-right font-semibold">
                            {money(t.amount)}
                          </TableCell>
                          <TableCell
                            className="whitespace-nowrap py-2 text-xs"
                            title={`${t.date} ${t.time}`}
                          >
                            {t.date ? `${t.date}${t.time ? ` ${t.time}` : ""}` : "-"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </Panel>
          )}
        </div>
      ) : null}

      {tab === "orders" && brokerId ? <AmoPanel brokerId={brokerId} /> : null}
      {tab === "orders" && brokerId && brokerId !== "yobroker" ? (
        <TriggerPanel brokerId={brokerId} />
      ) : null}

      {tab === "funds" ? (
        <Panel padding="lg" shadow className="space-y-3">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <ArrowLeftRight className="size-4 text-primary" /> Funds & collateral
          </p>
          <QueryNote query={funds} />
          {!funds.isPending && !funds.isError && funds.data ? (
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
              {[
                { label: "Ledger balance", value: funds.data.ledgerBalance },
                { label: "Available to withdraw", value: funds.data.availableForWithdraw },
                { label: "Collateral used", value: funds.data.collateralUsed },
                { label: "Final collateral", value: funds.data.finalCollateral },
                { label: "TMS limit", value: funds.data.tmsLimit },
                { label: "Pending orders", value: funds.data.pendingOrder },
                { label: "Intraday transfers", value: funds.data.intradayFundTransfers },
                { label: "Unbilled sales", value: funds.data.unbilledSales },
                { label: "Overall remaining", value: funds.data.overallRemaining },
                { label: "Balance", value: funds.data.balance },
              ].map((c) => (
                <div key={c.label} className="rounded-xl border border-border/60 bg-background p-3">
                  <p className="text-[0.68rem] uppercase tracking-wide text-muted-foreground">
                    {c.label}
                  </p>
                  <p className="num mt-0.5 text-sm font-semibold">{money(c.value)}</p>
                </div>
              ))}
            </div>
          ) : null}

          {brokerId !== "yobroker" ? (
            <FundsMoveRow
              brokerId={brokerId!}
              withdrawable={funds.data?.availableForWithdraw ?? null}
              onDone={() => {
                void queryClient.invalidateQueries({ queryKey: ["broker-funds"] });
                void queryClient.invalidateQueries({ queryKey: ["broker-fund-txns"] });
              }}
            />
          ) : null}

          <div className="flex justify-end">
            <Button
              variant="outline"
              size="sm"
              disabled={exportingStatement}
              onClick={() => void exportStatement()}
              className="gap-1.5 text-xs"
            >
              {exportingStatement ? "Exporting…" : "Export statement (CSV)"}
            </Button>
          </div>

          <div className="border-t border-border/60 pt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold">
                Fund movements · {fundTxns.data?.totalCount ?? "…"}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={txnType}
                  onChange={(e) => setTxnType(e.target.value)}
                  className="h-8 rounded-lg border border-border/60 bg-background px-2 text-xs"
                  aria-label="Transaction type"
                >
                  <option value="">All types</option>
                  <option value="deposit">Deposit</option>
                  <option value="withdraw">Withdraw</option>
                </select>
                <select
                  value={txnStatus}
                  onChange={(e) => setTxnStatus(e.target.value)}
                  className="h-8 rounded-lg border border-border/60 bg-background px-2 text-xs"
                  aria-label="Status"
                >
                  <option value="">All statuses</option>
                  <option value="success">Success</option>
                  <option value="pending">Pending</option>
                  <option value="failed">Failed</option>
                </select>
                <Input
                  value={txnSearch}
                  onChange={(e) => setTxnSearch(e.target.value)}
                  placeholder="Search reference…"
                  className="h-8 w-44 text-xs"
                />
              </div>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <div className="flex gap-1 rounded-lg border border-border/60 bg-surface p-1">
                {PRESETS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setTxnPreset(p.id)}
                    className={cn(
                      "rounded-md px-2.5 py-1 text-xs font-semibold transition-colors",
                      txnPreset === p.id ? "bg-primary/15 text-primary" : "text-muted-foreground",
                    )}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              {txnPreset === "custom" ? (
                <div className="flex items-center gap-2 text-xs">
                  <Input
                    type="date"
                    value={txnCustom.from}
                    onChange={(e) =>
                      setTxnCustom((c) => ({
                        ...c,
                        from: e.target.value,
                        to: c.to || (e.target.value ? isoDay(new Date()) : c.to),
                      }))
                    }
                    className="h-8 text-xs"
                    aria-label="From date"
                  />
                  <span className="text-muted-foreground">→</span>
                  <Input
                    type="date"
                    value={txnCustom.to}
                    onChange={(e) => setTxnCustom((c) => ({ ...c, to: e.target.value }))}
                    className="h-8 text-xs"
                    aria-label="To date"
                  />
                </div>
              ) : null}
            </div>
            <div className="mt-2">
              <QueryNote query={fundTxns} />
            </div>
            {sortedTxns.length === 0 && !fundTxns.isPending && !fundTxns.isError ? (
              <p className="text-xs text-muted-foreground">No fund movements in this range.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-surface">
                    <TableRow>
                      <SortableTh
                        label="Date"
                        active={txnSort.key === "date"}
                        dir={txnSort.dir}
                        onClick={() => toggleTxnSort("date")}
                        kind="text"
                      />
                      <SortableTh
                        label="Type"
                        active={txnSort.key === "type"}
                        dir={txnSort.dir}
                        onClick={() => toggleTxnSort("type")}
                        kind="text"
                      />
                      <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        Gateway
                      </th>
                      <SortableTh
                        label="Amount"
                        active={txnSort.key === "amount"}
                        dir={txnSort.dir}
                        onClick={() => toggleTxnSort("amount")}
                        align="right"
                      />
                      <SortableTh
                        label="Status"
                        active={txnSort.key === "status"}
                        dir={txnSort.dir}
                        onClick={() => toggleTxnSort("status")}
                        kind="text"
                      />
                      <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        Reference
                      </th>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedTxns.map((t, i) => (
                      <TableRow key={t.id || i}>
                        <TableCell className="whitespace-nowrap py-2 text-xs">
                          {t.date || "-"}
                        </TableCell>
                        <TableCell className="py-2 text-xs font-medium capitalize">
                          {t.type || "-"}
                        </TableCell>
                        <TableCell className="py-2 text-xs text-muted-foreground">
                          {t.gateway || "-"}
                        </TableCell>
                        <TableCell className="num py-2 text-right font-semibold">
                          {t.amount !== null ? money(t.amount) : "-"}
                        </TableCell>
                        <TableCell className="py-2 text-xs">{t.status || "-"}</TableCell>
                        <TableCell
                          className="max-w-40 truncate py-2 text-xs text-muted-foreground"
                          title={t.reference}
                        >
                          {t.reference || "-"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            {(fundTxns.data?.totalPages ?? 0) > 1 ? (
              <div className="mt-2 flex items-center justify-between text-xs">
                <p className="text-muted-foreground">
                  Page {fundTxns.data!.currentPage || txnPage} of {fundTxns.data!.totalPages} ·{" "}
                  {fundTxns.data!.totalCount} total
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={txnPage <= 1 || fundTxns.isPending}
                    onClick={() => setTxnPage((p) => Math.max(1, p - 1))}
                  >
                    Prev
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={fundTxns.isPending || txnPage >= (fundTxns.data?.totalPages ?? 1)}
                    onClick={() => setTxnPage((p) => p + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        </Panel>
      ) : null}

      <p className="text-[0.7rem] leading-relaxed text-muted-foreground">
        Live from your linked broker terminal. Cancelling is two taps and immediate. Placing happens
        from the Terminal or any scrip&apos;s Trade tab, always behind a confirmation.
      </p>

      <TmsReauthModal open={reauthOpen} onOpenChange={setReauthOpen} />
      <YoBrokerModal open={yoOpen} onOpenChange={setYoOpen} />
    </div>
  );
}
