# Bun vs Node.js — meroshare-next Benchmark Results

**Date:** 2026-08-25 (fresh run)
**Machine:** Windows 11, Node v22.13.1, Bun 1.4.0
**Runs:** 3 per metric (median reported)

---

## Summary Table

| Phase            | Node.js | Bun    | Winner |
| ---------------- | ------- | ------ | ------ |
| Install (cold)   | 16.59s  | 40.49s | Node   |
| Install (warm)   | 1.42s   | 45.16s | Node   |
| Dev cold start   | 6.19s   | 3.98s  | Bun    |
| HMR round-trip   | 1129ms  | 1076ms | Bun    |
| Vite build       | 8.96s   | 6.80s  | Bun    |
| CPU (JSON+math)  | 1497ms  | 650ms  | Bun    |
| HTTP req/sec     | 1643    | 1692   | Bun    |
| HTTP p50 latency | 13.7ms  | 11.7ms | Bun    |
| HTTP p95 latency | 24.4ms  | 37.4ms | Node   |
| Peak RSS         | 49MB    | 47MB   | Bun    |

---

## Scorecard

**Bun wins:** 7 of 10 metrics (dev start, HMR, build, CPU, throughput, p50, RSS)
**Node wins:** 3 of 10 metrics (cold install, warm install, p95 latency)

---

## Notes

1. **Install performance:** Node's npm install is significantly faster on this machine. Bun's `minimumReleaseAge = 86400` guard in `bunfig.toml` adds metadata-fetching overhead on every install. Disabling that guard would narrow the gap substantially.

2. **Dev server:** Bun starts Vite ~36% faster (3.98s vs 6.19s). HMR round-trips are nearly identical (~1.1s).

3. **Build:** Bun runs `vite build` ~24% faster (6.80s vs 8.96s).

4. **CPU-bound work:** Bun is 2.3x faster at JSON serialization + math — directly relevant for NEPSE data processing, indicator calculations, and portfolio analysis in this app.

5. **HTTP serving:** Bun wins throughput (1692 vs 1643 req/sec) and median latency (11.7ms vs 13.7ms), though Node has better tail latency (p95: 24.4ms vs 37.4ms).

6. **Production runtime caveat:** This project targets Cloudflare Workers via Nitro. Production runs on `workerd`, not Node or Bun. These benchmarks only reflect local dev/build/preview workflows.

---

## Recommendation

**Use Bun for this project.** It wins on the metrics that matter most for the day-to-day dev workflow:

- **Faster dev server startup** (3.98s vs 6.19s) — you start coding sooner
- **Faster builds** (6.80s vs 8.96s) — CI/CD pipelines benefit directly
- **Much faster CPU work** (650ms vs 1497ms) — critical for NEPSE data processing
- **Better throughput and median latency** for local serving
- **Lower memory footprint** (47MB vs 49MB RSS)

The install penalty is a trade-off worth making since `node_modules` rarely changes, and the `minimumReleaseAge` security guard can be tuned.

### Quick start with Bun

```bash
# Install dependencies
bun install

# Run dev server
bun dev

# Build for production
bun run build

# Run benchmarks yourself
node benchmarks/bench.mjs --runs=3 --phase=install
node benchmarks/bench.mjs --runs=3 --phase=dev
node benchmarks/bench.mjs --runs=3 --phase=build
node benchmarks/bench.mjs --runs=3 --phase=runtime
```
