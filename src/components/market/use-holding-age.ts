import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { daysBetween } from "@/lib/calc/fees";
import { mfSchemesQuery, transactionsQuery, waccSearchQuery } from "@/lib/queries";

export type TxnRow = {
  transactionDate?: string;
  postDate?: string;
  [key: string]: unknown;
};

export interface HoldingLot {
  date: string;
  qty: number;
  days: number;
}

export interface HoldingAge {
  holdingDays: number;
  avgHoldingDays: number;
  lots: HoldingLot[];
  known: boolean;
}

/** True when the scrip is an open-end mutual fund (never exchange-traded). */
export function useIsOpenEnd(symbol: string): boolean {
  const schemesQ = useQuery(mfSchemesQuery());
  return useMemo(
    () =>
      schemesQ.data?.some((s) => s.symbol.toUpperCase() === symbol.toUpperCase() && s.fundType === "open_end") ?? false,
    [schemesQ.data, symbol],
  );
}

export function useHoldingAge(symbol: string, txnItems?: TxnRow[]): HoldingAge {
  const purchaseQ = useQuery(waccSearchQuery(symbol || null));
  const txnQ = useQuery({
    ...transactionsQuery(symbol || null),
    enabled: !txnItems && Boolean(symbol),
  });
  const supplied = txnItems;
  return useMemo(() => {
    const items = supplied ?? (txnQ.data as unknown as { items?: TxnRow[] } | undefined)?.items ?? [];
    const fifoLots = (): { qty: number; date: string }[] => {
      const sorted = [...items].sort((a, b) =>
        String(a.transactionDate ?? "").localeCompare(String(b.transactionDate ?? "")),
      );
      const lots: { qty: number; date: string }[] = [];
      for (const t of sorted) {
        const credit = Number(
          (t as Record<string, unknown>)["creditQuantity"] ?? (t as Record<string, unknown>)["creditQty"] ?? 0,
        );
        const debit = Number(
          (t as Record<string, unknown>)["debitQuantity"] ?? (t as Record<string, unknown>)["debitQty"] ?? 0,
        );
        const date = String(t.transactionDate ?? "");
        if (credit > 0 && date) lots.push({ qty: credit, date });
        if (debit > 0) {
          let remaining = debit;
          while (remaining > 0 && lots.length > 0) {
            const first = lots[0]!;
            if (first.qty > remaining) {
              first.qty -= remaining;
              remaining = 0;
            } else {
              remaining -= first.qty;
              lots.shift();
            }
          }
        }
      }
      return lots;
    };
    const ageLots = (lots: { qty: number; date: string }[]): HoldingLot[] => {
      const withDays: HoldingLot[] = [];
      for (const lot of lots) {
        const d = daysBetween(lot.date, new Date());
        // Keep same-day lots (d === 0): bought today is held 0 days, not
        // "no data". Invalid dates yield NaN, which `>= 0` still rejects.
        if (!(d >= 0)) continue;
        withDays.push({ date: lot.date, qty: lot.qty, days: d });
      }
      withDays.sort((a, b) => b.days - a.days);
      return withDays;
    };
    const held = fifoLots();
    if (held.length > 0) {
      const earliest = held.map((l) => l.date).sort()[0] as string;
      const oldest = daysBetween(earliest, new Date());
      if (oldest >= 0) {
        const withDays = ageLots(held);
        const totalUnits = withDays.reduce((s, l) => s + l.qty, 0);
        const weighted = withDays.reduce((s, l) => s + l.days * l.qty, 0);
        return {
          holdingDays: oldest,
          avgHoldingDays: totalUnits > 0 ? Math.round(weighted / totalUnits) : oldest,
          lots: withDays,
          known: true,
        };
      }
    }
    const raw = purchaseQ.data as unknown as
      | {
          waccUpdateResponse?: { transactionDate?: string; postDate?: string }[];
          waccSummaryResponse?: { transactionDate?: string; postDate?: string }[];
        }
      | undefined;
    const all = [...(raw?.waccUpdateResponse ?? []), ...(raw?.waccSummaryResponse ?? [])];
    const dates = all.map((r) => r.transactionDate || r.postDate).filter(Boolean) as string[];
    if (dates.length === 0) return { holdingDays: 400, avgHoldingDays: 400, lots: [], known: false };
    const earliest = dates.sort()[0] as string;
    const d = daysBetween(earliest, new Date());
    const holdingDays = d >= 0 ? d : 400;
    const rawLots = purchaseQ.data as unknown as
      | {
          waccUpdateResponse?: {
            transactionDate?: string;
            postDate?: string;
            quantity?: number;
            transactionQuantity?: number;
          }[];
          waccSummaryResponse?: {
            transactionDate?: string;
            postDate?: string;
            quantity?: number;
            transactionQuantity?: number;
          }[];
        }
      | undefined;
    const waccAll = [...(rawLots?.waccUpdateResponse ?? []), ...(rawLots?.waccSummaryResponse ?? [])];
    const arr: { qty: number; date: string }[] = [];
    for (const r of waccAll) {
      const dateStr = (r.transactionDate || r.postDate) as string | undefined;
      if (!dateStr) continue;
      const qty = Number(
        (r as Record<string, unknown>)["quantity"] ?? (r as Record<string, unknown>)["transactionQuantity"] ?? 0,
      );
      if (!(qty > 0)) continue;
      arr.push({ qty, date: dateStr });
    }
    const withDays = ageLots(arr);
    const totalUnits = withDays.reduce((s, l) => s + l.qty, 0);
    const weighted = withDays.reduce((s, l) => s + l.days * l.qty, 0);
    return {
      holdingDays,
      avgHoldingDays: totalUnits > 0 ? Math.round(weighted / totalUnits) : holdingDays,
      lots: withDays,
      known: true,
    };
  }, [supplied, txnQ.data, purchaseQ.data]);
}
