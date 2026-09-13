import { createServerFn } from "@tanstack/react-start";
import { fetchUdfHistory, udfResolutionFor, udfToBars } from "./udf";
import type { UdfResolution } from "./udf";

export const getUdfHistory = createServerFn({ method: "GET" })
  .validator(
    (input: unknown) =>
      input as { symbol: string; range: string; intradayRes?: UdfResolution | null },
  )
  .handler(async ({ data }) => {
    const sym = data.symbol.toUpperCase();
    const r = data.range as Parameters<typeof udfResolutionFor>[0];
    const res = (data.intradayRes ?? udfResolutionFor(r)) as UdfResolution;
    const now = Math.floor(Date.now() / 1000);
    const days =
      r === "1D"
        ? 1
        : r === "1W"
          ? 7
          : r === "1M"
            ? 30
            : r === "3M"
              ? 90
              : r === "6M"
                ? 180
                : r === "1Y"
                  ? 365
                  : 365 * 3;
    const from = now - days * 86400;
    const h = await fetchUdfHistory({ symbol: sym, resolution: res, from, to: now });
    const bars = udfToBars(h);
    const points = bars.map((b) => ({ time: b.time, value: b.close }));
    return { bars, points, raw: h, resolution: res };
  });
