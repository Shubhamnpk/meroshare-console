/**
 * Shared order-list view logic (terminal + broker pages): liveness, sort
 * bands, status pills and paging. Pure functions, no I/O.
 */

/** Rows shown before a "show all" toggle appears. */
export const ORDER_PAGE_SIZE = 8;

/** Epoch ms for a TMS day-order row; 0 when the broker sent no parsable stamp (sorts last in its band). */
export function orderStampMs(o: { date: string; time: string }): number {
  const t = Date.parse(`${o.date}T${o.time}`);
  if (!Number.isNaN(t)) return t;
  const d = Date.parse(o.date);
  return Number.isNaN(d) ? 0 : d;
}

/**
 * True when a status string still describes a live (working) order.
 * Terminal words win first — a broker vocab like "PARTIALLY CANCELLED"
 * must never pass just because it contains a live word; live words are
 * matched on boundaries so random text can't slip through.
 */
export function isLiveStatus(status: string): boolean {
  const s = status.toUpperCase();
  if (/CANCEL|REJECT|EXPIRE|CLOSED|FAIL/i.test(s)) return false;
  return /\b(OPEN|PARTIALLY|ACCEPTED|QUEUED|PENDING)\b/.test(s);
}

/** Ids the broker's cancel/modify endpoints can address (any key variant). */
export function orderCanonicalId(o: { id: string; orderId: string; tranId: string }): string {
  return o.orderId || o.tranId || o.id;
}

/**
 * A row is actionable here only with an addressable id, something left to
 * fill, and a live status. Single source of truth for every Modify/Cancel
 * button, "Cancel all" and the carried-orders card (terminal + broker).
 */
export function canActOnOrder(o: {
  id: string;
  orderId: string;
  tranId: string;
  status: string;
  remainingQty: number;
  quantity: number;
}): boolean {
  return Boolean(orderCanonicalId(o) && (o.remainingQty || o.quantity) > 0 && isLiveStatus(o.status));
}

/**
 * Live for sorting: still working (open statuses with remaining qty).
 * Deliberately ignores id presence — an OPEN row without ids is still live,
 * just not actionable from here.
 */
export function isLiveOrder(o: { status: string; remainingQty: number; quantity: number }): boolean {
  return (o.remainingQty || o.quantity) > 0 && isLiveStatus(o.status);
}

/**
 * Sort band for unified lists: live orders first, then fills (real money
 * reconciles with the portfolio), then everything else diagnostic
 * (cancelled / rejected / expired). Time-descending applies inside a band.
 */
export function orderBand(o: { status: string; remainingQty: number; quantity: number }): 0 | 1 | 2 {
  if (isLiveOrder(o)) return 0;
  return /EXECUTED|COMPLETE|FILLED|DONE/.test(o.status.toUpperCase()) ? 1 : 2;
}

export type OrderOutcome = "rejected" | "cancelled" | "filled" | "expired" | null;

/**
 * Terminal status of a non-actionable row for pills/dimming. Unknown-but-
 * inactive statuses yield null (full opacity, no pill — never mislabeled).
 */
export function orderOutcome(status: string, cancellable: boolean): OrderOutcome {
  if (cancellable) return null;
  const s = status.toUpperCase();
  if (/REJECT|FAIL/.test(s)) return "rejected";
  if (/CANCEL/.test(s)) return "cancelled";
  if (/EXECUTED|COMPLETE|FILLED|DONE/.test(s)) return "filled";
  if (/EXPIRE/.test(s)) return "expired";
  return null;
}

/**
 * An AMO row counts as live unless its status says otherwise. The broker
 * sends boolean-like lifecycle flags: Status=false means no longer live.
 */
export function amoIsActiveRow(a: { side: string; status?: string | null }): boolean {
  return (
    (a.side === "BUY" || a.side === "SELL") &&
    (!a.status || !/DISABLE|INACTIVE|EXPIRED|CANCEL|REJECT|EXECUTED|COMPLETE|FILLED|CLOSED|DONE|FALSE/i.test(a.status))
  );
}

/** Pill copy for a settled outcome. */
export const ORDER_OUTCOME_LABEL: Record<Exclude<OrderOutcome, null>, string> = {
  rejected: "Rejected",
  cancelled: "Cancelled",
  filled: "Filled",
  expired: "Expired",
};
