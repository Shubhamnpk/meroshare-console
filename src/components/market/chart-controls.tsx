import { Maximize2, Minimize2, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { BarAgg } from "@/lib/charts/aggregate";
import { cn } from "@/lib/utils";
import type { ChartStyle, IndicatorConfig } from "@/components/market/terminal-chart";

/**
 * Chart chrome shared by the NEPSE terminal card and the global card: same
 * styles, same indicators, same behavior — only the data feeds differ.
 */

export const CHART_STYLES: { key: ChartStyle; label: string }[] = [
  { key: "candles", label: "Candles" },
  { key: "line", label: "Line" },
  { key: "area", label: "Area" },
];

export const CHART_INDICATORS: { key: keyof IndicatorConfig; label: string; hint: string }[] = [
  { key: "sma20", label: "SMA 20", hint: "20-day simple moving average" },
  { key: "sma50", label: "SMA 50", hint: "50-day simple moving average" },
  { key: "ema20", label: "EMA 20", hint: "20-day exponential moving average" },
  { key: "bollinger", label: "Bollinger", hint: "20-day bands, 2σ" },
  { key: "vwap", label: "VWAP", hint: "Volume-weighted average price" },
  { key: "volume", label: "Volume", hint: "Traded quantity pane" },
  { key: "rsi", label: "RSI 14", hint: "Relative strength index pane" },
  { key: "macd", label: "MACD", hint: "12/26/9 momentum pane" },
];

export function ChartStyleSwitch({
  value,
  onChange,
  disabledKeys,
}: {
  value: ChartStyle;
  onChange: (s: ChartStyle) => void;
  /** Styles with no data behind them (e.g. candles without intraday OHLC). */
  disabledKeys?: ChartStyle[] | undefined;
}) {
  return (
    <div className="flex gap-1">
      {CHART_STYLES.map((s) => {
        const off = disabledKeys?.includes(s.key) ?? false;
        return (
          <button
            key={s.key}
            type="button"
            onClick={() => onChange(s.key)}
            disabled={off}
            title={off ? "Not available for this data" : undefined}
            className={cn(
              "rounded-lg px-2 py-1 text-xs font-medium transition-colors",
              value === s.key ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-muted/60",
              off && "cursor-not-allowed opacity-40 hover:bg-transparent",
            )}
          >
            {s.label}
          </button>
        );
      })}
    </div>
  );
}

export function ChartIndicatorsPopover({
  value,
  onToggle,
  logScale,
  onLogScale,
}: {
  value: IndicatorConfig;
  onToggle: (key: keyof IndicatorConfig, v: boolean) => void;
  logScale: boolean;
  onLogScale: (v: boolean) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
          <SlidersHorizontal className="size-3.5" /> Indicators
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 space-y-3">
        {CHART_INDICATORS.map((item) => (
          <div key={item.key} className="flex items-center justify-between gap-3">
            <Label htmlFor={item.key} className="cursor-pointer">
              <span className="text-sm font-medium">{item.label}</span>
              <span className="block text-[11px] font-normal text-muted-foreground">{item.hint}</span>
            </Label>
            <Switch id={item.key} checked={value[item.key]} onCheckedChange={(v) => onToggle(item.key, v)} />
          </div>
        ))}
        <div className="flex items-center justify-between gap-3 border-t border-border/60 pt-3">
          <Label htmlFor="logscale" className="cursor-pointer text-sm font-medium">
            Log scale
          </Label>
          <Switch id="logscale" checked={logScale} onCheckedChange={onLogScale} />
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function ChartExpandButton({ expanded, onToggle }: { expanded: boolean; onToggle: () => void }) {
  return (
    <Button
      variant="outline"
      size="icon"
      className="size-8"
      onClick={onToggle}
      aria-label={expanded ? "Shrink chart" : "Expand chart"}
    >
      {expanded ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
    </Button>
  );
}

/** Per-point candle aggregation: compact range-style code on the trigger, full helper words in the dropdown. */
const BAR_AGG_OPTIONS = [
  { value: "day", code: "1D", label: "Daily" },
  { value: "week", code: "1W", label: "Weekly" },
  { value: "month", code: "1M", label: "Monthly" },
  { value: "year", code: "1Y", label: "Yearly" },
] as const;

export function BarAggSelect({ value, onChange }: { value: BarAgg; onChange: (v: BarAgg) => void }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[11px] text-muted-foreground">Per point</span>
      <Select value={value} onValueChange={(v) => onChange(v as BarAgg)}>
        <SelectTrigger className="h-6 w-[3.25rem] gap-1 px-2 text-[11px]">
          {BAR_AGG_OPTIONS.find((o) => o.value === value)?.code ?? value}
        </SelectTrigger>
        <SelectContent className="min-w-[5rem]">
          {BAR_AGG_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value} className="py-1 pl-2 pr-6 text-[11px]">
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
