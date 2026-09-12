import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Download, Info, Layers, ShieldCheck, XCircle } from "lucide-react";
import {
  edisTransferActiveQuery,
  edisNodelQuery,
  edisDisclaimerQuery,
  edisPoolAccountQuery,
  edisWaccLeftQuery,
} from "@/lib/queries";
import { useSort, sortBy, SortableTh } from "@/components/sortable-table";
import { EmptyBlock, LoadingBlock } from "@/components/states";
import { formatQty } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { EdisTransferItem } from "@/lib/meroshare/types";

const STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-yellow-100 text-yellow-800 border-yellow-200",
  APPROVED: "bg-green-100 text-green-800 border-green-200",
  COMPLETED: "bg-green-100 text-green-800 border-green-200",
  REJECTED: "bg-red-100 text-red-800 border-red-200",
  CANCELLED: "bg-gray-100 text-gray-800 border-gray-200",
  FAILED: "bg-red-100 text-red-800 border-red-200",
};

function StatusBadge({ status }: { status: string | undefined }) {
  if (!status) return <span className="text-muted-foreground">—</span>;
  const normalized = status.toUpperCase();
  const colors = STATUS_COLORS[normalized] ?? "bg-gray-100 text-gray-800 border-gray-200";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
        colors,
      )}
    >
      {status}
    </span>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  color = "text-primary",
}: {
  label: string;
  value: string | number;
  icon: typeof Layers;
  color?: string;
}) {
  return (
    <div className="rounded-xl border border-border/70 bg-card p-4">
      <div className="flex items-center gap-3">
        <div className={cn("rounded-lg bg-muted p-2", color)}>
          <Icon className="size-4" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-lg font-semibold">{value}</p>
        </div>
      </div>
    </div>
  );
}

function getObligationField(item: EdisTransferItem, field: string): unknown {
  const map = item["contractObligationMap"] as Record<string, unknown> | undefined;
  if (!map) return undefined;
  const obligation = map["obligation"] as Record<string, unknown> | undefined;
  return obligation?.[field];
}

function TransferDetailDialog({
  item,
  onClose,
}: {
  item: EdisTransferItem | null;
  onClose: () => void;
}) {
  if (!item) return null;
  const map = item["contractObligationMap"] as Record<string, unknown> | undefined;
  const obligation = map?.["obligation"] as Record<string, unknown> | undefined;
  const reqStatus = item["requestStatus"] as Record<string, unknown> | undefined;

  const details: [string, string][] = [
    ["Transfer ID", String(item["id"] ?? "—")],
    ["Scrip", String(item["scriptCode"] ?? obligation?.["scriptCode"] ?? "—")],
    ["Quantity", String(item["quantity"] ?? obligation?.["quantity"] ?? "—")],
    ["Settlement Date", String(item["settleDate"] ?? obligation?.["settlementDate"] ?? "—")],
    ["Status", String(reqStatus?.["name"] ?? item["statusName"] ?? "—")],
    ["Transfer Type", String(item["transferType"] ?? "—")],
    ["Request Date", String(item["requestDate"] ?? "—")],
    ["BOID", String(item["boid"] ?? obligation?.["clientBoid"] ?? "—")],
  ];

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Transfer Details</DialogTitle>
          <DialogDescription>Transfer request #{String(item["id"] ?? "—")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {details.map(([label, value]) => (
            <div
              key={label}
              className="flex items-center justify-between border-b border-border/50 py-1.5 last:border-0"
            >
              <span className="text-sm text-muted-foreground">{label}</span>
              <span className="text-sm font-medium">{value}</span>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

type TransferSortKey = "settleDate" | "scriptCode" | "quantity";
type NodelSortKey = "tradeDate" | "scriptCode" | "quantity";

export function EdisTransferList() {
  const [page, setPage] = useState(1);
  const [detailItem, setDetailItem] = useState<EdisTransferItem | null>(null);
  const { data, isLoading, error, refetch } = useQuery(edisTransferActiveQuery(page));
  const { sort, toggle } = useSort<TransferSortKey>(
    { key: "settleDate", dir: "desc" },
    { settleDate: "text", scriptCode: "text", quantity: "number" },
  );

  const sorted = data?.items
    ? sortBy(
        data.items,
        (r) =>
          sort.key === "scriptCode"
            ? String(r["scriptCode"] ?? getObligationField(r, "scriptCode") ?? "")
            : sort.key === "quantity"
              ? Number(r["quantity"] ?? getObligationField(r, "quantity") ?? 0)
              : String(r["settleDate"] ?? getObligationField(r, "settlementDate") ?? ""),
        sort.dir,
      )
    : [];

  if (isLoading) return <LoadingBlock label="Loading transfers" rows={6} />;
  if (error)
    return (
      <EmptyBlock
        title="Unable to load transfers"
        description="CDSC returned an error when fetching your active transfers. Your session may have expired, or EDIS may not be available for your account."
        icon={<Layers className="size-6" />}
      >
        <Button variant="outline" size="sm" onClick={() => refetch()} className="mt-2">
          Retry
        </Button>
      </EmptyBlock>
    );
  if (!data?.items.length) {
    return (
      <EmptyBlock
        title="No active transfers"
        description="You have no pending or active share transfer requests."
        icon={<Layers className="size-6" />}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Active Transfers</h3>
          <p className="text-xs text-muted-foreground">
            {data.total} total transfer request{data.total !== 1 ? "s" : ""}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <Download className="mr-1.5 size-3.5" />
          Refresh
        </Button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border/70">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/70 bg-muted/50">
              <SortableTh
                label="Settlement"
                active={sort.key === "settleDate"}
                dir={sort.dir}
                onClick={() => toggle("settleDate")}
                kind="text"
              />
              <SortableTh
                label="Scrip"
                active={sort.key === "scriptCode"}
                dir={sort.dir}
                onClick={() => toggle("scriptCode")}
                kind="text"
              />
              <SortableTh
                label="Qty"
                active={sort.key === "quantity"}
                dir={sort.dir}
                onClick={() => toggle("quantity")}
                kind="number"
                align="right"
              />
              <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Status
              </th>
              <th className="px-4 py-2.5 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Details
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((item, i) => {
              const reqStatus = item["requestStatus"] as Record<string, unknown> | undefined;
              return (
                <tr
                  key={item["id"] ?? i}
                  className="border-b border-border/50 transition-colors hover:bg-muted/30 last:border-0"
                >
                  <td className="whitespace-nowrap px-4 py-3 font-medium">
                    {String(
                      item["settleDate"] ?? getObligationField(item, "settlementDate") ?? "—",
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <span className="font-mono text-xs font-semibold">
                      {String(item["scriptCode"] ?? getObligationField(item, "scriptCode") ?? "—")}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right font-mono">
                    {formatQty(
                      Number(item["quantity"] ?? getObligationField(item, "quantity") ?? 0),
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <StatusBadge status={String(reqStatus?.["name"] ?? item["statusName"] ?? "")} />
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => setDetailItem(item)}
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      View
                      <ChevronRight className="size-3" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {data.total > 50 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            Previous
          </Button>
          <span className="text-xs text-muted-foreground">
            Page {page} of {Math.ceil(data.total / 50)}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => p + 1)}
            disabled={page * 50 >= data.total}
          >
            Next
          </Button>
        </div>
      )}

      <TransferDetailDialog item={detailItem} onClose={() => setDetailItem(null)} />
    </div>
  );
}

export function EdisNodelTrades() {
  const [page, setPage] = useState(1);
  const { data, isLoading, error, refetch } = useQuery(edisNodelQuery(page));
  const { sort, toggle } = useSort<NodelSortKey>(
    { key: "tradeDate", dir: "desc" },
    { tradeDate: "text", scriptCode: "text", quantity: "number" },
  );

  const sorted = data?.items
    ? sortBy(
        data.items,
        (r) =>
          sort.key === "scriptCode"
            ? String(r["scriptCode"] ?? "")
            : sort.key === "quantity"
              ? Number(r["quantity"] ?? 0)
              : String(r["tradeDate"] ?? r["settleDate"] ?? ""),
        sort.dir,
      )
    : [];

  if (isLoading) return <LoadingBlock label="Loading no-delivery trades" rows={6} />;
  if (error)
    return (
      <EmptyBlock
        title="Unable to load trades"
        description="CDSC returned an error when fetching no-delivery trades. Your session may have expired, or EDIS may not be available for your account."
        icon={<XCircle className="size-6" />}
      >
        <Button variant="outline" size="sm" onClick={() => refetch()} className="mt-2">
          Retry
        </Button>
      </EmptyBlock>
    );
  if (!data?.items.length) {
    return (
      <EmptyBlock
        title="No no-delivery trades"
        description="You have no no-delivery trades recorded."
        icon={<XCircle className="size-6" />}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">No-Delivery Trades</h3>
          <p className="text-xs text-muted-foreground">
            {data.total} total trade{data.total !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border/70">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/70 bg-muted/50">
              <SortableTh
                label="Trade Date"
                active={sort.key === "tradeDate"}
                dir={sort.dir}
                onClick={() => toggle("tradeDate")}
                kind="text"
              />
              <SortableTh
                label="Scrip"
                active={sort.key === "scriptCode"}
                dir={sort.dir}
                onClick={() => toggle("scriptCode")}
                kind="text"
              />
              <SortableTh
                label="Qty"
                active={sort.key === "quantity"}
                dir={sort.dir}
                onClick={() => toggle("quantity")}
                kind="number"
                align="right"
              />
              <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Contract ID
              </th>
              <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Broker
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((item, i) => (
              <tr
                key={item["id"] ?? i}
                className="border-b border-border/50 transition-colors hover:bg-muted/30 last:border-0"
              >
                <td className="whitespace-nowrap px-4 py-3 font-medium">
                  {String(item["tradeDate"] ?? item["settleDate"] ?? "—")}
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  <span className="font-mono text-xs font-semibold">
                    {String(item["scriptCode"] ?? "—")}
                  </span>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right font-mono">
                  {formatQty(Number(item["quantity"] ?? 0))}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                  {String(item["contractId"] ?? "—")}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                  {String(item["brokerCode"] ?? "—")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data.total > 50 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            Previous
          </Button>
          <span className="text-xs text-muted-foreground">
            Page {page} of {Math.ceil(data.total / 50)}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => p + 1)}
            disabled={page * 50 >= data.total}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}

export function EdisPoolAccountStatus() {
  const poolQ = useQuery(edisPoolAccountQuery());
  const waccQ = useQuery(edisWaccLeftQuery());
  const disclaimerQ = useQuery(edisDisclaimerQuery());

  const poolError = poolQ.error;
  const waccError = waccQ.error;
  const disclaimerError = disclaimerQ.error;

  const anyFailed = Boolean(poolError || waccError || disclaimerError);
  const allDone = !poolQ.isLoading && !waccQ.isLoading && !disclaimerQ.isLoading;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          label="Account Type"
          value={
            poolQ.isLoading
              ? "Checking..."
              : poolError
                ? "Unavailable"
                : poolQ.data
                  ? "Pool Account"
                  : "Regular Account"
          }
          icon={Layers}
          color={
            poolQ.data ? "text-orange-500" : poolError ? "text-muted-foreground" : "text-green-500"
          }
        />
        <StatCard
          label="WACC Available"
          value={
            waccQ.isLoading ? "Checking..." : waccError ? "Unavailable" : waccQ.data ? "Yes" : "No"
          }
          icon={ShieldCheck}
          color={waccQ.data ? "text-green-500" : "text-muted-foreground"}
        />
        <StatCard
          label="Disclaimer"
          value={
            disclaimerQ.isLoading
              ? "Loading..."
              : disclaimerError
                ? "Unavailable"
                : disclaimerQ.data
                  ? "Accepted"
                  : "Not Available"
          }
          icon={Info}
          color="text-blue-500"
        />
      </div>

      {anyFailed && allDone && (
        <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800 dark:border-yellow-800 dark:bg-yellow-950 dark:text-yellow-200">
          <p className="text-xs">
            Some EDIS data could not be loaded. This may be because your session has expired or EDIS
            is not available for your account. Transfer and no-delivery trade data may still be
            accessible from the tabs below.
          </p>
        </div>
      )}

      {poolQ.data && (
        <div className="rounded-xl border border-orange-200 bg-orange-50 p-4 text-sm text-orange-800 dark:border-orange-800 dark:bg-orange-950 dark:text-orange-200">
          <div className="flex items-start gap-2">
            <Info className="mt-0.5 size-4 shrink-0" />
            <div>
              <p className="font-semibold">Pool Account Detected</p>
              <p className="mt-1 text-xs">
                Your account is registered as a pool account. Share transfers may have different
                requirements. Please contact your DP for more information.
              </p>
            </div>
          </div>
        </div>
      )}

      {disclaimerQ.data && (
        <div className="rounded-xl border border-border/70 bg-muted/30 p-4">
          <div className="flex items-start gap-2">
            <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <div>
              <p className="text-xs font-semibold text-muted-foreground">EDIS Disclaimer</p>
              <p className="mt-1 text-xs text-muted-foreground">{disclaimerQ.data}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
