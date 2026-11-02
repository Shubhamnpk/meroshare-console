import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, FileText, FileUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { downloadText } from "@/components/export-dialog";
import { cn } from "@/lib/utils";
import {
  DEMO_GLOBAL_CSV,
  STANDARD_CSV_TEMPLATE,
  detectImportFormat,
  parseImport,
  type ImportResult,
} from "@/lib/world/import";
import { appendGlobalTxns, replaceGlobalTxns, useGlobalTxns } from "@/lib/world/store";

type ImportMode = "append" | "replace";

const MODES: Array<{ id: ImportMode; label: string; hint: string }> = [
  { id: "append", label: "Append", hint: "Keep what's here. Duplicates are skipped." },
  { id: "replace", label: "Replace", hint: "Wipe the current set first, then import this file." },
];

/**
 * Shared Trading 212 / standard CSV importer for Global (non-NEPSE) data.
 * Usable from Transactions and Settings; the device store notifies listeners.
 */
export function GlobalImportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const existing = useGlobalTxns();
  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState<ImportResult | null>(null);
  const [unrecognized, setUnrecognized] = useState(false);
  const [mode, setMode] = useState<ImportMode>("append");
  const [dragging, setDragging] = useState(false);

  const reset = () => {
    setFileName("");
    setParsed(null);
    setUnrecognized(false);
    setMode("append");
    setDragging(false);
  };

  const ingest = (name: string, text: string) => {
    const format = detectImportFormat(text);
    if (!format) {
      setFileName(name);
      setParsed(null);
      setUnrecognized(true);
      return;
    }
    setFileName(name);
    setUnrecognized(false);
    setParsed(parseImport(text));
  };

  const onFile = (file: File | undefined) => {
    if (!file) return;
    void file.text().then((text) => ingest(file.name, text));
  };

  const commit = (chosen: ImportMode) => {
    if (!parsed) return;
    if (chosen === "append") {
      const added = appendGlobalTxns(parsed.txns);
      const dupes = parsed.txns.length - added;
      if (added === 0) {
        toast.info("Those rows are already imported — nothing changed.");
      } else if (parsed.errors.length > 0) {
        toast.warning(`Added ${added} rows, skipped ${parsed.errors.length} bad lines.`);
      } else if (dupes > 0) {
        toast.success(`Added ${added} new rows — ${dupes} duplicate${dupes === 1 ? "" : "s"} skipped.`);
      } else {
        toast.success(`Added ${added} rows.`);
      }
    } else {
      replaceGlobalTxns(parsed.txns);
      toast.success(`Replaced global data with ${parsed.txns.length} rows.`);
    }
    reset();
    onOpenChange(false);
  };

  const rows = parsed?.txns.length ?? 0;
  /* Same dedupe rule the store applies on append, so the counts are honest. */
  const diff = useMemo(() => {
    const known = new Set(existing.map((t) => t.id));
    let fresh = 0;
    for (const t of parsed?.txns ?? []) if (!known.has(t.id)) fresh += 1;
    return { fresh, dupes: (parsed?.txns.length ?? 0) - fresh, skipped: parsed?.errors.length ?? 0 };
  }, [parsed, existing]);
  const replacing = mode === "replace" && existing.length > 0;
  const canImport = replacing ? rows > 0 : diff.fresh > 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="border-b border-border/60 px-5 pb-4 pt-5 pr-12">
          <DialogTitle>Import global data</DialogTitle>
          <DialogDescription>
            Trading 212 statements or our standard CSV. Foreign holdings only — NEPSE demat data is never touched.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <label
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              onFile(e.dataTransfer.files?.[0]);
            }}
            className={cn(
              "group flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border border-dashed px-4 py-6 text-center transition-colors",
              dragging ? "border-primary bg-primary/10" : "border-border/70 bg-surface hover:border-primary/50",
            )}
          >
            <span className="flex size-9 items-center justify-center rounded-full bg-background text-muted-foreground shadow-sm transition-colors group-hover:text-primary">
              {parsed ? <FileText className="size-4" /> : <FileUp className="size-4" />}
            </span>
            <span className="max-w-full truncate px-2 text-sm font-medium">
              {fileName || (dragging ? "Drop the CSV here" : "Choose a CSV file")}
            </span>
            <span className="text-xs text-muted-foreground">
              {parsed
                ? "Click or drop to swap the file"
                : dragging
                  ? "Release to read it"
                  : "Drag & drop, or click to browse"}
            </span>
            <input
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => onFile(e.target.files?.[0])}
            />
          </label>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => ingest("demo-global.csv", DEMO_GLOBAL_CSV)}
            >
              Load demo data
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() =>
                downloadText("global-import-template.csv", STANDARD_CSV_TEMPLATE, "text/csv;charset=utf-8")
              }
            >
              Download template
            </Button>
          </div>

          {unrecognized ? (
            <div className="flex gap-2 rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              <p>
                Unrecognized file — expected a Trading 212 statement or the standard{" "}
                <span className="font-mono">symbol,name,side,…</span> CSV.
              </p>
            </div>
          ) : null}

          {parsed ? (
            <div className="rounded-xl border border-border/60 bg-card">
              <div className="flex items-center justify-between gap-2 border-b border-border/60 px-3 py-2">
                <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium">
                  {parsed.format === "trading212" ? "Trading 212" : "Standard CSV"}
                </span>
                <span className="num text-xs text-muted-foreground">
                  {mode === "replace" && existing.length > 0
                    ? `${existing.length} existing → ${rows} imported`
                    : `${rows} row${rows === 1 ? "" : "s"} in file`}
                </span>
              </div>

              <div className="grid grid-cols-3 divide-x divide-border/60 text-center">
                <div className="px-2 py-2.5">
                  <p className="num text-base font-semibold text-gain">{diff.fresh}</p>
                  <p className="text-[11px] text-muted-foreground">new</p>
                </div>
                <div className="px-2 py-2.5">
                  <p className="num text-base font-semibold">{diff.dupes}</p>
                  <p className="text-[11px] text-muted-foreground">duplicate{diff.dupes === 1 ? "" : "s"}</p>
                </div>
                <div className="px-2 py-2.5">
                  <p
                    className={cn(
                      "num text-base font-semibold",
                      diff.skipped > 0 ? "text-amber-600 dark:text-amber-500" : "text-muted-foreground",
                    )}
                  >
                    {diff.skipped}
                  </p>
                  <p className="text-[11px] text-muted-foreground">skipped</p>
                </div>
              </div>

              {mode === "append" && diff.fresh === 0 && rows > 0 ? (
                <p className="border-t border-border/60 px-3 py-2 text-xs text-muted-foreground">
                  Every row in this file is already imported. Nothing to add.
                </p>
              ) : null}

              {parsed.errors.length > 0 ? (
                <div className="space-y-0.5 border-t border-border/60 px-3 py-2 text-xs text-muted-foreground">
                  {parsed.errors.slice(0, 2).map((e) => (
                    <p key={e.line}>
                      Line {e.line}: {e.message}
                    </p>
                  ))}
                  {parsed.errors.length > 2 ? <p>…and {parsed.errors.length - 2} more</p> : null}
                </div>
              ) : null}
            </div>
          ) : null}

          {rows > 0 && existing.length > 0 ? (
            <div>
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">How to apply it</p>
              <div role="radiogroup" aria-label="Import mode" className="grid grid-cols-2 gap-2">
                {MODES.map((m) => {
                  const active = mode === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => setMode(m.id)}
                      className={cn(
                        "rounded-xl border px-3 py-2 text-left transition-colors",
                        active
                          ? "border-primary/60 bg-primary/5 ring-1 ring-primary/25"
                          : "border-border/70 bg-surface hover:border-primary/30",
                      )}
                    >
                      <span className="text-xs font-semibold">{m.label}</span>
                      <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
                        {m.id === "replace"
                          ? `Deletes all ${existing.length} current rows, then imports ${rows}.`
                          : m.hint}
                      </span>
                    </button>
                  );
                })}
              </div>
              {replacing ? (
                <p className="mt-1.5 flex items-start gap-1.5 text-[11px] text-amber-600 dark:text-amber-500">
                  <AlertTriangle className="mt-0.5 size-3 shrink-0" />
                  Replace discards your {existing.length} existing global rows. Append is the safe choice.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-border/60 bg-muted/20 px-5 py-3">
          <p className="hidden text-[11px] text-muted-foreground sm:block">Stored on this device only.</p>
          <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                reset();
                onOpenChange(false);
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              variant={replacing ? "destructive" : "default"}
              disabled={!canImport}
              onClick={() => commit(mode)}
            >
              {replacing
                ? `Replace with ${rows}`
                : canImport
                  ? `Add ${diff.fresh} new row${diff.fresh === 1 ? "" : "s"}`
                  : "Nothing new to add"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
