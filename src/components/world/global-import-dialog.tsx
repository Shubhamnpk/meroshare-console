import { useState } from "react";
import { toast } from "sonner";
import { FileUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { downloadText } from "@/components/export-dialog";
import {
  DEMO_GLOBAL_CSV,
  STANDARD_CSV_TEMPLATE,
  detectImportFormat,
  parseImport,
  type ImportResult,
} from "@/lib/world/import";
import { appendGlobalTxns, replaceGlobalTxns } from "@/lib/world/store";

/**
 * Shared Trading 212 / standard CSV importer for Global (non-NEPSE) data.
 * Usable from Transactions and Settings; the device store notifies listeners.
 */
export function GlobalImportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState<ImportResult | null>(null);
  const [unrecognized, setUnrecognized] = useState(false);

  const reset = () => {
    setFileName("");
    setParsed(null);
    setUnrecognized(false);
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

  const commit = (mode: "append" | "replace") => {
    if (!parsed) return;
    const added =
      mode === "append" ? appendGlobalTxns(parsed.txns) : (replaceGlobalTxns(parsed.txns), parsed.txns.length);
    if (parsed.errors.length > 0) {
      toast.warning(
        `Imported ${mode === "append" ? added : parsed.txns.length} rows, skipped ${parsed.errors.length}.`,
      );
    } else if (mode === "append" && added < parsed.txns.length) {
      toast.success(`Imported ${added} new rows (${parsed.txns.length - added} duplicates skipped).`);
    } else {
      toast.success(`Imported ${parsed.txns.length} rows.`);
    }
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Import global data</DialogTitle>
          <DialogDescription>
            Trading 212 statements or our standard CSV. Foreign holdings only — never mixed with NEPSE demat data.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-border/70 bg-surface px-3 py-6 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground">
            <FileUp className="size-4" />
            {fileName || "Choose a CSV file…"}
            <input
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => onFile(e.target.files?.[0])}
            />
          </label>
          <div className="flex flex-wrap gap-2">
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
            <p className="rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              Unrecognized format — expected a Trading 212 statement or the standard symbol,name,side,… template.
            </p>
          ) : null}
          {parsed ? (
            <div className="rounded-xl border border-border/60 bg-surface px-3 py-2 text-xs">
              <p className="font-semibold">
                {parsed.format === "trading212" ? "Trading 212 statement" : "Standard CSV"} · {parsed.txns.length} rows
                {parsed.errors.length > 0 ? ` · ${parsed.errors.length} skipped` : ""}
              </p>
              {parsed.errors.slice(0, 3).map((e) => (
                <p key={e.line} className="mt-1 text-muted-foreground">
                  Line {e.line}: {e.message}
                </p>
              ))}
            </div>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!parsed || parsed.txns.length === 0}
              onClick={() => commit("append")}
            >
              Append{parsed ? ` (${parsed.txns.length})` : ""}
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={!parsed || parsed.txns.length === 0}
              onClick={() => commit("replace")}
            >
              Replace all
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
