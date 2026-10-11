import { useState } from "react";
import { GitCompareArrows, Plus, X } from "lucide-react";
import { ScripSheet } from "@/components/market/scrip-sheet";
import { cn } from "@/lib/utils";
import { Panel } from "@/components/ui/panel";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { COMPARE_METRICS, useCompareRows, type CompareRow } from "@/lib/compare";

function CompareBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="h-1.5 w-full rounded-full bg-muted/50">
      <div className={cn("h-full rounded-full", color)} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function StockCompare() {
  const [symbols, setSymbols] = useState<string[]>(["NABIL", "NICA"]);
  const [input, setInput] = useState("");
  const [picked, setPicked] = useState<string | null>(null);

  const { rows } = useCompareRows(symbols);

  const addSymbol = () => {
    const s = input.toUpperCase().trim();
    if (s && !symbols.includes(s) && symbols.length < 4) {
      setSymbols([...symbols, s]);
      setInput("");
    }
  };

  const removeSymbol = (sym: string) => {
    setSymbols(symbols.filter((s) => s !== sym));
  };

  const metrics = COMPARE_METRICS;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <GitCompareArrows className="size-4 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">Compare up to 4 stocks side-by-side.</span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {symbols.map((sym) => (
          <span
            key={sym}
            className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-card px-3 py-1 text-sm font-medium"
          >
            {sym}
            <button onClick={() => removeSymbol(sym)} className="ml-0.5 text-muted-foreground hover:text-foreground">
              <X className="size-3" />
            </button>
          </span>
        ))}
        {symbols.length < 4 && (
          <div className="flex items-center gap-1">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && addSymbol()}
              placeholder="Add symbol..."
              className="w-24 rounded-full border border-border/70 bg-card px-3 py-1 text-sm outline-none focus:border-primary/50"
            />
            <button onClick={addSymbol} className="rounded-full bg-primary/15 p-1 text-primary hover:bg-primary/25">
              <Plus className="size-3.5" />
            </button>
          </div>
        )}
      </div>

      {rows.length > 0 && (
        <Panel padding="none" className="overflow-clip">
          <Table className="min-w-[760px]">
            <TableHeader className="bg-muted">
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Metric</TableHead>
                {rows.map((r) => (
                  <TableHead key={r.symbol} className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">
                    {r.symbol}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length > 0 && (
                <TableRow className="border-b border-border/30 bg-muted/10">
                  <TableCell className="px-3 py-1.5 text-xs text-muted-foreground">Name</TableCell>
                  {rows.map((r) => (
                    <TableCell key={r.symbol} className="px-3 py-1.5 text-right text-xs">
                      {r.name}
                    </TableCell>
                  ))}
                </TableRow>
              )}
              {metrics.map((m) => (
                <TableRow key={m.key} className="border-b border-border/20">
                  <TableCell className="px-3 py-2 text-xs text-muted-foreground">{m.label}</TableCell>
                  {rows.map((r) => {
                    const val = r[m.key as keyof CompareRow];
                    const numVal = typeof val === "number" ? val : null;
                    const allVals = rows
                      .map((rr) => rr[m.key as keyof CompareRow])
                      .filter((v): v is number => typeof v === "number");
                    const maxVal = Math.max(...allVals.map(Math.abs), 1);
                    return (
                      <TableCell
                        key={r.symbol}
                        className={cn(
                          "px-3 py-2 text-right text-xs font-medium",
                          m.key === "change" && numVal != null
                            ? numVal >= 0
                              ? "text-emerald-400"
                              : "text-red-400"
                            : "",
                          m.key === "score" && numVal != null
                            ? numVal >= 70
                              ? "text-emerald-400"
                              : numVal >= 50
                                ? "text-blue-400"
                                : "text-muted-foreground"
                            : "",
                        )}
                      >
                        {m.format(r)}
                        {numVal != null && m.key !== "ltp" && m.key !== "score" && (
                          <div className="mt-1">
                            <CompareBar
                              value={numVal}
                              max={maxVal}
                              color={numVal >= 0 ? "bg-emerald-400" : "bg-red-400"}
                            />
                          </div>
                        )}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Panel>
      )}

      {rows.length === 0 && (
        <div className="rounded-xl border border-border/70 bg-card py-8 text-center text-sm text-muted-foreground">
          Add at least one valid symbol to start comparing.
        </div>
      )}

      {picked && <ScripSheet symbol={picked} open={!!picked} onOpenChange={() => setPicked(null)} />}
    </div>
  );
}
