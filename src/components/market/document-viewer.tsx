import { ExternalLink } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function DocumentViewer({
  url,
  title,
  open,
  onOpenChange,
}: {
  url: string;
  title: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const isPdf = url.toLowerCase().endsWith(".pdf");
  const isImage = /\.(png|jpe?g|gif|webp|svg)$/i.test(url);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl gap-0 overflow-hidden p-0 sm:max-w-4xl">
        <DialogHeader className="flex flex-row items-center justify-between border-b px-4 py-3">
          <DialogTitle className="truncate text-sm">{title}</DialogTitle>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-2 shrink-0 text-muted-foreground transition-colors hover:text-primary"
            aria-label="Open in new tab"
          >
            <ExternalLink className="size-4" />
          </a>
        </DialogHeader>
        <div className="h-[70vh]">
          {isPdf || isImage ? (
            <iframe
              src={url}
              title={title}
              className="h-full w-full border-0"
              sandbox="allow-scripts"
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
              <p className="text-sm text-muted-foreground">
                This document cannot be previewed in the browser.
              </p>
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-lg border border-border/70 px-4 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/10"
              >
                <ExternalLink className="size-4" />
                Open in new tab
              </a>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
