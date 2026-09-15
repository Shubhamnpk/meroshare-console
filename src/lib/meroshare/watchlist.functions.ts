// Client-callable server functions for watchlist sync.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getWatchlist, updateWatchlist } from "./watchlist.server";

/** Fetch the server-persisted watchlist (returns [] if not logged in). */
export const fetchServerWatchlist = createServerFn({ method: "GET" }).handler(
  async (): Promise<string[]> => getWatchlist(),
);

/** Push the full watchlist array to the session. Returns the deduped/capped result. */
export const pushWatchlist = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z.object({ symbols: z.array(z.string()) }).parse(input),
  )
  .handler(async ({ data }): Promise<string[]> => updateWatchlist(data.symbols));
