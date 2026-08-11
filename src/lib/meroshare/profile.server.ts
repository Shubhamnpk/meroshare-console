// Server-only helpers for normalising MeroShare account profile records.
import type { JsonRecord } from "./types";

export function str(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim() !== "") return value.trim();
  if (typeof value === "number") return String(value);
  return undefined;
}

/** First non-empty value among `keys` in `record`. */
export function pick(record: JsonRecord, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = str(record[key]);
    if (value) return value;
  }
  return undefined;
}
