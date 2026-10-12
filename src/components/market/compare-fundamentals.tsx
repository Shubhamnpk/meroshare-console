import { Panel } from "@/components/ui/panel";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { COMPARE_METRICS, useCompareRows, type CompareMetric, type CompareRow } from "@/lib/compare";
import { cn } from "@/lib/utils";

/** Lower wins (cheaper valuation); everything else listed here, higher wins. */
const LOWER_BETTER: CompareMetric["key"][] = ["pe", "pb"];
const HIGHER_BETTER: CompareMetric["key"][] = ["roe", "eps", "dividendYield", "dividendStreak", "score"];

function winnerFor(metric: CompareMetric, rows: CompareRow[]): string | null {
  if (rows.length < 2) return null;
  const valued = rows.filter((r) => typeof r[metric.key] === "number") as CompareRow[];
  if (valued.length < 2) return null;
  let win = valued[0]!;
  for (const r of valued.slice(1)) {
    const a = win[metric.key] as number;
    const b = r[metric.key] as number;
    if (LOWER_BETTER.includes(metric.key) ? b < a : b > a) win = r;
  }
  return win.symbol;
}

/**
 * Compact fundamentals grid under the terminal chart: same metrics as the
 * Stock Compare tool, best value per row highlighted.
 */
export function CompareFundamentalsTable({ symbols }: { symbols: string[] }) {
  const { rows, isLoading } = useCompareRows(symbols);
  if (symbols.length < 2) return null;
  if (isLoading) {
    return <p className="animate-pulse px-1 text-xs text-muted-foreground">Loading fundamentals…</p>;
  }
  if (rows.length < 2) return null;
  return (
    <Panel padding="none" className="overflow-clip">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40 hover:bg-muted/40">
            <TableHead className="pl-4 text-left">Metric</TableHead>
            {rows.map((r) => (
              <TableHead key={r.symbol} className="text-right last:pr-4">
                {r.symbol}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {COMPARE_METRICS.map((m) => {
            const win = winnerFor(m, rows);
            return (
              <TableRow key={m.key}>
                <TableCell className="pl-4 text-xs text-muted-foreground">{m.label}</TableCell>
                {rows.map((r) => (
                  <TableCell
                    key={r.symbol}
                    className={cn(
                      "num text-right text-xs last:pr-4",
                      r.symbol === win ? "font-bold text-primary" : "font-medium",
                      m.key === "change" && (r.change >= 0 ? "text-gain" : "text-loss"),
                    )}
                  >
                    {m.format(r)}
                  </TableCell>
                ))}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Panel>
  );
}
