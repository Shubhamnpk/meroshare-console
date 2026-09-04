import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { ZoomIn, ZoomOut, ExternalLink, Scan, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePreviewZoomPan } from "@/components/ui/document-preview-zoom";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

/** Render pages at this multiple of container width so zoom stays crisp. */
const BASE_RENDER_SCALE = 2;

/** Gap between stacked PDF pages (layout px) - must match the flex `gap-4`. */
const PDF_PAGE_GAP = 16;
/** Horizontal padding around the PDF at fit (px, on screen). */
const PDF_SIDE_PADDING = 32;

const isImageUrl = (url: string | null): boolean => {
  if (!url) return false;
  return /\.(png|jpe?g|webp|bmp|svg)(\?.*|#.*)?$/i.test(url);
};

type DocumentPreviewProps = {
  url: string | null;
  sourceUrl?: string | null | undefined;
};

export function DocumentPreview({ url, sourceUrl }: DocumentPreviewProps) {
  const [pdfTotalPages, setPdfTotalPages] = useState(0);
  const [docType, setDocType] = useState<"pdf" | "image" | null>(null);
  const [containerSize, setContainerSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [imgNatural, setImgNatural] = useState<{ w: number; h: number } | null>(null);
  const [pdfAspect, setPdfAspect] = useState<number | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const aspectRef = useRef<number | null>(null);

  useEffect(() => {
    setPdfTotalPages(0);
    setDocType(isImageUrl(url) ? "image" : "pdf");
    setImgNatural(null);
    setPdfAspect(null);
    aspectRef.current = null;
  }, [url]);

  // Callback ref: observes the pan container's size even though it only mounts
  // after the PDF finishes loading (it lives inside react-pdf's <Document>).
  const sizeObserverRef = useRef<ResizeObserver | null>(null);
  const setContainerRef = useCallback((el: HTMLDivElement | null) => {
    if (sizeObserverRef.current) {
      sizeObserverRef.current.disconnect();
      sizeObserverRef.current = null;
    }
    containerRef.current = el;
    if (el) {
      const update = () => setContainerSize({ w: el.clientWidth, h: el.clientHeight });
      update();
      const ro = new ResizeObserver(update);
      ro.observe(el);
      sizeObserverRef.current = ro;
    }
  }, []);

  const renderW = containerSize.w > 0 ? containerSize.w * BASE_RENDER_SCALE : 0;
  const pdfRenderW =
    containerSize.w > PDF_SIDE_PADDING
      ? (containerSize.w - PDF_SIDE_PADDING) * BASE_RENDER_SCALE
      : 0;

  // Layout size of the (2x) rendered content, used for centering math.
  const contentSize = useMemo<{ w: number; h: number } | null>(() => {
    if (renderW <= 0) return null;
    if (docType === "image" && imgNatural && imgNatural.w > 0) {
      return { w: renderW, h: renderW * (imgNatural.h / imgNatural.w) };
    }
    if (docType === "pdf" && pdfAspect && pdfTotalPages > 0) {
      return {
        w: pdfRenderW,
        h: pdfRenderW * pdfAspect * pdfTotalPages + PDF_PAGE_GAP * (pdfTotalPages - 1),
      };
    }
    return null;
  }, [renderW, pdfRenderW, docType, imgNatural, pdfAspect, pdfTotalPages]);

  const zp = usePreviewZoomPan(
    containerRef,
    contentSize,
    BASE_RENDER_SCALE,
    !!url && !!contentSize,
  );

  // Which PDF page sits at the top of the viewport, derived from the pan offset.
  const currentPdfPage = useMemo(() => {
    if (docType !== "pdf" || !pdfAspect || pdfTotalPages <= 0 || pdfRenderW <= 0) return 1;
    const pageH = pdfRenderW * pdfAspect;
    const stride = pageH + PDF_PAGE_GAP;
    const topLayout = ((-zp.panY * BASE_RENDER_SCALE) / zp.zoom) as number;
    return Math.min(pdfTotalPages, Math.max(1, Math.floor(topLayout / stride) + 1));
  }, [docType, pdfAspect, pdfTotalPages, pdfRenderW, zp.panY, zp.zoom]);

  // Scroll the preview so the given page sits at the top of the viewport.
  const goToPage = (page: number) => {
    if (!pdfAspect || !contentSize) return;
    const p = Math.min(pdfTotalPages, Math.max(1, page)) - 1;
    const stride = pdfRenderW * pdfAspect + PDF_PAGE_GAP;
    const s = zp.zoom / BASE_RENDER_SCALE;
    const clamped = zp.clampPan({ panX: zp.panX, panY: -p * stride * s }, zp.zoom, contentSize);
    zp.setState({ zoom: zp.zoom, panX: clamped.panX, panY: clamped.panY });
  };

  if (!url) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
        No document selected.
      </div>
    );
  }

  const openInNewTab = () => {
    const target = sourceUrl || url;
    if (target) {
      window.open(target, "_blank", "noopener,noreferrer");
    }
  };

  const isImage = docType === "image";
  const transformStyle: React.CSSProperties = {
    position: "absolute",
    left: 0,
    top: 0,
    transformOrigin: "0 0",
    transform: `translate(${zp.panX}px, ${zp.panY}px) scale(${zp.zoom / BASE_RENDER_SCALE})`,
    willChange: "transform",
  };

  return (
    <div className="relative h-full w-full bg-muted/10">
      <div className="pointer-events-none absolute inset-x-0 bottom-3 z-20 flex justify-center px-3">
        <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-muted/50 bg-card/90 px-1.5 py-1 shadow-lg backdrop-blur">
          <button
            type="button"
            onClick={() => zp.zoomCenter(zp.zoom - 0.25)}
            className="flex h-9 w-9 items-center justify-center rounded-full text-foreground transition-colors hover:bg-muted/40 active:scale-90"
            title="Zoom out"
            aria-label="Zoom out"
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          <span className="min-w-[3.25rem] text-center text-xs font-semibold tabular-nums text-foreground">
            {Math.round(zp.zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={() => zp.zoomCenter(zp.zoom + 0.25)}
            className="flex h-9 w-9 items-center justify-center rounded-full text-foreground transition-colors hover:bg-muted/40 active:scale-90"
            title="Zoom in"
            aria-label="Zoom in"
          >
            <ZoomIn className="h-4 w-4" />
          </button>
          <div className="mx-0.5 h-5 w-px bg-muted/40" />
          <button
            type="button"
            onClick={() => zp.fitToView()}
            className="flex h-9 w-9 items-center justify-center rounded-full text-foreground transition-colors hover:bg-muted/40 active:scale-90"
            title="Fit to view"
            aria-label="Fit to view"
          >
            <Scan className="h-4 w-4" />
          </button>
          {docType === "pdf" && pdfTotalPages > 0 && (
            <>
              <div className="mx-0.5 h-5 w-px bg-muted/40" />
              <span className="whitespace-nowrap px-1 text-[10px] font-semibold tabular-nums text-muted-foreground">
                Page {currentPdfPage} / {pdfTotalPages}
              </span>
            </>
          )}
        </div>
      </div>
      {isImage ? (
        <div
          ref={setContainerRef}
          className="relative h-full w-full touch-none overflow-hidden select-none"
          style={{ cursor: "grab" }}
        >
          <div style={transformStyle}>
            <img
              src={url}
              alt="Document"
              draggable={false}
              onLoad={(e) => {
                const nw = e.currentTarget.naturalWidth;
                const nh = e.currentTarget.naturalHeight;
                if (nw && nh) setImgNatural({ w: nw, h: nh });
              }}
              className="block max-w-none rounded-lg select-none"
              style={{ width: renderW ? `${renderW}px` : "auto", height: "auto" }}
            />
          </div>
        </div>
      ) : (
        <Document
          className="h-full"
          file={url}
          onLoadSuccess={({ numPages }) => {
            setPdfTotalPages(numPages);
          }}
          onLoadError={(err) => {
            console.error("PDF load error:", err);
          }}
          loading={
            <div className="py-10 text-center text-sm text-muted-foreground">
              Loading document...
            </div>
          }
          error={
            <div className="flex flex-col items-center justify-center gap-3 p-8 py-10 text-center">
              <p className="text-sm font-medium text-destructive">Failed to load document</p>
              <Button variant="outline" size="sm" onClick={openInNewTab}>
                <ExternalLink className="mr-2 h-4 w-4" />
                Open in new tab
              </Button>
            </div>
          }
        >
          <div className="relative flex h-full w-full">
            {pdfTotalPages > 1 && (
              <>
                <aside
                  className={`relative z-10 hidden flex-col border-r border-border/40 bg-background/40 backdrop-blur-sm lg:flex ${
                    sidebarOpen ? "w-32 shrink-0" : "w-0 overflow-hidden border-r-0"
                  }`}
                >
                  {sidebarOpen && (
                    <>
                      <div className="flex items-center justify-between px-3 pb-2 pt-3">
                        <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                          Pages
                        </span>
                        <button
                          type="button"
                          onClick={() => setSidebarOpen(false)}
                          title="Hide pages"
                          aria-label="Hide pages"
                          className="flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </button>
                      </div>
                      <div className="flex-1 space-y-3 overflow-y-auto px-3 pb-3">
                        {Array.from({ length: pdfTotalPages }, (_, i) => (
                          <button
                            key={`thumb_${i + 1}`}
                            type="button"
                            onClick={() => goToPage(i + 1)}
                            title={`Go to page ${i + 1}`}
                            className={`relative block w-full overflow-hidden rounded-md border border-border/40 bg-white shadow-sm transition-colors hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
                              i + 1 === currentPdfPage ? "ring-2 ring-primary" : ""
                            }`}
                          >
                            <Page
                              pageNumber={i + 1}
                              width={96}
                              renderTextLayer={false}
                              renderAnnotationLayer={false}
                            />
                            <span className="absolute bottom-1 right-1 rounded bg-black/60 px-1 text-[9px] font-bold text-white">
                              {i + 1}
                            </span>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </aside>
                {!sidebarOpen && (
                  <button
                    type="button"
                    onClick={() => setSidebarOpen(true)}
                    title="Show pages"
                    aria-label="Show pages"
                    className="absolute left-2 top-1/2 z-30 hidden h-8 w-6 -translate-y-1/2 items-center justify-center rounded-full border border-border/40 bg-card/90 text-muted-foreground shadow-lg backdrop-blur transition-colors hover:text-foreground lg:flex"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                )}
              </>
            )}
            <div className="relative h-full min-w-0 flex-1">
              <div
                ref={setContainerRef}
                className="relative h-full w-full touch-none overflow-hidden select-none"
                style={{ cursor: "grab" }}
              >
                <div style={transformStyle}>
                  <div className="flex flex-col gap-4">
                    {pdfTotalPages > 0 &&
                      Array.from({ length: pdfTotalPages }, (_, i) => (
                        <Page
                          key={`page_${i + 1}`}
                          pageNumber={i + 1}
                          {...(pdfRenderW > 0 ? { width: pdfRenderW } : {})}
                          onRenderSuccess={(page) => {
                            if (i === 0 && aspectRef.current === null && page.originalWidth > 0) {
                              aspectRef.current = page.originalHeight / page.originalWidth;
                              setPdfAspect(aspectRef.current);
                            }
                          }}
                        />
                      ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Document>
      )}
    </div>
  );
}
