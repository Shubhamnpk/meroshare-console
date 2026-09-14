import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getBrokerWsCredentials } from "@/lib/brokers/brokers.functions";
import type { BrokerDepth, BrokerDepthRow, BrokerId, BrokerQuote } from "@/lib/brokers/types";

function parseDepthSegments(raw: string): BrokerDepthRow[][] {
  // WebSocket depth: BBR^BBQ^BO^BSR^BSQ^SO | ...
  if (!raw || typeof raw !== "string") return [[], []];
  const levels = raw
    .split("|")
    .map((s) => s.trim())
    .filter(Boolean);
  const bids: BrokerDepthRow[] = [];
  const asks: BrokerDepthRow[] = [];
  for (const seg of levels) {
    const p = seg.split("^");
    if (p.length < 6) continue;
    const bbr = Number(p[0]);
    const bbq = Number(p[1]?.replace(/,/g, ""));
    const bo = Number(p[2]);
    const bsr = Number(p[3]);
    const bsq = Number(p[4]?.replace(/,/g, ""));
    const so = Number(p[5]);
    if (Number.isFinite(bbr) && Number.isFinite(bbq)) bids.push({ side: "bid", price: bbr, quantity: bbq, orders: Number.isFinite(bo) ? bo : null });
    if (Number.isFinite(bsr) && Number.isFinite(bsq)) asks.push({ side: "ask", price: bsr, quantity: bsq, orders: Number.isFinite(so) ? so : null });
  }
  return [bids.slice(0, 5), asks.slice(0, 5)];
}

export function useBrokerMarketWs(brokerId: BrokerId | null, symbol: string | null) {
  const queryClient = useQueryClient();
  const cleanSymbol = symbol?.trim().toUpperCase() ?? "";
  const wsRef = useRef<WebSocket | null>(null);
  const retryRef = useRef<number | null>(null);

  const creds = useQuery({
    queryKey: ["broker-ws-creds", brokerId],
    queryFn: () => getBrokerWsCredentials({ data: { brokerId: brokerId! } }),
    enabled: Boolean(brokerId),
    staleTime: 5 * 60_000,
    retry: false,
  });

  const wsUrl = creds.data?.wsUrl ?? null;

  useEffect(() => {
    if (!brokerId || !cleanSymbol || !wsUrl) return;
    if (typeof window === "undefined" || typeof WebSocket === "undefined") return;

    let closed = false;
    let structures: Record<string, number> | null = null;

    const connect = () => {
      if (closed) return;
      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          // Subscribe to quote + depth for this symbol
          const qKey = `25.1!${cleanSymbol}`;
          const dKey = `25.2!${cleanSymbol}`;
          ws.send(`ADD^1^${qKey}`);
          ws.send(`ADD^1^${dKey}`);
        };

        ws.onmessage = (ev) => {
          const msg = typeof ev.data === "string" ? ev.data : "";
          if (!msg) return;

          // 1. Structures map: EXCH^COL^idx or JSON
          if (msg.includes("Structures") || msg.includes("EXCH")) {
            try {
              const parsed = JSON.parse(msg) as Record<string, unknown>;
              if (parsed["Structures"] && typeof parsed["Structures"] === "object") {
                structures = parsed["Structures"] as Record<string, number>;
              }
            } catch {
              // pipe format for structures: ignore for now, use default BBR etc.
            }
            return;
          }

          // 2. Try JSON market event
          try {
            const parsed = JSON.parse(msg) as Record<string, unknown>;
            const type = String(parsed["type"] ?? parsed["Type"] ?? "").toLowerCase();
            if (type === "market") {
              const scripKey = String(parsed["scripKey"] ?? parsed["Scrip"] ?? "");
              if (!scripKey.toUpperCase().includes(cleanSymbol)) return;
              const row = (parsed["row"] ?? parsed["Row"] ?? parsed["data"] ?? "") as unknown;
              if (typeof row === "string" && (row.includes("^") || row.includes("|"))) {
                const [bids, asks] = parseDepthSegments(row);
                if (bids.length || asks.length) {
                  const depth: BrokerDepth = { errorCode: 0, message: "live", bids, asks };
                  queryClient.setQueryData(["broker-depth", brokerId, cleanSymbol], depth);
                }
              } else if (row && typeof row === "object") {
                // Quote update: map LTP etc.
                const r = row as Record<string, unknown>;
                const ltp = typeof r["LTP"] === "number" ? r["LTP"] : typeof r["ltp"] === "number" ? r["ltp"] : null;
                if (ltp !== null) {
                  const prev: BrokerQuote | null = queryClient.getQueryData(["broker-quote", brokerId, cleanSymbol]) ?? null;
                  if (prev) queryClient.setQueryData(["broker-quote", brokerId, cleanSymbol], { ...prev, ltp });
                }
              }
              return;
            }
          } catch {
            // not JSON, fall through to pipe parsing
          }

          // 3. Raw pipe depth segment (no JSON wrapper)
          if (msg.includes("^") && msg.includes("|")) {
            // Heuristic: if it looks like depth (6 fields per segment)
            const segs = msg.split("|");
            if (segs[0]?.split("^").length === 6) {
              const [bids, asks] = parseDepthSegments(msg);
              if (bids.length || asks.length) {
                const depth: BrokerDepth = { errorCode: 0, message: "live", bids, asks };
                queryClient.setQueryData(["broker-depth", brokerId, cleanSymbol], depth);
              }
            }
          }
        };

        ws.onclose = () => {
          if (closed) return;
          retryRef.current = window.setTimeout(connect, 1000) as unknown as number;
        };

        ws.onerror = () => {
          try { ws.close(); } catch { /* */ }
        };
      } catch {
        if (!closed) retryRef.current = window.setTimeout(connect, 1000) as unknown as number;
      }
    };

    connect();

    return () => {
      closed = true;
      if (retryRef.current) clearTimeout(retryRef.current);
      const ws = wsRef.current;
      if (ws) {
        try {
          ws.send(`DELETE^1^25.1!${cleanSymbol}`);
          ws.send(`DELETE^1^25.2!${cleanSymbol}`);
        } catch { /* */ }
        try { ws.close(); } catch { /* */ }
      }
      wsRef.current = null;
    };
  }, [brokerId, cleanSymbol, wsUrl, queryClient]);

  return { wsReady: Boolean(wsUrl) && !creds.isError, wsUrl };
}
