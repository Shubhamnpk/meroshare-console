import { useCallback, useState } from "react";
import { DocumentPreviewModal } from "@/components/ui/document-preview-modal";

export interface PreviewDoc {
  title: string;
  url: string;
  sourceUrl: string;
}

/**
 * Shared in-app document viewer. Usage:
 *
 *   const viewer = useDocViewer();
 *   viewer.openPreview("NAV report", "https://…/file.pdf");
 *   …
 *   {viewer.modal}
 *
 * PDFs load through the same-origin `/api/pdf` proxy (third-party hosts
 * rarely send CORS headers); "open in new tab" always uses the source URL.
 */
export function useDocViewer() {
  const [previewDoc, setPreviewDoc] = useState<PreviewDoc | null>(null);

  const openPreview = useCallback((title: string, sourceUrl: string | null) => {
    if (!sourceUrl) return;
    setPreviewDoc({
      title,
      url: `/api/pdf?url=${encodeURIComponent(sourceUrl)}`,
      sourceUrl,
    });
  }, []);

  const closePreview = useCallback(() => setPreviewDoc(null), []);

  const modal = (
    <DocumentPreviewModal
      open={previewDoc !== null}
      onOpenChange={(o) => {
        if (!o) closePreview();
      }}
      url={previewDoc?.url ?? null}
      sourceUrl={previewDoc?.sourceUrl ?? null}
      title={previewDoc?.title ?? "Document"}
    />
  );

  return { previewDoc, openPreview, closePreview, modal };
}
