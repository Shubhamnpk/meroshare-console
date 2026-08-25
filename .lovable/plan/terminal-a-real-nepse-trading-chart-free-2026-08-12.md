# Terminal: a real NEPSE trading chart (free)

## How NepseAlpha / "NEPSE Chart" sites actually do it

I checked the two you mentioned and tested their data paths:

- They do **not** get NEPSE from TradingView. TradingView has no Nepali symbols. They render charts with a **free TradingView library** — either Lightweight Charts (Apache-2.0, no permission needed) or Advanced Charts (free but you must request a licence key) — and then plug in **their own datafeed**.
- The datafeed is NEPSE's own public site API, scraped and stored daily on their servers. NepseAlpha serves it from `nepsealpha.com/trading/1/history` in TradingView's UDF format. I tried it: it is behind Cloudflare and returns 403 to anyone who isn't their own page, so it can't be used directly.

So the free recipe is exactly the one we're already half on: **our own cached NEPSE mirror + Lightweight Charts**. What's missing is depth, indicators and the terminal UX.

## What I verified is available to us today, free, no key

- `nepse.bitnepal.net` — daily high/low/close + volume/turnover/trades for every scrip, ~224 sessions back; plus same-day intraday tick series; plus intraday index series.
- YONEPSE archive — daily close + volume + turnover + trades for 438 scrips, **monthly files going back to 2012-01**. That is our long history.

Combining both gives real candles for the last year and a continuous close/volume series for 14 years.

## The new page: `/terminal`

Replaces the current thin `/chart` page (its route stays and redirects, so old links keep working).

**Chart**

- Candlesticks with a volume histogram pane underneath.
- Timeframes: 1D (intraday line), 1W, 1M, 3M, 6M, 1Y (true candles), 5Y and Max (close line from the 2012 archive).
- Chart type switch: candles / line / area.
- Crosshair legend showing O H L C, change % and volume for the hovered bar, like the Nepali chart sites.
- Log scale toggle, fullscreen toggle, and a PNG snapshot button.

**Indicators** (computed in the browser from the same bars, nothing extra fetched)

- Overlays: SMA, EMA (configurable periods), Bollinger Bands, VWAP.
- Panes: RSI 14, MACD, volume.
- A small indicator menu with on/off toggles that persists per user in local storage.

**Symbol switching**

- Search across all listed scrips, recent-symbols row, and your holdings + watchlist listed as one-tap chips so you jump straight to what you own.
- Indices are chartable too (NEPSE, Sensitive, sector indices).

**Compare / net worth**

- A "Compare" selector to overlay a second symbol or the NEPSE index, normalised to percent so the two are readable together.
- A **Portfolio** tab that charts your own net worth over time from the existing portfolio history series, with NEPSE overlaid — so you can see whether you're beating the market. Day/月 granularity switch and total return figures beside it.

**Below the chart**

- Live quote strip: LTP, change, day range, 52-week range, volume, turnover, previous close.
- Your position in that scrip if you hold it: units, WACC, market value, unrealised P/L.
- Key fundamentals already in our feed: EPS, P/E, paid-up capital, net worth, last dividend.

## Mobile

Chart fills the viewport width with a compact toolbar; timeframe and indicator controls collapse into a bottom sheet; pinch-zoom and drag-scroll are enabled; the quote strip becomes a two-column card grid. Desktop gets the toolbar inline and a right-hand symbol list.

## Technical notes

- New server function `getChartSeries({ symbol, range, resolution })` in the NEPSE layer: merges bitnepal OHLC (recent, true high/low) with the YONEPSE monthly archive (long, close-only, synthesised open from prior close), dedupes by date, and returns bars + volume in one payload. Cached with the existing TTL cache — 60s for intraday, longer for history.
- Indices get `getIndexSeries` off the same shape so the chart component doesn't care what it is drawing.
- Indicator math lives in a pure `src/lib/nepse/indicators.ts` (SMA/EMA/RSI/MACD/Bollinger/VWAP) — no dependency added.
- Chart component is rewritten on `lightweight-charts` (already installed) with volume + extra panes and a resize observer; the unused external TradingView widget component is deleted since NEPSE symbols don't exist there.
- Everything is labelled indicative, sourced from public mirrors, and never used for order placement.

## Build order

1. Chart data layer (merged OHLC + index series + caching)
2. Terminal chart component: candles, volume, timeframes, crosshair legend
3. Indicators + settings persistence
4. Symbol search, holdings/watchlist chips, compare overlay
5. Portfolio-vs-NEPSE tab, quote strip and fundamentals panel
6. Mobile pass, `/chart` redirect, nav entry
