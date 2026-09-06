import { useEffect, useMemo, useState } from "react";
import { useSettings } from "@/lib/prefs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Heatmap, type HeatTile } from "@/components/market/heatmap";
import {
  CategoryDropdown,
  HeatSearch,
  ModeSwitch,
} from "@/components/market/heatmap-controls";
import {
  LayoutGrid,
  X,
  Info,
  Filter,
  PieChart,
  Eye,
  Activity,
  ArrowUpRight,
} from "lucide-react";
import { formatNpr, formatPercent, formatQty } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface HeatRow {
  symbol: string;
  name: string;
  manager: string;
  fundType: string;
  size: number;
  units: number | null;
  ltp: number | null;
  nav: number | null;
  /** Negative = trading below NAV (bargain). */
  discount: number | null;
  dayChange: number | null;
}

type SizeMode = "size" | "units";
type ColorMode = "day" | "discount";
type TypeFilter = "all" | "open" | "close";

export function FundHeatmap({
  rows,
  onPick,
}: {
  rows: HeatRow[];
  onPick: (symbol: string) => void;
}) {
  const [sizeMode, setSizeMode] = useState<SizeMode>("size");
  const [colorMode, setColorMode] = useState<ColorMode>("discount");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [grouped, setGrouped] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [showInfo, setShowInfo] = useState(false);
  const [selectedItem, setSelectedItem] = useState<HeatRow | null>(null);

  const heatMapItems = useMemo(() => {
    return rows.filter((r) => {
      if (typeFilter === "all") return true;
      if (typeFilter === "open") return r.fundType === "open_end";
      return r.fundType !== "open_end";
    });
  }, [rows, typeFilter]);

  const bySymbol = useMemo(() => new Map(rows.map((r) => [r.symbol, r])), [rows]);

  // Shared-map tiles. Discount is inverted (below NAV = good = green), size
  // follows the Size switch, groups follow the Layout switch.
  const mapTiles: HeatTile[] = useMemo(
    () =>
      heatMapItems.map((r) => {
        const raw = colorMode === "day" ? r.dayChange : r.discount;
        const display = colorMode === "day" ? raw : raw == null ? null : -raw;
        const tile: HeatTile = {
          key: r.symbol,
          label: r.symbol,
          detail: raw != null ? formatPercent(raw) : "—",
          value: Math.abs(sizeMode === "size" ? (r.size ?? 0) : (r.units ?? 0)),
          change: display ?? 0,
          title: `${r.symbol} · ${r.name}`,
        };
        if (grouped) tile.group = r.fundType;
        return tile;
      }),
    [heatMapItems, sizeMode, colorMode, grouped],
  );

  const searchMatches = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return undefined;
    return new Set(
      heatMapItems
        .filter(
          (r) => r.symbol.toLowerCase().includes(q) || r.name.toLowerCase().includes(q),
        )
        .map((r) => r.symbol),
    );
  }, [heatMapItems, searchQuery]);

  const renderFundTooltip = (tile: HeatTile) => {
    const row = bySymbol.get(tile.key);
    if (!row) return null;
    return (
      <>
        <div className="flex flex-col gap-0.5 border-b border-border/50 pb-1.5">
          <div className="flex items-center justify-between gap-4">
            <span className="text-xs font-black uppercase tracking-wider">{row.symbol}</span>
            <Badge
              variant="secondary"
              className="h-4 bg-primary/10 px-1 text-[9px] uppercase tracking-wider text-primary"
            >
              {row.fundType === "open_end" ? "Open-end" : "Close-end"}
            </Badge>
          </div>
          <span className="truncate text-[9px] font-medium text-muted-foreground">
            {row.name}
          </span>
        </div>
        <div className="space-y-1.5 text-[11px] font-semibold text-muted-foreground">
          <div className="flex justify-between gap-6">
            <span>Fund size:</span>
            <span className="font-bold text-foreground">
              {formatNpr(row.size, { compact: true })}
            </span>
          </div>
          <div className="flex justify-between gap-6">
            <span>Units:</span>
            <span className="font-bold text-foreground">
              {row.units != null ? formatQty(row.units) : "-"}
            </span>
          </div>
          <div className="flex justify-between gap-6">
            <span>NAV:</span>
            <span className="font-bold text-foreground">
              {row.nav != null ? formatNpr(row.nav) : "-"}
            </span>
          </div>
          <div className="flex justify-between gap-6 border-t border-border/20 pt-1">
            <span>LTP:</span>
            <span className="font-bold text-foreground">
              {row.ltp != null ? formatNpr(row.ltp) : "-"}
            </span>
          </div>
          <div className="flex justify-between gap-6">
            <span>Discount:</span>
            <span
              className={cn(
                "font-bold",
                row.discount == null
                  ? "text-muted-foreground/60"
                  : row.discount < 0
                    ? "text-gain"
                    : "text-loss",
              )}
            >
              {row.discount != null ? formatPercent(row.discount) : "-"}
            </span>
          </div>
          <div className="flex justify-between gap-6">
            <span>Day change:</span>
            <span
              className={cn(
                "font-bold",
                row.dayChange == null
                  ? "text-muted-foreground/60"
                  : row.dayChange >= 0
                    ? "text-gain"
                    : "text-loss",
              )}
            >
              {row.dayChange != null ? formatPercent(row.dayChange) : "-"}
            </span>
          </div>
        </div>
      </>
    );
  };

  if (rows.length === 0) {
    return (
      <Card className="overflow-hidden border border-border/40 bg-card/45 text-left shadow-lg backdrop-blur-md">
        <CardHeader className="border-b border-border/10 px-4 pb-2 pt-4">
          <CardTitle className="flex items-center gap-2 text-xs font-black uppercase tracking-widest">
            <LayoutGrid className="h-3.5 w-3.5 text-primary" /> Fund Heat Map
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <p className="px-4 py-8 text-center text-[11px] font-medium text-muted-foreground">
            No sized schemes available.
          </p>
        </CardContent>
      </Card>
    );
  }

  const sizeModeLabel = sizeMode === "size" ? "Fund Size" : "Units Outstanding";
  const colorModeLabel = colorMode === "day" ? "Day Change" : "Discount to NAV";

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <HeatSearch
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Search schemes…"
        />
        <CategoryDropdown
          value={typeFilter}
          options={[
            { value: "all", label: `All structures · ${rows.length}` },
            {
              value: "open",
              label: `Open-end · ${rows.filter((r) => r.fundType === "open_end").length}`,
            },
            {
              value: "close",
              label: `Close-end · ${rows.filter((r) => r.fundType !== "open_end").length}`,
            },
          ]}
          onChange={(v) => {
            setTypeFilter(v as TypeFilter);
            setSelectedItem(null);
          }}
          placeholder="Filter by structure"
        />
      </div>

      <Card className="flex flex-col gap-0 overflow-hidden rounded-2xl border border-border/40 bg-card/45 text-left shadow-xl backdrop-blur-md">
        <CardHeader className="space-y-1.5 border-b border-border/10 px-4 pb-0 pt-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 space-y-1">
              <CardTitle className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider">
                <LayoutGrid className="h-3.5 w-3.5 text-primary" /> Fund Heat Map
              </CardTitle>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 border-t border-border/5 pt-2">
            <ModeSwitch
              label="Size"
              options={
                [
                  { key: "size", label: "Fund size" },
                  { key: "units", label: "Units" },
                ] as const
              }
              value={sizeMode}
              onChange={setSizeMode}
            />
            <ModeSwitch
              label="Color"
              options={
                [
                  { key: "day", label: "Day %" },
                  { key: "discount", label: "Discount %" },
                ] as const
              }
              value={colorMode}
              onChange={setColorMode}
            />
            <ModeSwitch
              label="Layout"
              options={
                [
                  { key: "grouped", label: "Grouped" },
                  { key: "mixed", label: "All mixed" },
                ] as const
              }
              value={grouped ? "grouped" : "mixed"}
              onChange={(v) => setGrouped(v === "grouped")}
            />
          </div>
            <Button
              variant="outline"
              size="icon"
              title="What do these options mean?"
              onClick={() => setShowInfo(true)}
              className="h-7 w-7 shrink-0 rounded-lg border-border/35 bg-card/60 text-muted-foreground transition-all hover:bg-muted/30"
            >
              <Info className="h-3.5 w-3.5" />
            </Button>
          </div>
        </CardHeader>

        <CardContent className="flex flex-1 flex-col gap-0.5 p-1 pt-0">
          {heatMapItems.length === 0 ? (
            <div className="flex min-h-[300px] flex-col items-center justify-center rounded-xl border border-dashed border-border/30 p-8 text-center">
              <span className="text-[11px] font-semibold text-muted-foreground">
                No schemes found for the selected filter.
              </span>
            </div>
          ) : (
            <>
              <Heatmap
                tiles={mapTiles}
                onPick={(symbol) => {
                  const next =
                    selectedItem?.symbol === symbol ? null : (bySymbol.get(symbol) ?? null);
                  setSelectedItem(next);
                  if (next) onPick(symbol);
                }}
                sizeLabel={sizeModeLabel}
                heightClass="h-[62vh] sm:h-[68vh] lg:h-[74vh]"
                hideLegend
                groupLabels={{ open_end: "Open-end", close_end: "Close-end" }}
                selectedKey={selectedItem?.symbol ?? null}
                highlightedKeys={searchMatches}
                renderTooltip={renderFundTooltip}
              />

              <div className="flex flex-col items-start justify-between gap-2 rounded-xl border border-border/20 bg-muted/10 px-3 py-2 text-[10px] font-bold text-muted-foreground sm:flex-row sm:items-center">
                <div className="flex items-center gap-2">
                  <span>{colorMode === "day" ? "Fall" : "Premium"}</span>
                  <div className="h-2.5 w-28 rounded-md bg-gradient-to-r from-red-500/80 via-muted/30 to-emerald-500/80" />
                  <span>{colorMode === "day" ? "Rise" : "Bargain"}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Badge
                    variant="outline"
                    className="bg-background/50 py-0 text-[8px] font-semibold tracking-tight text-muted-foreground"
                  >
                    Intensity: % strength
                  </Badge>
                  {selectedItem && (
                    <Button
                      variant="ghost"
                      onClick={() => setSelectedItem(null)}
                      className="h-5 gap-0.5 px-1.5 text-[9px] font-bold text-primary hover:bg-muted"
                    >
                      Clear selection
                    </Button>
                  )}
                </div>
              </div>

              {selectedItem && (
                <div className="relative flex flex-col gap-2.5 rounded-xl border border-border/50 bg-muted/10 p-3 shadow-sm duration-300 animate-in slide-in-from-bottom-2">
                  <button
                    type="button"
                    onClick={() => setSelectedItem(null)}
                    className="absolute right-2 top-2 rounded-full p-1 text-muted-foreground transition-all hover:bg-muted hover:text-foreground"
                    title="Close details"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>

                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-col gap-0.5">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-black text-foreground">
                          {selectedItem.symbol}
                        </span>
                        <Badge className="h-4 border-0 bg-primary/10 px-1 text-[8px] font-extrabold uppercase tracking-wider text-primary">
                          {selectedItem.fundType === "open_end" ? "Open-end" : "Close-end"}
                        </Badge>
                      </div>
                      <span className="text-[9px] font-medium text-muted-foreground">
                        {selectedItem.name}
                      </span>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => onPick(selectedItem.symbol)}
                      className="h-7 gap-1 px-2.5 text-[11px]"
                    >
                      Open fund <ArrowUpRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>

                  <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                    <div className="flex flex-col">
                      <span className="text-[9px] font-black uppercase tracking-wider text-muted-foreground">
                        Fund size
                      </span>
                      <span className="text-xs font-black text-foreground">
                        {formatNpr(selectedItem.size, { compact: true })}
                      </span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[9px] font-black uppercase tracking-wider text-muted-foreground">
                        Units
                      </span>
                      <span className="text-xs font-black text-foreground">
                        {selectedItem.units != null ? formatQty(selectedItem.units) : "-"}
                      </span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[9px] font-black uppercase tracking-wider text-muted-foreground">
                        NAV / LTP
                      </span>
                      <span className="text-xs font-black text-foreground">
                        {selectedItem.nav != null ? formatNpr(selectedItem.nav) : "-"}
                        {" / "}
                        {selectedItem.ltp != null ? formatNpr(selectedItem.ltp) : "-"}
                      </span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[9px] font-black uppercase tracking-wider text-muted-foreground">
                        Discount
                      </span>
                      <span
                        className={cn(
                          "text-xs font-black",
                          selectedItem.discount == null
                            ? "text-muted-foreground/60"
                            : selectedItem.discount < 0
                              ? "text-gain"
                              : "text-loss",
                        )}
                      >
                        {selectedItem.discount != null ? formatPercent(selectedItem.discount) : "-"}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>

        <Dialog open={showInfo} onOpenChange={setShowInfo}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-sm font-black uppercase tracking-wider">
                <Info className="h-4 w-4 text-primary" /> How the Heat Map works
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 text-sm">
              <div className="space-y-2">
                <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  <PieChart className="h-3.5 w-3.5" /> Tile Size
                </p>
                <div className="space-y-1.5 pl-5 text-xs text-muted-foreground">
                  <p>
                    <span className="font-semibold text-foreground">Fund size</span>, each tile's
                    area represents its share of total fund size. Larger tiles = bigger schemes.
                  </p>
                  <p>
                    <span className="font-semibold text-foreground">Units</span>, tile size reflects
                    units outstanding, regardless of price.
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  <Activity className="h-3.5 w-3.5" /> Tile Color
                </p>
                <div className="space-y-1.5 pl-5 text-xs text-muted-foreground">
                  <p>
                    <span className="font-semibold text-foreground">Day %</span>, today's LTP move.
                    Green = up, red = down. Intensity reflects how big the move was.
                  </p>
                  <p>
                    <span className="font-semibold text-foreground">Discount %</span>, LTP vs NAV.
                    Green = bargain (below NAV), red = premium. Intensity reflects the gap size.
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  <Filter className="h-3.5 w-3.5" /> Filters
                </p>
                <div className="space-y-1.5 pl-5 text-xs text-muted-foreground">
                  <p>
                    <span className="font-semibold text-foreground">
                      All / Open-end / Close-end
                    </span>{" "}
                    , narrow the map to one fund structure. With All, both share one map: each keeps
                    its own labeled region, sized on the same scale.
                  </p>
                  <p>
                    <span className="font-semibold text-foreground">Grouped / All mixed</span>,
                    grouped keeps each structure in its own region; all mixed throws every fund into
                    one pool so the biggest overall stands out.
                  </p>
                </div>
              </div>

              <div className="space-y-1 rounded-lg bg-muted/20 p-3">
                <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  <Eye className="h-3.5 w-3.5" /> Interacting
                </p>
                <ul className="list-disc space-y-0.5 pl-5 text-xs text-muted-foreground">
                  <li>Hover any tile to see NAV, LTP, discount and size in a tooltip.</li>
                  <li>Tap or click a tile to pin its details below the map and open the fund.</li>
                  <li>Use the search bar to highlight a specific scheme.</li>
                </ul>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </Card>
    </div>
  );
}
