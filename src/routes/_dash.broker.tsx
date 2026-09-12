// Broker terminal account: overview, holdings, orders, trades and funds
// on the SAVED broker connection. Read-only except explicit order actions,
// each guarded by its own confirmation.
import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeftRight, Landmark, Plug, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Panel } from "@/components/ui/panel";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  brokerAmoListQuery,
  brokerBanksQuery,
  brokerConnectionsQuery,
  brokerFundsQuery,
  brokerFundTxnsQuery,
  brokerHoldingsQuery,
  brokerOrderBookQuery,
  brokerQuoteQuery,
  brokerTradeBookQuery,
  type BrokerRange,
} from "@/lib/queries";
import {
  cancelBrokerAmo,
  cancelBrokerOrder,
  placeBrokerAmo,
  requestBrokerWithdraw,
  retestBrokerConnection,
} from "@/lib/brokers/brokers.functions";
import type { BrokerId } from "@/lib/brokers/types";
import { errorMessage, formatNpr } from "@/lib/format";
import { cn } from "@/lib/utils";
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

type BrokerTab = "overview" | "holdings" | "orders" | "amo" | "trades" | "funds";

const TABS: { id: BrokerTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "holdings", label: "Holdings" },
  { id: "orders", label: "Orders" },
  { id: "amo", label: "AMO" },
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

function WithdrawCard({
  brokerId,
  withdrawable,
  onDone,
}: {
  brokerId: BrokerId;
  withdrawable: number | null;
  onDone: () => void;
}) {
  const banks = useQuery(brokerBanksQuery(brokerId));
  const [amount, setAmount] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);

  const primary = (banks.data ?? []).find((b) => b.isPrimary) ?? banks.data?.[0] ?? null;
  const amt = Math.floor(Number(amount));
  const valid = Number.isInteger(amt) && amt >= 1;
  const overLimit = valid && amt > 1_000_000;
  const over = valid && withdrawable !== null && amt > withdrawable;

  const withdraw = useMutation({
    mutationFn: () =>
      requestBrokerWithdraw({
        data: { brokerId, amount: amt, isQuickRefund: false, confirmed: true as const },
      }),
    onSuccess: (r) => {
      setConfirmOpen(false);
      if (r.ok) {
        toast.success(r.message);
        setAmount("");
        onDone();
      } else {
        toast.error(r.message);
      }
    },
    onError: (err) => {
      setConfirmOpen(false);
      toast.error(errorMessage(err, "Withdrawal failed."));
    },
  });

  return (
    <div className="rounded-xl border border-border/60 bg-background p-3.5">
      <div className="flex items-center gap-2">
        <Landmark className="size-4 text-primary" />
        <p className="text-sm font-semibold">Withdraw to bank</p>
      </div>
      {banks.isPending ? (
        <p className="mt-2 text-xs text-muted-foreground">Loading linked banks…</p>
      ) : (
        <div className="mt-2 space-y-2.5">
          <p className="text-xs text-muted-foreground">
            {primary ? (
              <>
                To <span className="font-semibold text-foreground">{primary.bankName}</span>
                {primary.branchName ? ` · ${primary.branchName}` : ""}
                {primary.accountName ? ` · ${primary.accountName}` : ""} ·{" "}
                <span className="num">{primary.accountNumber || "—"}</span>
              </>
            ) : (
              "To your primary bank on file at the broker."
            )}
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="withdraw-amount">Amount (NPR)</Label>
              <Input
                id="withdraw-amount"
                inputMode="numeric"
                placeholder={
                  withdrawable !== null ? `Max ${withdrawable.toLocaleString("en-IN")}` : "Amount"
                }
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, "").slice(0, 10))}
              />
            </div>
            <div className="flex items-end">
              <Button
                size="sm"
                disabled={!valid || over || overLimit || withdraw.isPending}
                onClick={() => setConfirmOpen(true)}
                className="w-full sm:w-auto"
              >
                {withdraw.isPending ? "Sending…" : "Review withdrawal"}
              </Button>
            </div>
          </div>
          {overLimit ? (
            <p className="text-xs font-medium text-destructive">
              Per-transaction limit is NPR 10 lakhs. Split larger amounts into multiple requests.
            </p>
          ) : over ? (
            <p className="text-xs font-medium text-destructive">
              Above the withdrawable {withdrawable!.toLocaleString("en-IN")}.
            </p>
          ) : null}
        </div>
      )}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm withdrawal</DialogTitle>
            <DialogDescription>
              This moves <strong>real money</strong> from your broker account to your bank.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-2 rounded-xl bg-muted/40 p-3 text-sm">
            <span className="text-muted-foreground">Amount</span>
            <span className="num text-right font-bold">{valid ? formatNpr(amt) : "-"}</span>
            <span className="text-muted-foreground">To</span>
            <span className="text-right font-semibold">
              {primary?.bankName ?? "-"} · <span className="num">{primary?.accountNumber}</span>
            </span>
          </div>
          <Button
            className="w-full font-bold"
            disabled={withdraw.isPending}
            onClick={() => withdraw.mutate()}
          >
            {withdraw.isPending ? "Submitting…" : `Withdraw ${valid ? formatNpr(amt) : ""} now`}
          </Button>
        </DialogContent>
      </Dialog>
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

function SortTh({
  label,
  k,
  sort,
  onSort,
  right,
}: {
  label: string;
  k: TxnSortKey;
  sort: { key: TxnSortKey; dir: 1 | -1 } | null;
  onSort: (k: TxnSortKey) => void;
  right?: boolean;
}) {
  const active = sort?.key === k;
  return (
    <th className={cn("py-2 pr-2 font-medium", right && "text-right")}>
      <button
        type="button"
        onClick={() => onSort(k)}
        className={cn(
          "inline-flex items-center gap-1 uppercase tracking-wide hover:text-foreground",
          active && "text-foreground",
        )}
        aria-label={`Sort by ${label}`}
      >
        {label}
        <span className="text-[0.6rem]">{active ? (sort.dir === 1 ? "▲" : "▼") : "△"}</span>
      </button>
    </th>
  );
}

function AmoPanel({ brokerId }: { brokerId: BrokerId }) {
  const queryClient = useQueryClient();
  const amos = useQuery(brokerAmoListQuery(brokerId));
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [armedKey, setArmedKey] = useState<string | null>(null);
  const [editKey, setEditKey] = useState<string | null>(null);
  const [eqty, setEqty] = useState("");
  const [eprice, setEprice] = useState("");

  const rows = amos.data ?? [];
  const editing = rows.find(
    (r) => (r.alertName || `${r.scrip}-${r.side}-${r.price}-${r.quantity}`) === editKey,
  ) ?? null;
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

  const keyOf = (o: (typeof rows)[number], i: number) =>
    o.alertName || `${o.scrip}-${o.side}-${o.price}-${o.quantity}-${i}`;
  const buy = rows.filter((r) => r.side === "BUY").length;
  const sell = rows.filter((r) => r.side === "SELL").length;

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
          {buy} buy · {sell} sell
        </p>
      </div>
      <QueryNote query={amos} />
      {rows.length === 0 && !amos.isPending && !amos.isError ? (
        <p className="text-xs text-muted-foreground">
          No AMO orders queued. Place one from the ticket while the market is closed.
        </p>
      ) : (
        <div className="space-y-2">
          {rows.map((o, i) => {
            const key = keyOf(o, i);
            const open = openKey === key;
            const armed = armedKey === key;
            const editingThis = editKey === key;
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
                    <span className={cn("font-bold", o.side === "BUY" ? "text-gain" : o.side === "SELL" ? "text-destructive" : "")}>
                      {o.side}
                    </span>{" "}
                    <span className="num font-semibold">{o.quantity.toLocaleString("en-IN")}</span>{" "}
                    <span className="font-semibold">{o.scrip}</span>{" "}
                    <span className="num text-muted-foreground">
                      @ {o.price !== null ? o.price.toLocaleString("en-IN") : "-"}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">{open ? "Hide" : "Detail"}</span>
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
                        {o.triggerPrice !== null ? o.triggerPrice.toLocaleString("en-IN") : "-"}
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
                        onChange={(e) => setEprice(e.target.value.replace(/[^0-9.]/g, "").slice(0, 12))}
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
                ) : (
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
                        className={cn(!armed && "text-destructive hover:text-destructive", "text-xs")}
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
                )}
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

function BrokerPage() {
  const queryClient = useQueryClient();
  const connections = useQuery(brokerConnectionsQuery());
  const brokerId = (connections.data?.[0]?.brokerId ?? null) as BrokerId | null;
  const connection = connections.data?.[0] ?? null;

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
  const [txnSort, setTxnSort] = useState<{ key: TxnSortKey; dir: 1 | -1 } | null>(null);
  const [armedCancel, setArmedCancel] = useState<string | null>(null);

  const toggleTxnSort = (key: TxnSortKey) =>
    setTxnSort((cur) =>
      cur?.key === key ? { key, dir: cur.dir === 1 ? -1 : 1 } : { key, dir: 1 },
    );

  const range = useMemo(() => rangeFor(preset, custom), [preset, custom]);
  const txnRange = useMemo(() => rangeFor(txnPreset, txnCustom), [txnPreset, txnCustom]);

  const funds = useQuery(brokerFundsQuery(brokerId));
  const holdings = useQuery(brokerHoldingsQuery(brokerId));
  const orders = useQuery(brokerOrderBookQuery(brokerId, range));
  const trades = useQuery(brokerTradeBookQuery(brokerId, range));
  const fundTxns = useQuery(
    brokerFundTxnsQuery(brokerId, {
      ...(txnSearch.trim() ? { search: txnSearch.trim() } : {}),
      ...(txnType ? { transactionType: txnType } : {}),
      ...(txnStatus ? { status: txnStatus } : {}),
      ...txnRange,
      page: txnPage,
    }),
  );

  const sortedTxns = useMemo(() => {
    const rows = [...(fundTxns.data?.rows ?? [])];
    if (!txnSort) return rows;
    const key: TxnSortKey = txnSort.key;
    const dir = txnSort.dir;
    const strOf = (t: (typeof rows)[number]) => (t[key] as string | null) ?? "";
    return rows.sort((a, b) => {
      if (key === "amount") {
        return (
          ((a.amount ?? Number.NEGATIVE_INFINITY) - (b.amount ?? Number.NEGATIVE_INFINITY)) * dir
        );
      }
      return strOf(a).toLowerCase().localeCompare(strOf(b).toLowerCase()) * dir;
    });
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
    mutationFn: (o: {
      orderId: string;
      tranId: string;
      orderStatus: string;
      buySellType: string;
      deliveryFlag: string;
      orderTerms: string;
      price: string;
      quantity: number;
      symbol: string;
    }) => cancelBrokerOrder({ data: { brokerId: brokerId!, ...o, confirmed: true as const } }),
    onSuccess: (r) => {
      setArmedCancel(null);
      if (r.ok) {
        toast.success(r.message);
        void queryClient.invalidateQueries({ queryKey: ["broker-order-book"] });
      } else {
        toast.error(r.message);
      }
    },
    onError: (err) => {
      setArmedCancel(null);
      toast.error(errorMessage(err, "Cancel failed."));
    },
  });

  const holdingRows = useMemo(() => {
    const term = holdingSearch.trim().toLowerCase();
    const rows = holdings.data ?? [];
    if (!term) return rows;
    return rows.filter((h) => h.symbol.toLowerCase().includes(term));
  }, [holdings.data, holdingSearch]);

  const openOrders = useMemo(
    () => (orders.data ?? []).filter((o) => /OPEN|PARTIALLY/.test(o.status.toUpperCase())),
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

  if (!brokerId || !connection) {
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
            {connection.displayName ?? connection.username} · {connection.username}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={refreshAll} className="gap-1.5 text-xs">
            <RefreshCw className="size-3.5" /> Refresh
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
          <div className="rounded-2xl border border-border/60 bg-surface p-4 sm:col-span-2 lg:col-span-4">
            <p className="text-xs font-semibold">Orders vs trades: different things</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Orders are instructions you placed (open, partially filled, cancelled). Trades are
              executions that actually happened. Use the Orders tab to manage instructions and the
              Trades tab for what filled, each with its own date filter.
            </p>
          </div>
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
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/60 text-left text-[0.68rem] uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-2 font-medium">Scrip</th>
                    <th className="py-2 pr-2 text-right font-medium">Avail. qty</th>
                    <th className="py-2 pr-2 text-right font-medium">Close</th>
                    <th className="py-2 text-right font-medium">Market value</th>
                  </tr>
                </thead>
                <tbody>
                  {holdingRows.map((h) => (
                    <tr key={h.symbol} className="border-b border-border/40 last:border-0">
                      <td className="py-2 pr-2 font-semibold">{h.symbol}</td>
                      <td className="num py-2 pr-2 text-right">
                        {h.availableQty.toLocaleString("en-IN")}
                      </td>
                      <td className="num py-2 pr-2 text-right">
                        {h.closePrice !== null ? money(h.closePrice) : "-"}
                      </td>
                      <td className="num py-2 text-right">{money(h.marketValue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
                  onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))}
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
                <p className="text-[0.7rem] text-muted-foreground">
                  {orderSummary.open} open · {orderSummary.buy} buy (
                  {orderSummary.buyQty.toLocaleString("en-IN")}) · {orderSummary.sell} sell (
                  {orderSummary.sellQty.toLocaleString("en-IN")})
                </p>
              </div>
              <QueryNote query={orders} />
              {(orders.data ?? []).length === 0 && !orders.isPending && !orders.isError ? (
                <p className="text-xs text-muted-foreground">No orders in this range.</p>
              ) : (
                <div className="space-y-2">
                  {(orders.data ?? []).map((o) => {
                    const key = o.id || `${o.symbol}-${o.side}-${o.price}`;
                    const armed = armedCancel === key;
                    const cancellable = Boolean(
                      o.orderId && o.tranId && /OPEN|PARTIALLY/.test(o.status.toUpperCase()),
                    );
                    return (
                      <div
                        key={key}
                        className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-background px-3 py-2.5"
                      >
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
                              {o.quantity.toLocaleString("en-IN")}
                            </span>{" "}
                            <span className="font-semibold">{o.symbol}</span>{" "}
                            <span className="num text-muted-foreground">
                              @ {o.price !== null ? o.price.toLocaleString("en-IN") : "MKT"}
                            </span>
                          </p>
                          <p className="text-[0.7rem] text-muted-foreground">
                            {o.status} · {o.orderType} · {o.validity}
                          </p>
                        </div>
                        {cancellable ? (
                          <Button
                            variant={armed ? "destructive" : "outline"}
                            size="sm"
                            disabled={cancel.isPending}
                            className="shrink-0 text-xs"
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
                                orderId: o.orderId,
                                tranId: o.tranId,
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
                  Bought {tradeSummary.buyQty.toLocaleString("en-IN")} ({money(tradeSummary.buyVal)}
                  ) · Sold {tradeSummary.sellQty.toLocaleString("en-IN")} (
                  {money(tradeSummary.sellVal)}) · Net {money(tradeSummary.net)}
                </p>
              </div>
              <QueryNote query={trades} />
              {(trades.data ?? []).length === 0 && !trades.isPending && !trades.isError ? (
                <p className="text-xs text-muted-foreground">No trades in this range.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/60 text-left text-[0.68rem] uppercase tracking-wide text-muted-foreground">
                        <th className="py-2 pr-2 font-medium">Trade ID</th>
                        <th className="py-2 pr-2 font-medium">Order No</th>
                        <th className="py-2 pr-2 font-medium">Scrip</th>
                        <th className="py-2 pr-2 font-medium">Side</th>
                        <th className="py-2 pr-2 text-right font-medium">Qty</th>
                        <th className="py-2 pr-2 text-right font-medium">Price</th>
                        <th className="py-2 pr-2 text-right font-medium">Amount</th>
                        <th className="py-2 pr-2 font-medium">Date</th>
                        <th className="py-2 font-medium">Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(trades.data ?? []).map((t, i) => (
                        <tr key={t.id || i} className="border-b border-border/40 last:border-0">
                          <td
                            className="max-w-24 truncate py-2 pr-2 text-xs text-muted-foreground"
                            title={t.id}
                          >
                            {t.id ? `${t.id.slice(0, 8)}…` : "-"}
                          </td>
                          <td
                            className="max-w-24 truncate py-2 pr-2 text-xs text-muted-foreground"
                            title={t.orderNo}
                          >
                            {t.orderNo || "-"}
                          </td>
                          <td className="py-2 pr-2 font-semibold">{t.symbol}</td>
                          <td
                            className={cn(
                              "py-2 pr-2 font-medium",
                              t.side === "BUY" ? "text-gain" : "text-destructive",
                            )}
                          >
                            {t.side}
                          </td>
                          <td className="num py-2 pr-2 text-right">
                            {t.quantity.toLocaleString("en-IN")}
                          </td>
                          <td className="num py-2 pr-2 text-right">
                            {t.price !== null ? t.price.toLocaleString("en-IN") : "-"}
                          </td>
                          <td className="num py-2 pr-2 text-right">{money(t.amount)}</td>
                          <td className="whitespace-nowrap py-2 pr-2 text-xs">{t.date || "-"}</td>
                          <td className="whitespace-nowrap py-2 text-xs text-muted-foreground">
                            {t.time || "-"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
          )}
        </div>
      ) : null}

      {tab === "amo" && brokerId ? <AmoPanel brokerId={brokerId} /> : null}

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
          <p className="text-[0.7rem] leading-relaxed text-muted-foreground">
            Collateral answers “how much can I actually deploy”: ledger balance minus what&apos;s
            locked in pending orders and used as margin. If this tab errors, the exact broker
            message shows above. Send it over and we&apos;ll trace it.
          </p>

          <WithdrawCard
            brokerId={brokerId}
            withdrawable={funds.data?.availableForWithdraw ?? null}
            onDone={() => {
              void queryClient.invalidateQueries({ queryKey: ["broker-funds"] });
              void queryClient.invalidateQueries({ queryKey: ["broker-fund-txns"] });
            }}
          />

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
                    onChange={(e) => setTxnCustom((c) => ({ ...c, from: e.target.value }))}
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
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/60 text-left text-[0.68rem] uppercase tracking-wide text-muted-foreground">
                      <SortTh label="Date" k="date" sort={txnSort} onSort={toggleTxnSort} />
                      <SortTh label="Type" k="type" sort={txnSort} onSort={toggleTxnSort} />
                      <th className="py-2 pr-2 font-medium">Gateway</th>
                      <SortTh
                        label="Amount"
                        k="amount"
                        sort={txnSort}
                        onSort={toggleTxnSort}
                        right
                      />
                      <SortTh label="Status" k="status" sort={txnSort} onSort={toggleTxnSort} />
                      <th className="py-2 font-medium">Reference</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedTxns.map((t, i) => (
                      <tr key={t.id || i} className="border-b border-border/40 last:border-0">
                        <td className="whitespace-nowrap py-2 pr-2 text-xs">{t.date || "-"}</td>
                        <td className="py-2 pr-2 text-xs font-medium capitalize">
                          {t.type || "-"}
                        </td>
                        <td className="py-2 pr-2 text-xs text-muted-foreground">
                          {t.gateway || "-"}
                        </td>
                        <td className="num py-2 pr-2 text-right font-semibold">
                          {t.amount !== null ? money(t.amount) : "-"}
                        </td>
                        <td className="py-2 pr-2 text-xs">{t.status || "-"}</td>
                        <td
                          className="max-w-40 truncate py-2 text-xs text-muted-foreground"
                          title={t.reference}
                        >
                          {t.reference || "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
        Live from your linked broker terminal. Cancelling is two taps and immediate. Placing
        happens from the Terminal or any scrip&apos;s Trade tab, always behind a confirmation.
      </p>
    </div>
  );
}
