import { useState } from "react";
import { toast } from "sonner";
import { FileDown, FileJson, FileSpreadsheet, FileText } from "lucide-react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { Button, type ButtonProps } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { isoDate } from "@/lib/format";

export interface ExportFormat {
  /** Shown in the picker; csv/json/pdf get a matching icon automatically. */
  title: string;
  description: string;
  filename: string;
  extension: "csv" | "json" | "pdf";
  mime?: string;
  /** Returns the file content at click time for csv/json, so filters and sort state are honoured. */
  build: () => string;
  /** Table data for PDF exports: one header row plus data rows, plus optional heading and totals row. */
  pdf?: () => {
    head: string[];
    body: (string | number)[][];
    foot?: (string | number)[];
    title?: string;
  };
}

const DEFAULT_ICONS: Record<string, typeof FileJson> = {
  csv: FileSpreadsheet,
  json: FileJson,
  pdf: FileText,
};

/** Escape and join one CSV row. */
export function csvRow(cells: (string | number | undefined)[]): string {
  return cells.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",");
}

const DISCLAIMER =
  "Indicative data only, compiled from your MeroShare/CDSC account and public NEPSE market mirrors. Figures may be delayed or approximate and are not investment advice. Verify with your DP and broker contracts before acting on any number in this report.";

// Brand blue from the logo gradient (#14B8A6 -> #3B82F6).
const BRAND: [number, number, number] = [37, 99, 235];
const BRAND_LIGHT: [number, number, number] = [59, 130, 246];
const INK: [number, number, number] = [30, 41, 59];
const MUTED: [number, number, number] = [100, 116, 139];
const LINE: [number, number, number] = [226, 232, 240];
const ZEBRA: [number, number, number] = [239, 246, 255];

/** The app logo, loaded once and cached for PDF embedding. */
let logoImage: HTMLImageElement | null | undefined;
function loadLogo(): Promise<HTMLImageElement | null> {
  if (logoImage !== undefined) return Promise.resolve(logoImage);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      logoImage = img;
      resolve(img);
    };
    img.onerror = () => {
      logoImage = null;
      resolve(null);
    };
    img.src = "/logo-512.png";
  });
}

function nptTimestamp(): string {
  return `${new Date().toLocaleString("en-GB", {
    timeZone: "Asia/Kathmandu",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })} NPT`;
}

function prettifyName(filename: string): string {
  return filename
    .split(/[-_]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function savePdf(
  filename: string,
  table: {
    head: string[];
    body: (string | number)[][];
    foot?: (string | number)[];
    title?: string;
  },
  logo: HTMLImageElement | null,
): boolean {
  if (!table) return false;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  const margin = 40;
  const heading = table.title?.trim() || prettifyName(filename);
  const generated = nptTimestamp();
  let finalY = 0;

  autoTable(doc, {
    head: [table.head],
    body: table.body.map((row) => row.map((cell) => String(cell ?? ""))),
    ...(table.foot ? { foot: [table.foot.map((cell) => String(cell ?? ""))] } : {}),
    margin: { top: 92, bottom: 64, left: margin, right: margin },
    styles: {
      fontSize: 8,
      cellPadding: 5,
      textColor: INK,
      lineColor: LINE,
      lineWidth: 0.5,
      overflow: "linebreak",
    },
    headStyles: {
      fillColor: BRAND_LIGHT,
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 8.5,
      lineWidth: 0,
    },
    alternateRowStyles: { fillColor: ZEBRA },
    footStyles: {
      fillColor: [241, 245, 249],
      textColor: INK,
      fontStyle: "bold",
      fontSize: 8.5,
      lineWidth: 0.75,
      lineColor: LINE,
    },
    didDrawPage: (data) => {
      // Brand band in the logo's blue, teal accent strip on the left edge.
      doc.setFillColor(...BRAND);
      doc.rect(0, 0, width, 64, "F");
      doc.setFillColor(20, 184, 166);
      doc.rect(0, 0, 6, 64, "F");
      if (logo) {
        try {
          doc.addImage(logo, "PNG", margin - 6, 14, 36, 36);
        } catch {
          // Logo failed to embed; the wordmark alone still reads as branded.
        }
        doc.setTextColor(255, 255, 255);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(14);
        doc.text("MeroShare Investor Console", margin + 42, 26);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.text(heading, margin + 42, 45);
      } else {
        doc.setTextColor(255, 255, 255);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(14);
        doc.text("MeroShare Investor Console", margin, 26);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.text(heading, margin, 45);
      }
      doc.text(`Generated ${generated}`, width - margin, 45, { align: "right" });

      // Footer with disclaimer and page numbers
      doc.setDrawColor(...LINE);
      doc.setLineWidth(0.75);
      doc.line(margin, height - 48, width - margin, height - 48);
      doc.setTextColor(...MUTED);
      doc.setFontSize(6.5);
      doc.text(DISCLAIMER, margin, height - 38, { maxWidth: width - margin * 2 - 60 });
      const page = doc.getCurrentPageInfo().pageNumber;
      const pages = doc.getNumberOfPages();
      doc.setFontSize(7.5);
      doc.text(`Page ${page} of ${pages}`, width - margin, height - 24, { align: "right" });
      finalY = data.cursor?.y ?? finalY;
    },
  });

  // Row-count summary line under the table.
  if (table.body.length > 0 && finalY > 0) {
    doc.setTextColor(...MUTED);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8);
    doc.text(`${table.body.length} rows exported`, margin, Math.min(finalY + 18, height - 64));
  }

  doc.save(`${filename}.pdf`);
  return true;
}

export function ExportButton({
  formats,
  label = "Export",
  variant = "outline",
  size = "sm",
  className,
  disabled,
}: {
  formats: ExportFormat[];
  label?: string;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  className?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);

  const run = async (format: ExportFormat) => {
    const name = `${format.filename}-${isoDate(new Date())}`;
    if (format.extension === "pdf") {
      const logo = await loadLogo();
      if (!savePdf(name, format.pdf?.() ?? { head: [], body: [] }, logo)) {
        toast.error("Nothing to export");
        return;
      }
    } else {
      const content = format.extension === "csv" ? `\uFEFF${format.build()}` : format.build();
      const blob = new Blob([content], {
        type:
          format.mime ??
          (format.extension === "json" ? "application/json" : "text/csv;charset=utf-8"),
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${name}.${format.extension}`;
      anchor.click();
      URL.revokeObjectURL(url);
    }
    toast.success(`Exported as ${format.title.toUpperCase()}`);
    setOpen(false);
  };

  return (
    <>
      <Button
        variant={variant}
        size={size}
        className={className}
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        <FileDown /> {label}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Export data</DialogTitle>
            <DialogDescription>
              Pick a file format. Your current view and filters are included.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-3 gap-2">
            {formats.map((format) => {
              const Icon = DEFAULT_ICONS[format.extension] ?? FileDown;
              return (
                <button
                  key={format.title}
                  type="button"
                  onClick={() => void run(format)}
                  className="group flex min-w-0 flex-col items-center gap-2 rounded-xl border border-border/60 bg-surface px-3 py-4 text-center transition-colors hover:border-primary/40 hover:bg-accent/5"
                >
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                    <Icon className="size-5" />
                  </span>
                  <span className="text-sm font-semibold">{format.title}</span>
                  <span className="line-clamp-2 text-[0.68rem] leading-snug text-muted-foreground">
                    {format.description}
                  </span>
                </button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
