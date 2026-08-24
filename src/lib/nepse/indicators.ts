// Pure technical-indicator math for the trading terminal.
// Client-safe: no fetches, no server imports. Everything is computed from the
// same bar series the chart already has, so no extra network calls.

export interface Bar {
  /** "YYYY-MM-DD" */
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface LinePoint {
  date: string;
  value: number;
}

/** Simple moving average. Leading bars without enough history are skipped. */
export function sma(bars: Bar[], period: number): LinePoint[] {
  if (period < 1) return [];
  const out: LinePoint[] = [];
  let sum = 0;
  for (let i = 0; i < bars.length; i++) {
    sum += bars[i]!.close;
    if (i >= period) sum -= bars[i - period]!.close;
    if (i >= period - 1) out.push({ date: bars[i]!.date, value: sum / period });
  }
  return out;
}

/** Exponential moving average, seeded with the first `period` SMA. */
export function ema(bars: Bar[], period: number): LinePoint[] {
  if (period < 1 || bars.length < period) return [];
  const k = 2 / (period + 1);
  const out: LinePoint[] = [];
  let prev = 0;
  for (let i = 0; i < period; i++) prev += bars[i]!.close / period;
  out.push({ date: bars[period - 1]!.date, value: prev });
  for (let i = period; i < bars.length; i++) {
    prev = bars[i]!.close * k + prev * (1 - k);
    out.push({ date: bars[i]!.date, value: prev });
  }
  return out;
}

function emaValues(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (values.length < period) return out;
  const k = 2 / (period + 1);
  let prev = 0;
  for (let i = 0; i < period; i++) prev += values[i]! / period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev = values[i]! * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

export interface BollingerBands {
  upper: LinePoint[];
  middle: LinePoint[];
  lower: LinePoint[];
}

/** Bollinger Bands (SMA ± n standard deviations). */
export function bollinger(bars: Bar[], period = 20, mult = 2): BollingerBands {
  const upper: LinePoint[] = [];
  const middle: LinePoint[] = [];
  const lower: LinePoint[] = [];
  for (let i = period - 1; i < bars.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += bars[j]!.close;
    const mean = sum / period;
    let variance = 0;
    for (let j = i - period + 1; j <= i; j++) variance += (bars[j]!.close - mean) ** 2;
    const sd = Math.sqrt(variance / period);
    const date = bars[i]!.date;
    middle.push({ date, value: mean });
    upper.push({ date, value: mean + mult * sd });
    lower.push({ date, value: mean - mult * sd });
  }
  return { upper, middle, lower };
}

/** Wilder's RSI. */
export function rsi(bars: Bar[], period = 14): LinePoint[] {
  if (bars.length <= period) return [];
  const out: LinePoint[] = [];
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = bars[i]!.close - bars[i - 1]!.close;
    if (diff >= 0) gain += diff;
    else loss -= diff;
  }
  gain /= period;
  loss /= period;
  const rsiFrom = (g: number, l: number) => (l === 0 ? 100 : 100 - 100 / (1 + g / l));
  out.push({ date: bars[period]!.date, value: rsiFrom(gain, loss) });
  for (let i = period + 1; i < bars.length; i++) {
    const diff = bars[i]!.close - bars[i - 1]!.close;
    const up = diff > 0 ? diff : 0;
    const down = diff < 0 ? -diff : 0;
    gain = (gain * (period - 1) + up) / period;
    loss = (loss * (period - 1) + down) / period;
    out.push({ date: bars[i]!.date, value: rsiFrom(gain, loss) });
  }
  return out;
}

export interface MacdSeries {
  macd: LinePoint[];
  signal: LinePoint[];
  histogram: LinePoint[];
}

/** MACD (fast EMA − slow EMA) with a signal EMA and histogram. */
export function macd(bars: Bar[], fast = 12, slow = 26, signalPeriod = 9): MacdSeries {
  const closes = bars.map((b) => b.close);
  const fastEma = emaValues(closes, fast);
  const slowEma = emaValues(closes, slow);
  const macdLine: LinePoint[] = [];
  const macdRaw: number[] = [];
  const macdDates: string[] = [];
  for (let i = 0; i < bars.length; i++) {
    const f = fastEma[i];
    const s = slowEma[i];
    if (f == null || s == null) continue;
    const value = f - s;
    macdLine.push({ date: bars[i]!.date, value });
    macdRaw.push(value);
    macdDates.push(bars[i]!.date);
  }
  const signalValues = emaValues(macdRaw, signalPeriod);
  const signal: LinePoint[] = [];
  const histogram: LinePoint[] = [];
  for (let i = 0; i < macdRaw.length; i++) {
    const s = signalValues[i];
    if (s == null) continue;
    const date = macdDates[i]!;
    signal.push({ date, value: s });
    histogram.push({ date, value: macdRaw[i]! - s });
  }
  return { macd: macdLine, signal, histogram };
}

/** Rolling VWAP over the visible series (typical price weighted by volume). */
export function vwap(bars: Bar[]): LinePoint[] {
  let pv = 0;
  let vol = 0;
  const out: LinePoint[] = [];
  for (const bar of bars) {
    const typical = (bar.high + bar.low + bar.close) / 3;
    pv += typical * bar.volume;
    vol += bar.volume;
    out.push({ date: bar.date, value: vol > 0 ? pv / vol : bar.close });
  }
  return out;
}

/** Percent change of every point relative to the first, for comparing two series. */
export function normalise(points: LinePoint[]): LinePoint[] {
  const base = points.find((p) => p.value > 0)?.value;
  if (!base) return [];
  return points.map((p) => ({ date: p.date, value: ((p.value - base) / base) * 100 }));
}
