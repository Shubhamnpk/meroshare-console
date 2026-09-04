import { createFileRoute } from "@tanstack/react-router";

const TIMEOUT_MS = 20_000;
const MAX_BYTES = 25 * 1024 * 1024;

/**
 * Same-origin PDF/image proxy for the in-app document viewer.
 * Browser fetch of third-party PDFs fails without CORS headers, so the
 * viewer loads bytes through here instead. Responses stream through with a
 * size cap and timeout; the original URL stays available for "open in new tab".
 */
export const Route = createFileRoute("/api/pdf")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const target = new URL(request.url).searchParams.get("url") ?? "";
        let parsed: URL;
        try {
          parsed = new URL(target);
        } catch {
          return Response.json({ error: "Missing or invalid url parameter" }, { status: 400 });
        }
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
          return Response.json({ error: "Only http(s) URLs are allowed" }, { status: 400 });
        }

        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
        try {
          const upstream = await fetch(parsed.toString(), {
            signal: ctrl.signal,
            headers: { Accept: "application/pdf,image/*", "User-Agent": "MeroShare-Console/1.0" },
          });
          if (!upstream.ok || !upstream.body) {
            return Response.json(
              { error: `Upstream responded ${upstream.status}` },
              { status: 502 },
            );
          }
          const contentType = upstream.headers.get("content-type") ?? "application/pdf";
          const contentLength = Number(upstream.headers.get("content-length") ?? 0);
          if (Number.isFinite(contentLength) && contentLength > MAX_BYTES) {
            return Response.json({ error: "Document too large to preview" }, { status: 413 });
          }
          return new Response(upstream.body, {
            headers: {
              "Content-Type": contentType,
              "Content-Disposition": "inline",
              "Cache-Control": "public, max-age=3600",
            },
          });
        } catch {
          return Response.json({ error: "Could not fetch document" }, { status: 502 });
        } finally {
          clearTimeout(timer);
        }
      },
    },
  },
});
