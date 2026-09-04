import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Download, ExternalLink, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DocumentPreview } from "@/components/ui/document-preview";

type DocumentPreviewModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  url: string | null;
  sourceUrl?: string | null;
  title?: string;
};

/** In-app PDF/image viewer: zoom, pan, page thumbnails, open-in-new-tab fallback. */
export function DocumentPreviewModal({
  open,
  onOpenChange,
  url,
  sourceUrl,
  title = "Document",
}: DocumentPreviewModalProps) {
  const [downloading, setDownloading] = useState(false);

  const openInNewTab = () => {
    const target = sourceUrl || url;
    if (target) {
      window.open(target, "_blank", "noopener,noreferrer");
    }
  };

  const download = async () => {
    const target = sourceUrl || url;
    if (!target) return;
    setDownloading(true);
    try {
      const proxyUrl = target.startsWith("/api/pdf")
        ? target
        : `/api/pdf?url=${encodeURIComponent(target)}`;
      const res = await fetch(proxyUrl);
      if (!res.ok) throw new Error("Download failed");
      const blob = await res.blob();
      const ext = target.toLowerCase().endsWith(".pdf")
        ? ".pdf"
        : (target.match(/\.(png|jpe?g|gif|webp|svg)$/i)?.[0] ?? ".pdf");
      const safeName = (title || "document").replace(/[^\w\s.-]/g, "_").trim();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${safeName}${ext}`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      window.open(target, "_blank", "noopener,noreferrer");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[88dvh] w-full flex-col overflow-hidden border-primary/20 bg-card/95 p-0 shadow-2xl sm:h-[85vh] sm:w-[95vw] sm:max-w-4xl [&>button]:hidden">
        <DialogHeader className="border-b border-muted/20 px-5 pb-3 pt-5">
          <div className="flex items-center justify-between gap-3">
            <DialogTitle className="truncate text-sm font-bold uppercase tracking-widest sm:text-base">
              {title}
            </DialogTitle>
            <div className="flex shrink-0 items-center gap-2">
              {(sourceUrl || url) && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-[10px] font-bold uppercase tracking-wider"
                    onClick={download}
                    disabled={downloading}
                  >
                    {downloading ? (
                      <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                    ) : (
                      <Download className="mr-2 h-3 w-3" />
                    )}
                    Download
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-[10px] font-bold uppercase tracking-wider"
                    onClick={openInNewTab}
                  >
                    <ExternalLink className="mr-2 h-3 w-3" />
                    Open in new tab
                  </Button>
                </>
              )}
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-[10px] font-bold uppercase tracking-wider"
                aria-label="Close preview"
                title="Close preview"
                onClick={() => onOpenChange(false)}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          </div>
        </DialogHeader>
        <div className="relative min-h-0 flex-1 bg-muted/10">
          <DocumentPreview key={url ?? "none"} url={url} sourceUrl={sourceUrl} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
