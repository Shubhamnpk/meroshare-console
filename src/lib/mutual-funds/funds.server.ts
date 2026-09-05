// Server-only mutual fund data feed (capitals.nepsetrading.com community API).
// Fetched server-side and cached in-memory so the browser never hits a third
// party. Mirrors the feed.server.ts pattern: TTL cache + stale fallback.
import type {
  MfApproval,
  MfDebenture,
  MfDebentureList,
  MfDebentureSummary,
  MfDocument,
  MfFeedHealth,
  MfHolding,
  MfHoldingsMap,
  MfManager,
  MfManagerDetail,
  MfManagerFacts,
  MfManagerProductDetail,
  MfNavPoint,
  MfPerformance,
  MfPipeline,
  MfPipelineItem,
  MfPipelineOverview,
  MfPipelineType,
  MfPortal,
  MfProduct,
  MfProductDetail,
  MfReturns,
  MfScheme,
  MfSchemeBundle,
  MfSchemeFacts,
} from "./types";

const MF_BASE = "https://capitals.nepsetrading.com/api";

export const MF_ATTRIBUTION =
  "Mutual fund NAV, holdings and returns via the community nepsetrading.com feed (indicative data).";

interface CacheEntry {
  value: unknown;
  expires: number;
}

const cache = new Map<string, CacheEntry>();
const TTL_SLOW = 30 * 60_000;
/** Aggregated maps fan out to dozens of upstream calls - cache them longer. */
const TTL_MAP = 2 * 60 * 60_000;

function num(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/,/g, "").trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function str(value: unknown): string | null {
  if (typeof value === "string") {
    const s = value.trim();
    return s ? s : null;
  }
  return null;
}

type Rec = Record<string, unknown>;

async function mfJson<T>(path: string, ttlMs = TTL_SLOW): Promise<T | null> {
  const url = `${MF_BASE}${path}`;
  const hit = cache.get(url);
  const now = Date.now();
  if (hit && hit.expires > now) return hit.value as T;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10_000);
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`mf feed ${res.status}`);
    const data = (await res.json()) as T;
    cache.set(url, { value: data, expires: now + ttlMs });
    return data;
  } catch {
    if (hit) return hit.value as T;
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function toManager(row: Rec): MfManager | null {
  const slug = str(row["slug"]);
  const name = str(row["name"]);
  if (!slug || !name) return null;
  return {
    slug,
    name,
    website: str(row["website"]),
    implemented: row["implemented"] !== false,
    schemeCount: num(row["scheme_count"]) ?? 0,
    reportsUrl: str(row["reports_url"]),
    navUrl: str(row["nav_url"]),
  };
}

export async function getMfManagers(): Promise<MfManager[]> {
  const data = await mfJson<Rec[]>(`/managers`);
  return (data ?? []).flatMap((r) => {
    const m = toManager(r);
    return m ? [m] : [];
  });
}

/** Upstream feed liveness: scheme/manager counts and snapshot freshness. */
export async function getMfFeedHealth(): Promise<MfFeedHealth | null> {
  const data = await mfJson<Rec>(`/health`);
  if (!data || typeof data !== "object") return null;
  const adapters = Array.isArray(data["adapters_implemented"])
    ? (data["adapters_implemented"] as unknown[]).flatMap((a) => (typeof a === "string" ? [a] : []))
    : [];
  return {
    status: str(data["status"]),
    schemes: num(data["schemes"]) ?? 0,
    managers: num(data["managers"]) ?? 0,
    adaptersImplemented: adapters,
    snapshotLoaded: data["snapshot_loaded"] === true,
    snapshotAsOf: str(data["snapshot_as_of"]),
    dbReady: data["db_ready"] === true,
    servingFrom: str(data["serving_from"]),
  };
}

function toScheme(row: Rec): MfScheme | null {
  const symbol = str(row["symbol"]);
  const name = str(row["name"]);
  if (!symbol || !name) return null;
  const aliases = Array.isArray(row["aliases"])
    ? (row["aliases"] as unknown[]).flatMap((a) => (typeof a === "string" ? [a] : []))
    : [];
  return {
    symbol: symbol.toUpperCase(),
    name,
    fundType: str(row["fund_type"]) ?? "close_end",
    manager: str(row["manager"]) ?? "",
    managerSlug: str(row["manager_slug"]),
    units: num(row["units"]),
    paidUp: num(row["paid_up"]),
    faceValue: num(row["face_value"]),
    allotmentDate: str(row["allotment_date"]),
    maturityDate: str(row["maturity_date"]),
    aliases,
  };
}

export async function getMfSchemes(): Promise<MfScheme[]> {
  const data = await mfJson<Rec[]>(`/schemes`);
  const list = Array.isArray(data) ? data : [];
  return list.flatMap((r) => {
    const s = toScheme(r);
    return s ? [s] : [];
  });
}

/** One scheme directly (`/schemes/{symbol}`); null when unknown. */
export async function getMfScheme(symbol: string): Promise<MfScheme | null> {
  const data = await mfJson<Rec>(`/schemes/${encodeURIComponent(symbol.toUpperCase())}`);
  if (!data || typeof data !== "object") return null;
  return toScheme(data);
}

function toPerformance(row: Rec): MfPerformance | null {
  const symbol = str(row["symbol"]);
  if (!symbol) return null;
  return {
    symbol: symbol.toUpperCase(),
    name: str(row["name"]) ?? symbol,
    fundType: str(row["fund_type"]) ?? "close_end",
    manager: str(row["manager"]) ?? "",
    totalPaidUp: num(row["total_paid_up"]),
    maturityDate: str(row["maturity_date"]),
    timeToMature: str(row["time_to_mature"]),
    weeklyNav: num(row["weekly_nav"]),
    monthlyNav: num(row["monthly_nav"]),
    ltp: num(row["ltp"]),
    ltpVsNavPct: num(row["ltp_vs_weekly_nav_pct"]),
    holdingsCount: num(row["holdings_count"]),
    capitalMarketPct: num(row["capital_market_pct"]),
    fixedIncomePct: num(row["fixed_income_pct"]),
    cashPct: num(row["cash_pct"]),
    expectedDividendPct: num(row["expected_dividend_pct"]),
    dataStatus: str(row["data_status"]),
  };
}

export async function getMfPerformance(symbols?: string[]): Promise<MfPerformance[]> {
  const qs =
    symbols && symbols.length > 0 ? `?symbols=${encodeURIComponent(symbols.join(","))}` : "";
  const data = await mfJson<Rec[] | Rec>(`/performance${qs}`);
  const list = Array.isArray(data) ? data : data ? [data] : [];
  return list.flatMap((r) => {
    const p = toPerformance(r as Rec);
    return p ? [p] : [];
  });
}

function toNavPoint(row: Rec): MfNavPoint | null {
  const date = str(row["date"]);
  const nav = num(row["nav"]);
  if (!date || nav == null) return null;
  return { date, nav, adjNav: num(row["adj_nav"]) ?? nav };
}

async function getMfNavHistory(symbol: string): Promise<MfNavPoint[]> {
  const data = await mfJson<{ series?: Rec[] }>(
    `/schemes/${encodeURIComponent(symbol)}/nav-history`,
  );
  const series = Array.isArray(data?.series) ? data!.series! : [];
  return series
    .flatMap((r) => {
      const p = toNavPoint(r);
      return p ? [p] : [];
    })
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

function toHolding(row: Rec): MfHolding | null {
  const stockSymbol = str(row["stock_symbol"]);
  if (!stockSymbol) return null;
  return {
    stockSymbol: stockSymbol.toUpperCase(),
    quantity: num(row["quantity"]),
    ltp: num(row["ltp"]),
    marketValue: num(row["market_value"]),
  };
}

async function getMfHoldings(symbol: string): Promise<MfHolding[]> {
  const data = await mfJson<Rec | Rec[]>(`/schemes/${encodeURIComponent(symbol)}/holdings`);
  // API returns { symbol, count, holdings: [...] } or a flat array
  const list = Array.isArray(data)
    ? data
    : Array.isArray(data?.["holdings"])
      ? (data!["holdings"] as Rec[])
      : [];
  return list
    .flatMap((r) => {
      const h = toHolding(r);
      return h ? [h] : [];
    })
    .sort((a, b) => (b.marketValue ?? 0) - (a.marketValue ?? 0));
}

async function getMfReturns(symbol: string): Promise<MfReturns | null> {
  const data = await mfJson<Rec>(`/schemes/${encodeURIComponent(symbol)}/returns`);
  if (!data || typeof data !== "object") return null;
  const periods = Array.isArray(data["periods"])
    ? (data["periods"] as Rec[]).map((p) => ({
        period: str(p["period"]) ?? "",
        available: p["available"] === true,
        returnPct: num(p["return_pct"]),
        annualized: p["annualized"] === true,
        startDate: str(p["start_date"]),
        startNav: num(p["start_nav"]),
      }))
    : [];
  const si = (data["since_inception"] ?? null) as Rec | null;
  return {
    available: data["available"] === true,
    points: num(data["points"]) ?? 0,
    startDate: str(data["start_date"]),
    asOf: str(data["as_of"]),
    latestNav: num(data["latest_nav"]),
    basis: str(data["basis"]),
    periods,
    sinceInception: si
      ? {
          available: si["available"] === true,
          returnPct: num(si["return_pct"]),
          annualized: si["annualized"] === true,
          startDate: str(si["start_date"]),
          spanYears: num(si["span_years"]),
        }
      : null,
  };
}

/** Full detail bundle for one scheme: five upstream calls in parallel. */
export async function getMfSchemeBundle(symbol: string): Promise<MfSchemeBundle> {
  const upper = symbol.toUpperCase();
  const [direct, schemes, nav, holdings, returns, perf] = await Promise.all([
    getMfScheme(upper),
    getMfSchemes(),
    getMfNavHistory(upper),
    getMfHoldings(upper),
    getMfReturns(upper),
    getMfPerformance([upper]),
  ]);
  return {
    symbol: upper,
    scheme: direct ?? schemes.find((s) => s.symbol === upper) ?? null,
    nav,
    holdings,
    returns,
    performance: perf[0] ?? null,
  };
}

/** SEBON application pipeline for one instrument type (mfs, ipo, right, fpo, debenture). */
export async function getMfPipeline(type: MfPipelineType = "mfs"): Promise<MfPipeline> {
  const data = await mfJson<Rec>(`/applications/${type}`);
  const records = Array.isArray(data?.["records"]) ? (data!["records"] as Rec[]) : [];
  const items: MfPipelineItem[] = records.flatMap((r) => {
    const company = str(r["company"]);
    if (!company) return [];
    return [
      {
        company,
        fundName: str(r["fund_name"]),
        status: str(r["status"]) ?? str(r["remarks"]),
        units: num(r["units"]),
        amount: num(r["amount"]),
        issueManager: str(r["issue_manager"]),
        appliedDate: str(r["date_application"]),
        sector: str(r["sector"]),
        issueType: str(r["issue_type"]),
        remarks: str(r["remarks"]),
      },
    ];
  });
  return {
    type,
    label: str(data?.["label"]),
    count: num(data?.["count"]) ?? items.length,
    totalAmount: num(data?.["total_amount"]),
    asOfBs: str(data?.["as_of_bs"]),
    fiscalYear: str(data?.["fiscal_year"]),
    sourcePdf: str(data?.["source_pdf"]),
    items,
  };
}

/** Index of every SEBON application pipeline with per-type counts and totals. */
export async function getMfPipelineOverview(): Promise<MfPipelineOverview | null> {
  const data = await mfJson<Rec>(`/applications`);
  if (!data || typeof data !== "object") return null;
  const pick = (key: string): MfPipelineType[] =>
    key === "types" && Array.isArray(data[key])
      ? (data[key] as unknown[]).flatMap((t) =>
          typeof t === "string" && ["ipo", "right", "fpo", "debenture", "mfs"].includes(t)
            ? [t as MfPipelineType]
            : [],
        )
      : [];
  const asRecord = (key: string): Record<string, number> => {
    const raw = data[key];
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      const n = num(v);
      if (n != null) out[k] = n;
    }
    return out;
  };
  const labelsRaw = data["labels"];
  const labels: Record<string, string> =
    labelsRaw && typeof labelsRaw === "object" && !Array.isArray(labelsRaw)
      ? Object.fromEntries(
          Object.entries(labelsRaw as Record<string, unknown>).flatMap(([k, v]) =>
            typeof v === "string" ? [[k, v]] : [],
          ),
        )
      : {};
  const topRaw = data["top"];
  const top: Record<string, { company: string | null; amount: number | null }> = {};
  if (topRaw && typeof topRaw === "object" && !Array.isArray(topRaw)) {
    for (const [k, v] of Object.entries(topRaw as Record<string, unknown>)) {
      if (v && typeof v === "object" && !Array.isArray(v)) {
        const row = v as Rec;
        top[k] = { company: str(row["company"]), amount: num(row["amount"]) };
      }
    }
  }
  return {
    types: pick("types"),
    labels,
    counts: asRecord("counts"),
    total: num(data["total"]) ?? 0,
    totalAmount: num(data["total_amount"]),
    totals: asRecord("totals"),
    top,
  };
}

/** Recent SEBON circulars approving mutual-fund issues (newest first). */
export async function getMfApprovals(limit = 8): Promise<MfApproval[]> {
  const data = await mfJson<{ categories?: Record<string, unknown> }>(`/sebon-notices`);
  const raw = data?.categories?.["mfs_approved"];
  const list = Array.isArray(raw) ? (raw as Rec[]) : [];
  return list
    .flatMap((r): MfApproval[] => {
      const title = str(r["title"]);
      if (!title) return [];
      return [
        {
          title,
          bsDate: str(r["bs_date"]),
          adDate: str(r["ad_date"]),
          pdfUrl: str(r["english_url"]) ?? str(r["nepali_url"]),
        },
      ];
    })
    .slice(0, limit);
}

function toDebenture(row: Rec): MfDebenture | null {
  const issuer = str(row["issuer"]);
  const instrument = str(row["instrument"]);
  if (!issuer || !instrument) return null;
  const maturity = row["maturity_bs"];
  return {
    issuer,
    instrument,
    couponPct: num(row["coupon_pct"]),
    tenorYears: num(row["tenor_years"]),
    maturityBs:
      typeof maturity === "string" || typeof maturity === "number" ? String(maturity) : null,
    sector: str(row["sector"]),
    units: num(row["units"]),
    faceValue: num(row["face_value"]),
    amountRegistered: num(row["amount_registered"]),
    publicIssueAmount: num(row["public_issue_amount"]),
    privatePlacementAmount: num(row["private_placement_amount"]),
    issueManager: str(row["issue_manager"]),
    dateBs: str(row["date_bs"]),
    fiscalYear: str(row["fiscal_year"]),
  };
}

/** Full debenture universe for the explorer tool. */
export async function getMfDebentureList(): Promise<MfDebentureList> {
  const data = await mfJson<Rec>(`/debentures`);
  const list = Array.isArray(data?.["debentures"]) ? (data!["debentures"] as Rec[]) : [];
  const summary = (data?.["summary"] ?? {}) as Rec;
  const all = list.flatMap((r) => {
    const d = toDebenture(r);
    return d ? [d] : [];
  });
  return {
    debentures: all,
    summary: {
      count: num(data?.["count"]) ?? all.length,
      issuers: num(summary["issuers"]) ?? 0,
      couponMin: num(summary["coupon_min"]),
      couponMax: num(summary["coupon_max"]),
    },
  };
}

/** Highest-coupon debentures: the fixed-income alternative investors compare against. */
export async function getMfDebentureHighlights(limit = 5): Promise<MfDebentureSummary> {
  const data = await mfJson<Rec>(`/debentures`);
  const list = Array.isArray(data?.["debentures"]) ? (data!["debentures"] as Rec[]) : [];
  const summary = (data?.["summary"] ?? {}) as Rec;
  const all = list.flatMap((r) => {
    const d = toDebenture(r);
    return d ? [d] : [];
  });
  const top = all
    .filter((d) => d.couponPct != null)
    .sort((a, b) => (b.couponPct ?? 0) - (a.couponPct ?? 0))
    .slice(0, limit);
  return {
    count: num(data?.["count"]) ?? all.length,
    issuers: num(summary["issuers"]) ?? 0,
    couponMin: num(summary["coupon_min"]),
    couponMax: num(summary["coupon_max"]),
    top,
  };
}

/** Product catalog per manager (MF blurb, SIP, PMS, …). */
export async function getMfProducts(): Promise<Record<string, MfProduct[]>> {
  const data = await mfJson<Rec[]>(`/products`);
  const out: Record<string, MfProduct[]> = {};
  for (const row of data ?? []) {
    const slug = str(row["slug"]);
    if (!slug) continue;
    const products = Array.isArray(row["products"]) ? (row["products"] as Rec[]) : [];
    out[slug] = products.flatMap((p): MfProduct[] => {
      const type = str(p["type"]);
      const label = str(p["label"]);
      if (!type || !label) return [];
      return [{ type, label, description: str(p["description"]), url: str(p["url"]) }];
    });
  }
  return out;
}

function aggregateSlices(
  all: { symbol: string; holdings: MfHolding[] }[],
  top: number,
): MfHoldingsMap {
  const byStock = new Map<string, { marketValue: number; schemes: Set<string> }>();
  let covered = 0;
  for (const { symbol, holdings } of all) {
    if (holdings.length === 0) continue;
    covered += 1;
    for (const h of holdings) {
      if ((h.marketValue ?? 0) <= 0) continue;
      const entry = byStock.get(h.stockSymbol) ?? { marketValue: 0, schemes: new Set<string>() };
      entry.marketValue += h.marketValue ?? 0;
      entry.schemes.add(symbol);
      byStock.set(h.stockSymbol, entry);
    }
  }
  const total = [...byStock.values()].reduce((s, e) => s + e.marketValue, 0);
  const slices = [...byStock.entries()]
    .map(([stockSymbol, e]) => ({
      stockSymbol,
      marketValue: e.marketValue,
      weightPct: total > 0 ? (e.marketValue / total) * 100 : 0,
      schemes: e.schemes.size,
    }))
    .sort((a, b) => b.marketValue - a.marketValue)
    .slice(0, top);
  return { totalMarketValue: total, coverage: `${covered}/${all.length}`, slices };
}

async function cachedMap(key: string, build: () => Promise<MfHoldingsMap>): Promise<MfHoldingsMap> {
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value as MfHoldingsMap;
  const value = await build();
  cache.set(key, { value, expires: Date.now() + TTL_MAP });
  return value;
}

/** House-level stock map: every holding of every scheme run by one manager. */
export async function getMfManagerHoldings(slug: string, top = 15): Promise<MfHoldingsMap> {
  const key = `mf:manager-holdings:${slug.toLowerCase()}:${top}`;
  return cachedMap(key, async () => {
    const [schemes, managers] = await Promise.all([getMfSchemes(), getMfManagers()]);
    const name = managers.find((m) => m.slug.toLowerCase() === slug.toLowerCase())?.name;
    const list = schemes.filter(
      (s) =>
        (s.managerSlug ?? "").toLowerCase() === slug.toLowerCase() ||
        (!s.managerSlug && name != null && s.manager === name),
    );
    const all = await Promise.all(
      list.map(async (s) => ({ symbol: s.symbol, holdings: await getMfHoldings(s.symbol) })),
    );
    return aggregateSlices(all, top);
  });
}

/** Market-wide stock map: every disclosed holding of every scheme, combined. */
export async function getMfMarketHoldings(top = 20): Promise<MfHoldingsMap> {
  const key = `mf:market-holdings:${top}`;
  return cachedMap(key, async () => {
    const schemes = await getMfSchemes();
    const all = await Promise.all(
      schemes.map(async (s) => ({ symbol: s.symbol, holdings: await getMfHoldings(s.symbol) })),
    );
    return aggregateSlices(all, top);
  });
}

/** Full product dossier for one manager: documents, SIP, portals, scheme facts. */
export async function getMfManagerProduct(slug: string): Promise<MfManagerProductDetail | null> {
  const data = await mfJson<Rec>(`/products/${encodeURIComponent(slug.toLowerCase())}`);
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const docs = Array.isArray(data["documents"]) ? (data["documents"] as Rec[]) : [];
  const portals = Array.isArray(data["portals"]) ? (data["portals"] as Rec[]) : [];
  const schemesDetail = Array.isArray(data["schemes_detail"])
    ? (data["schemes_detail"] as Rec[])
    : [];
  return {
    slug: slug.toLowerCase(),
    name: str(data["name"]),
    website: str(data["website"]),
    sipOffered: data["sip_offered"] === true,
    sipDetail: str(data["sip_detail"]),
    portals: portals.flatMap((p) => {
      const label = str(p["label"]);
      const url = str(p["url"]);
      return label && url ? [{ label, url }] : [];
    }),
    documents: docs.flatMap((d) => {
      const title = str(d["title"]);
      return title
        ? [
            {
              title,
              category: str(d["category"]),
              url: str(d["url"]),
              scheme: str(d["scheme"]),
              date: str(d["date"]),
            },
          ]
        : [];
    }),
    schemesDetail: schemesDetail.flatMap((s) => {
      const scheme = str(s["scheme"]);
      if (!scheme) return [];
      const facts = Array.isArray(s["facts"]) ? (s["facts"] as Rec[]) : [];
      return [
        {
          scheme,
          facts: facts.flatMap((f) => {
            const label = str(f["label"]);
            const value = str(f["value"]);
            return label && value ? [{ label, value }] : [];
          }),
        },
      ];
    }),
  };
}

/** Curated facts + scheme variants for one manager house. */
export async function getMfManagerFacts(slug: string): Promise<MfManagerFacts | null> {
  const data = await mfJson<Rec[]>(`/products/compare/mutual_fund`);
  const row = (data ?? []).find((r) => (str(r["slug"]) ?? "").toLowerCase() === slug.toLowerCase());
  if (!row) return null;
  const facts = Array.isArray(row["facts"]) ? (row["facts"] as Rec[]) : [];
  const variants = Array.isArray(row["variants"]) ? (row["variants"] as Rec[]) : [];
  return {
    slug,
    capital: str(row["capital"]) ?? str(row["name"]),
    facts: facts.flatMap((f) => {
      const label = str(f["label"]);
      const value = str(f["value"]);
      return label && value ? [{ label, value }] : [];
    }),
    variants: variants.flatMap((v) => {
      const name = str(v["name"]);
      return name ? [{ name, description: str(v["description"]) }] : [];
    }),
  };
}

function toFactPairs(raw: unknown): { label: string; value: string }[] {
  if (!Array.isArray(raw)) return [];
  return (raw as Rec[]).flatMap((f) => {
    const label = str(f["label"]);
    const value = str(f["value"]);
    return label && value ? [{ label, value }] : [];
  });
}

/** Full per-house product detail: products, portals, documents, scheme facts (`/products/{slug}`). */
export async function getMfManagerDetail(slug: string): Promise<MfManagerDetail | null> {
  const data = await mfJson<Rec>(`/products/${encodeURIComponent(slug.toLowerCase())}`);
  if (!data || typeof data !== "object" || !str(data["slug"])) return null;
  const products = Array.isArray(data["products"]) ? (data["products"] as Rec[]) : [];
  const portals = Array.isArray(data["portals"]) ? (data["portals"] as Rec[]) : [];
  const documents = Array.isArray(data["documents"]) ? (data["documents"] as Rec[]) : [];
  const schemesDetail = Array.isArray(data["schemes_detail"])
    ? (data["schemes_detail"] as Rec[])
    : [];
  const offersRaw = data["offers"];
  const offers: Record<string, boolean> =
    offersRaw && typeof offersRaw === "object" && !Array.isArray(offersRaw)
      ? Object.fromEntries(
          Object.entries(offersRaw as Record<string, unknown>).map(([k, v]) => [k, v === true]),
        )
      : {};
  const verified = (data["facts_verified"] ?? null) as Rec | null;
  const detailed: MfProductDetail[] = products.flatMap((p): MfProductDetail[] => {
    const type = str(p["type"]);
    const label = str(p["label"]);
    if (!type || !label) return [];
    const features = Array.isArray(p["features"])
      ? (p["features"] as unknown[]).flatMap((f) => (typeof f === "string" ? [f] : []))
      : [];
    const variants = Array.isArray(p["variants"]) ? (p["variants"] as Rec[]) : [];
    return [
      {
        type,
        label,
        description: str(p["description"]),
        url: str(p["url"]),
        overview: str(p["overview"]),
        facts: toFactPairs(p["facts"]),
        features,
        variants: variants.flatMap((v) => {
          const name = str(v["name"]);
          return name ? [{ name, description: str(v["description"]) }] : [];
        }),
        howToApply: str(p["how_to_apply"]),
      },
    ];
  });
  return {
    slug: str(data["slug"]) ?? slug,
    name: str(data["name"]),
    website: str(data["website"]),
    confidence: str(data["confidence"]),
    sipOffered: data["sip_offered"] === true,
    sipDetail: str(data["sip_detail"]),
    offers,
    factsVerified: {
      date: verified ? str(verified["date"]) : null,
      checked: verified ? num(verified["checked"]) : null,
      confirmed: verified ? num(verified["confirmed"]) : null,
    },
    products: detailed,
    portals: portals.flatMap((p): MfPortal[] => {
      const label = str(p["label"]);
      const url = str(p["url"]);
      return label && url ? [{ label, url }] : [];
    }),
    documents: documents.flatMap((d): MfDocument[] => {
      const title = str(d["title"]);
      if (!title) return [];
      return [
        {
          title,
          category: str(d["category"]),
          url: str(d["url"]),
          scheme: str(d["scheme"]),
          date: str(d["date"]),
        },
      ];
    }),
    schemesDetail: schemesDetail.flatMap((s): MfSchemeFacts[] => {
      const scheme = str(s["scheme"]);
      if (!scheme) return [];
      return [{ scheme, facts: toFactPairs(s["facts"]) }];
    }),
  };
}
