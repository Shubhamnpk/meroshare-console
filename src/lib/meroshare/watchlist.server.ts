// Server-only watchlist persistence, backed by the session cookie.
import { getMeroShareSession, readSession } from "./session.server";

const MAX_SYMBOLS = 50;

/** Read the current watchlist from the session (empty array if not logged in). */
export async function getWatchlist(): Promise<string[]> {
  const data = await readSession();
  if (!data.token && !data.demo) return [];
  return Array.isArray(data.watchlist) ? data.watchlist : [];
}

/** Overwrite the watchlist in the session. Deduplicates and caps at MAX_SYMBOLS. */
export async function updateWatchlist(symbols: string[]): Promise<string[]> {
  const session = await getMeroShareSession();
  const deduped = [...new Set(symbols.map((s) => s.toUpperCase()))].slice(0, MAX_SYMBOLS);
  await session.update({ watchlist: deduped });
  return deduped;
}
