import { useQuery } from "@tanstack/react-query";

export interface IpLocation {
  ip: string;
  city?: string | undefined;
  region?: string | undefined;
  country?: string | undefined;
  countryCode?: string | undefined;
  org?: string | undefined;
  latitude?: number | undefined;
  longitude?: number | undefined;
  /** Human short label, e.g. "Ashburn, United States" */
  label: string;
  /** Flag emoji derived from country code, empty when unknown */
  flag: string;
  /** True for LAN / loopback addresses where lookup is skipped */
  private: boolean;
}

const CACHE_KEY = "ip-loc-cache-v2";
const CACHE_TTL = 30 * 24 * 60 * 60 * 1000; // 30 days

type CacheEntry = { location: IpLocation; expires: number };

function readCache(): Map<string, CacheEntry> {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return new Map();
    const parsed = JSON.parse(raw) as Record<string, CacheEntry>;
    const now = Date.now();
    const entries = Object.entries(parsed).filter(([, v]) => v.expires > now);
    return new Map(entries);
  } catch {
    return new Map();
  }
}

function writeCache(map: Map<string, CacheEntry>) {
  try {
    // Cap the cache so one heavy user can't blow up localStorage.
    const entries = [...map.entries()].slice(-200);
    localStorage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    // Storage full or unavailable — lookups still work, just uncached.
  }
}

export function isPrivateIp(ip: string): boolean {
  const v = ip.trim();
  if (!v || v === "—" || v === "-") return true;
  if (v === "::1" || v === "::ffff:127.0.0.1") return true;
  if (v.startsWith("192.168.") || v.startsWith("10.")) return true;
  if (v.startsWith("127.") || v.startsWith("169.254.") || v.startsWith("fc") || v.startsWith("fd"))
    return true;
  const m172 = /^172\.(1[6-9]|2\d|3[01])\./;
  if (m172.test(v)) return true;
  return false;
}

/** Convert an ISO-3166 alpha-2 code (e.g. "NP") to its flag emoji. */
export function countryFlag(countryCode?: string): string {
  const code = (countryCode ?? "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return "";
  const base = 0x1f1e6;
  return String.fromCodePoint(...[...code].map((ch) => base + (ch.charCodeAt(0) - 65)));
}

function localLabel(ip: string): IpLocation {
  return { ip, label: "Local network", flag: "", private: true };
}

async function fetchOne(ip: string, cache: Map<string, CacheEntry>): Promise<IpLocation> {
  const cached = cache.get(ip);
  if (cached && cached.expires > Date.now()) return cached.location;
  if (isPrivateIp(ip)) return localLabel(ip);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  try {
    // ipwho.is is free without a key and supports CORS + HTTPS.
    const res = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}`, {
      signal: ctrl.signal,
    });
    if (!res.ok) return { ip, label: "Unknown location", flag: "", private: false };
    const data = (await res.json()) as {
      success?: boolean;
      city?: string;
      region?: string;
      country?: string;
      country_code?: string;
      latitude?: number;
      longitude?: number;
      connection?: { org?: string; isp?: string };
    };
    if (data.success === false) return { ip, label: "Unknown location", flag: "", private: false };
    const city = (data.city ?? "").trim();
    const country = (data.country ?? "").trim();
    const parts = [city, country].filter(Boolean);
    const org = data.connection?.org ?? data.connection?.isp ?? undefined;
    const latitude = typeof data.latitude === "number" ? data.latitude : undefined;
    const longitude = typeof data.longitude === "number" ? data.longitude : undefined;
    const loc: IpLocation = {
      ip,
      city: city || undefined,
      region: (data.region ?? "").trim() || undefined,
      country: country || undefined,
      countryCode: (data.country_code ?? "").trim().toUpperCase() || undefined,
      org,
      latitude,
      longitude,
      label: parts.length > 0 ? parts.join(", ") : "Unknown location",
      flag: countryFlag(data.country_code),
      private: false,
    };
    cache.set(ip, { location: loc, expires: Date.now() + CACHE_TTL });
    return loc;
  } catch {
    return { ip, label: "Unknown location", flag: "", private: false };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Resolve a list of IPs to city/country locations. Results are cached in
 * memory for the session and persisted to localStorage for 30 days.
 * Failed or private lookups degrade to a label-only entry — never throws.
 */
export function useIpLocations(ips: string[]) {
  const unique = [...new Set(ips.map((ip) => ip.trim()).filter((ip) => ip && ip !== "—"))].sort();
  const query = useQuery({
    queryKey: ["ip-locations", unique],
    enabled: unique.length > 0,
    staleTime: 24 * 60 * 60 * 1000,
    gcTime: 7 * 24 * 60 * 60 * 1000,
    queryFn: async (): Promise<Record<string, IpLocation>> => {
      const cache = typeof window === "undefined" ? new Map() : readCache();
      // The activity log usually has 1–3 distinct IPs; resolve them together.
      const settled = await Promise.all(unique.map((ip) => fetchOne(ip, cache)));
      if (typeof window !== "undefined") writeCache(cache);
      return Object.fromEntries(settled.map((loc) => [loc.ip, loc]));
    },
  });
  return {
    locations: (query.data ?? {}) as Record<string, IpLocation>,
    isLocating: query.isLoading && unique.length > 0,
  };
}
