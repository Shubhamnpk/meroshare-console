/**
 * Global (non-NEPSE) transaction import: Trading 212 broker statements plus
 * our own standard CSV. Holds no NEPSE logic — see lib/meroshare for demat.
 */

export type GlobalTxnSide = "BUY" | "SELL" | "DIV" | "CASH";
export type GlobalTxnSource = "trading212" | "standard";

export interface GlobalTxn {
  id: string;
  /** ISO timestamp. */
  date: string;
  /** Raw broker ticker, e.g. RR, AVGO, RELIANCE.NS. Empty for cash moves. */
  symbol: string;
  name: string;
  isin: string;
  side: GlobalTxnSide;
  qty: number;
  /** Native per-share price (0 for cash moves). */
  price: number;
  /** Native currency: GBX, USD, EUR, GBP, INR, ... */
  currency: string;
  /** Native cost basis (qty * price + native fees). */
  costNative: number;
  /** GBP cost basis when the file states it (Trading 212 Total + fees). */
  costGbp: number | null;
  /** Stated fees in GBP (Trading 212 fee columns), informational. */
  feesGbp: number;
  /** Broker-stated result in GBP (Trading 212 sells), informational. */
  resultGbp: number | null;
  notes: string;
  source: GlobalTxnSource;
}

export interface ImportError {
  line: number;
  message: string;
}

export interface ImportResult {
  format: GlobalTxnSource;
  txns: GlobalTxn[];
  errors: ImportError[];
}

/** Our standard import format (also downloadable as a template). */
export const STANDARD_CSV_TEMPLATE = [
  "symbol,name,side,quantity,price,currency,date,fees,notes",
  '# side is one of BUY, SELL, DIV, CASH; date is YYYY-MM-DD or ISO; lines starting with # are ignored',
  '# example: AAPL,Apple,BUY,0.5,307.9,USD,2026-07-06,0.1,first lot',
].join("\n");

/** Try-it-now data in the standard format (a few real-world-shaped lots). */
export const DEMO_GLOBAL_CSV = [
  "symbol,name,side,quantity,price,currency,date,fees,notes",
  "AAPL,Apple,BUY,0.5,307.9,USD,2026-07-06,0.1,demo lot 1",
  "AAPL,Apple,BUY,0.085,320.26,USD,2026-09-08,0.03,demo lot 2",
  "AAPL,Apple,SELL,0.1,353.37,USD,2026-09-08,0.02,partial trim",
  "RR.L,Rolls-Royce,BUY,0.08,1505.8,GBX,2026-07-06,0.01,demo UK lot",
  "RELIANCE.NS,Reliance Industries,BUY,2,1180,INR,2026-08-05,0,demo NSE lot",
  "BATS.L,British American Tobacco,DIV,0.0267,61.26,GBX,2026-08-14,0,demo dividend",
].join("\n");

const T212_BUYS = new Set(["MARKET BUY", "LIMIT BUY", "STOP BUY", "STOP LIMIT BUY"]);
const T212_SELLS = new Set(["MARKET SELL", "LIMIT SELL", "STOP SELL", "STOP LIMIT SELL"]);
const T212_CASH = new Set(["DEPOSIT", "WITHDRAWAL", "INTEREST ON CASH", "RESULT ADJUSTMENT"]);

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i] ?? "";
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function num(value: string | undefined): number {
  if (value == null || value === "") return NaN;
  const parsed = Number(value.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : NaN;
}

function isoDate(value: string): string | null {
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

/** Yahoo-ready ticker: LSE pence → .L suffix, everything else as-is. */
export function yahooSymbolFor(ticker: string, currency: string): string {
  const t = ticker.trim().toUpperCase();
  const ccy = currency.trim().toUpperCase();
  if ((ccy === "GBX" || ccy === "GBP") && !t.includes(".")) return `${t}.L`;
  return t;
}

function parseTrading212(text: string): ImportResult {
  const txns: GlobalTxn[] = [];
  const errors: ImportError[] = [];
  const lines = text.split("\n");
  lines.forEach((rawLine, idx) => {
    const lineNo = idx + 1;
    if (lineNo === 1 || rawLine.trim() === "") return;
    const c = splitCsvLine(rawLine);
    const cell = (i: number): string => c[i] ?? "";
    const action = cell(0).toUpperCase();
    const date = isoDate(cell(1));
    if (!date) {
      errors.push({ line: lineNo, message: `Bad timestamp "${cell(1)}"` });
      return;
    }
    const id = cell(6) || `t212-${lineNo}`;
    const symbol = cell(3).toUpperCase();
    const name = cell(4);
    const isin = cell(2);
    const qty = num(cell(7));
    const price = num(cell(8));
    const currency = cell(9).toUpperCase();
    // Total is already in GBP and already includes the stated fees.
    const totalGbp = num(cell(13));
    const feesGbp = num(cell(15)) + num(cell(17)) + num(cell(19));
    if (T212_BUYS.has(action) || T212_SELLS.has(action)) {
      if (!symbol) {
        errors.push({ line: lineNo, message: `Missing ticker for ${cell(0)}` });
        return;
      }
      if (!(qty > 0) || !(price >= 0)) {
        errors.push({ line: lineNo, message: `Bad quantity/price for ${symbol}` });
        return;
      }
      const side: GlobalTxnSide = T212_BUYS.has(action) ? "BUY" : "SELL";
      txns.push({
        id,
        date,
        symbol,
        name,
        isin,
        side,
        qty,
        price,
        currency,
        costNative: qty * price,
        costGbp: Number.isFinite(totalGbp) ? totalGbp : null,
        feesGbp: Number.isFinite(feesGbp) ? feesGbp : 0,
        resultGbp: side === "SELL" && Number.isFinite(num(cell(11))) ? num(cell(11)) : null,
        notes: cell(5),
        source: "trading212",
      });
      return;
    }
    if (action === "DIVIDEND (DIVIDEND)" || action === "DIVIDEND") {
      txns.push({
        id,
        date,
        symbol,
        name,
        isin,
        side: "DIV",
        qty: Number.isFinite(qty) ? qty : 0,
        price: Number.isFinite(price) ? price : 0,
        currency,
        costNative: 0,
        costGbp: Number.isFinite(totalGbp) ? totalGbp : null,
        feesGbp: 0,
        resultGbp: null,
        notes: name ? `${name} dividend` : "Dividend",
        source: "trading212",
      });
      return;
    }
    if (T212_CASH.has(action)) {
      txns.push({
        id,
        date,
        symbol: "",
        name: cell(5) || cell(0),
        isin: "",
        side: "CASH",
        qty: 0,
        price: 0,
        currency: cell(14).toUpperCase() || "GBP",
        costNative: 0,
        costGbp: Number.isFinite(totalGbp) ? totalGbp : null,
        feesGbp: 0,
        resultGbp: null,
        notes: cell(5),
        source: "trading212",
      });
      return;
    }
    errors.push({ line: lineNo, message: `Unknown action "${cell(0)}" — row skipped` });
  });
  return { format: "trading212", txns, errors };
}

const STANDARD_SIDES: Record<string, GlobalTxnSide> = {
  BUY: "BUY",
  SELL: "SELL",
  DIV: "DIV",
  DIVIDEND: "DIV",
  CASH: "CASH",
};

function parseStandard(text: string): ImportResult {
  const txns: GlobalTxn[] = [];
  const errors: ImportError[] = [];
  const lines = text.split("\n");
  lines.forEach((rawLine, idx) => {
    const lineNo = idx + 1;
    const trimmed = rawLine.trim();
    if (lineNo === 1 || trimmed === "" || trimmed.startsWith("#")) return;
    const c = splitCsvLine(rawLine);
    if (c.length < 8) {
      errors.push({ line: lineNo, message: `Expected 8-9 columns, got ${c.length}` });
      return;
    }
    const side = STANDARD_SIDES[(c[2] ?? "").toUpperCase()];
    if (!side) {
      errors.push({ line: lineNo, message: `Bad side "${c[2]}" (BUY/SELL/DIV/CASH)` });
      return;
    }
    const qty = num(c[3]);
    const price = num(c[4]);
    const date = isoDate(c[6] ?? "");
    if (!date) {
      errors.push({ line: lineNo, message: `Bad date "${c[6]}"` });
      return;
    }
    if (side !== "CASH" && !(qty > 0)) {
      errors.push({ line: lineNo, message: `Quantity must be > 0 for ${side}` });
      return;
    }
    if (!(price >= 0)) {
      errors.push({ line: lineNo, message: `Bad price "${c[4]}"` });
      return;
    }
    const currency = (c[5] ?? "").toUpperCase();
    if (!currency) {
      errors.push({ line: lineNo, message: "Missing currency" });
      return;
    }
    const fees = num(c[7]);
    const symbol = (c[0] ?? "").toUpperCase();
    if (side !== "CASH" && !symbol) {
      errors.push({ line: lineNo, message: "Missing symbol" });
      return;
    }
    txns.push({
      id: `std-${lineNo}`,
      date,
      symbol,
      name: c[1] ?? "",
      isin: "",
      side,
      qty: side === "CASH" ? 0 : qty,
      price: side === "CASH" ? 0 : price,
      currency,
      costNative: side === "CASH" ? 0 : qty * price + (Number.isFinite(fees) ? fees : 0),
      costGbp: null,
      feesGbp: 0,
      resultGbp: null,
      notes: c[8] ?? "",
      source: "standard",
    });
  });
  return { format: "standard", txns, errors };
}

/** Auto-detect the CSV dialect; null when unrecognized. */
export function detectImportFormat(text: string): GlobalTxnSource | null {
  const first = text.split("\n").map((l) => l.trim()).find((l) => l !== "" && !l.startsWith("#")) ?? "";
  if (first.toUpperCase().startsWith("ACTION,")) return "trading212";
  if (first.toUpperCase().startsWith("SYMBOL,")) return "standard";
  return null;
}

export function parseImport(text: string): ImportResult | null {
  const format = detectImportFormat(text);
  if (format === "trading212") return parseTrading212(text);
  if (format === "standard") return parseStandard(text);
  return null;
}
