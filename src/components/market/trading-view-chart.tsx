"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

const TV_SCRIPT = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";

export function TradingViewChart({
  symbol,
  theme,
  interval = "D",
  height = 560,
  className,
}: {
  symbol: string;
  theme: "light" | "dark";
  interval?: string;
  height?: number;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.innerHTML = "";
    const widget = document.createElement("div");
    widget.className = "tradingview-widget-container__widget";
    widget.style.height = "100%";
    container.appendChild(widget);

    const script = document.createElement("script");
    script.type = "text/javascript";
    script.src = TV_SCRIPT;
    script.async = true;
    script.text = JSON.stringify({
      autosize: true,
      symbol,
      interval,
      timezone: "Asia/Kathmandu",
      theme,
      style: "1",
      locale: "en",
      allow_symbol_change: true,
      calendar: false,
      support_host: "https://www.tradingview.com",
    });
    container.appendChild(script);

    return () => {
      container.innerHTML = "";
    };
  }, [symbol, interval, theme]);

  return (
    <div
      ref={containerRef}
      className={cn("tradingview-widget-container w-full", className)}
      style={{ height }}
    />
  );
}
