/**
 * Single source of truth for site-wide SEO URLs.
 * Change SITE_URL here and every route, sitemap, and OG tag updates.
 */

export const SITE_URL = "https://meroshare-console.dev";
export const OG_IMAGE = `${SITE_URL}/og.png`;
export const SITE_NAME = "MeroShare Investor Console";

/** Canonical URL for a route path. */
export function canonical(path: string): string {
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

/** og:image meta entry. */
export function ogImage() {
  return { property: "og:image" as const, content: OG_IMAGE };
}

/** canonical link entry. */
export function canonicalLink(path: string) {
  return { rel: "canonical" as const, href: canonical(path) };
}
