import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"}, so try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

/** Crawlable routes; everything under /dashboard etc. requires login but is
 * still listed so search engines can see the app's structure. */
const SITEMAP_ROUTES: { path: string; priority: string; changefreq: string }[] = [
  { path: "/", priority: "1.0", changefreq: "daily" },
  { path: "/dashboard", priority: "0.9", changefreq: "hourly" },
  { path: "/market", priority: "0.9", changefreq: "hourly" },
  { path: "/terminal", priority: "0.8", changefreq: "daily" },
  { path: "/portfolio", priority: "0.7", changefreq: "daily" },
  { path: "/ipo", priority: "0.7", changefreq: "daily" },
  { path: "/reports", priority: "0.6", changefreq: "weekly" },
  { path: "/transactions", priority: "0.5", changefreq: "weekly" },
  { path: "/analytics", priority: "0.6", changefreq: "weekly" },
  { path: "/best-shares", priority: "0.7", changefreq: "daily" },
  { path: "/mutual-funds", priority: "0.8", changefreq: "daily" },
  { path: "/tools", priority: "0.5", changefreq: "weekly" },
  { path: "/wacc", priority: "0.4", changefreq: "weekly" },
  { path: "/profile", priority: "0.3", changefreq: "monthly" },
  { path: "/activity", priority: "0.3", changefreq: "weekly" },
  { path: "/settings", priority: "0.2", changefreq: "monthly" },
  { path: "/releases", priority: "0.4", changefreq: "monthly" },
];

function escapeXml(value: string): string {
  return value.replace(/[<>&'"]/g, (c) =>
    c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === "&" ? "&amp;" : c === "'" ? "&apos;" : "&quot;",
  );
}

function sitemapXml(origin: string): string {
  const lastmod = new Date().toISOString().slice(0, 10);
  const entries = SITEMAP_ROUTES.map(
    (r) =>
      `  <url><loc>${escapeXml(origin + r.path)}</loc><lastmod>${lastmod}</lastmod>` +
      `<changefreq>${r.changefreq}</changefreq><priority>${r.priority}</priority></url>`,
  ).join("\n");
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>\n`
  );
}

function robotsTxt(origin: string): string {
  return [
    "User-agent: *",
    "Allow: /",
    "Disallow: /api/",
    `Sitemap: ${origin}/sitemap.xml`,
    "",
  ].join("\n");
}

function staticFileResponse(request: Request): Response | null {
  const { pathname, origin } = new URL(request.url);
  if (pathname === "/sitemap.xml") {
    return new Response(sitemapXml(origin), {
      headers: { "content-type": "application/xml; charset=utf-8" },
    });
  }
  if (pathname === "/robots.txt") {
    return new Response(robotsTxt(origin), {
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
  return null;
}

const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-XSS-Protection": "1; mode=block",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};

function addSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    if (!headers.has(key)) headers.set(key, value);
  }
  const contentType = headers.get("content-type") ?? "";
  if (contentType.includes("text/html")) {
    headers.set(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data:; font-src 'self' data:; connect-src 'self' https:; frame-src https:; base-uri 'self'; form-action 'self'",
    );
    headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const staticResponse = staticFileResponse(request);
      if (staticResponse) return addSecurityHeaders(staticResponse);
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return addSecurityHeaders(await normalizeCatastrophicSsrResponse(response));
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: {
          "content-type": "text/html; charset=utf-8",
          ...SECURITY_HEADERS,
        },
      });
    }
  },
};
