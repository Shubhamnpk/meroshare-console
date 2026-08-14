import { getChartSeries } from "../src/lib/nepse/feed.server";
for (const r of ["1D","1Y","5Y"] as const) {
  const s = await getChartSeries("NABIL", r);
  console.log(r, s.bars.length, s.intraday.length, s.hasSynthetic, s.bars[0], s.bars.at(-1));
}
