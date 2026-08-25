import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BENCH_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(BENCH_DIR, "..");
const WORK = path.join(os.tmpdir(), "opencode", "meroshare-bench");
const RESULTS_FILE = path.join(BENCH_DIR, "results.json");

const args = process.argv.slice(2);
const opt = (name, def) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=")[1] : def;
};
const RUNS = parseInt(opt("runs", "3"), 10);
const PHASE = opt("phase", "all");

const findBun = () => {
  const candidates = [
    path.join(os.homedir(), ".bun", "bin", "bun.exe"),
    "C:\\Users\\shubh\\.bun\\bin\\bun.exe",
  ];
  for (const c of candidates) if (fs.existsSync(c)) return c;
  const w = spawnSync("where", ["bun"], { shell: true });
  if (w.status === 0) {
    const first = w.stdout.toString().split(/\r?\n/)[0].trim();
    if (first && fs.existsSync(first)) return first;
  }
  return null;
};

const BUN_EXE = findBun();
if (!BUN_EXE) {
  console.error("bun.exe not found. Install bun first.");
  process.exit(1);
}
const NPM_CLI = path.join(
  path.dirname(process.execPath),
  "node_modules",
  "npm",
  "bin",
  "npm-cli.js",
);
const npm = (args) => [process.execPath, [NPM_CLI, ...args]];

const EXCLUDES = new Set([
  "node_modules",
  ".git",
  "graphify-out",
  "dist",
  ".output",
  ".tanstack",
  ".nitro",
  "benchmarks",
]);

const median = (arr) => {
  const s = [...arr].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};
const fmtMs = (ms) =>
  ms == null ? "n/a" : ms >= 60000 ? `${(ms / 60000).toFixed(2)}m` : `${(ms / 1000).toFixed(2)}s`;
const fmtN = (n) => (n == null ? "n/a" : n.toLocaleString("en-US", { maximumFractionDigits: 0 }));

async function prepareWorkCopy(dest) {
  await fsp.rm(dest, { recursive: true, force: true, maxRetries: 5 });
  await fsp.mkdir(dest, { recursive: true });
  await fsp.cp(ROOT, dest, {
    recursive: true,
    filter: (src) => !EXCLUDES.has(path.basename(src)),
  });
}

function runTimed(cmd, argsList, cwd, timeoutMs = 900000) {
  return new Promise((resolve) => {
    const t0 = performance.now();
    const child = spawn(cmd, argsList, {
      cwd,
      shell: false,
      env: { ...process.env, CI: "1" },
      stdio: ["ignore", "ignore", "pipe"],
    });
    let errTail = "";
    child.stderr.on("data", (d) => {
      errTail = (errTail + d).slice(-4000);
    });
    const timer = setTimeout(() => child.kill(), timeoutMs);
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ ms: performance.now() - t0, code, errTail });
    });
  });
}

async function killTree(pid) {
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(pid), "/T", "/F"], { shell: true });
  } else {
    try {
      process.kill(-pid, "SIGKILL");
    } catch {}
  }
}

async function waitFor(url, timeoutMs = 120000) {
  const t0 = performance.now();
  while (performance.now() - t0 < timeoutMs) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (res.ok) return performance.now() - t0;
    } catch {}
    await new Promise((r) => setTimeout(r, 50));
  }
  return null;
}

const existing = fs.existsSync(RESULTS_FILE)
  ? JSON.parse(fs.readFileSync(RESULTS_FILE, "utf8"))
  : {};
const results = {
  date: new Date().toISOString(),
  runs: RUNS,
  node: process.version,
  bun: spawnSync(BUN_EXE, ["--version"]).stdout.toString().trim(),
  install: existing.install || {},
  dev: existing.dev || {},
  hmr: existing.hmr || {},
  build: existing.build || {},
  runtime: existing.runtime || {},
};

async function phaseInstall() {
  for (const rt of ["node", "bun"]) {
    const dir = path.join(WORK, rt);
    await prepareWorkCopy(dir);
    const colds = [];
    const warms = [];
    for (let i = 0; i < RUNS; i++) {
      console.log(`[install:${rt}] run ${i + 1}/${RUNS}`);
      if (rt === "bun") {
        await fsp.rm(path.join(dir, "node_modules"), {
          recursive: true,
          force: true,
          maxRetries: 5,
        });
      }
      const [cmd, argsList] =
        rt === "node" ? npm(["install", "--no-audit", "--no-fund"]) : [BUN_EXE, ["install"]];
      const { ms, code, errTail } = await runTimed(cmd, argsList, dir);
      if (code !== 0) {
        console.error(`[install:${rt}] FAILED\n${errTail}`);
        break;
      }
      if (i === 0) colds.push(ms);
      else warms.push(ms);
    }
    results.install[rt] = { cold: colds[0] ?? null, warmMedian: median(warms) };
  }
  results.install.winner =
    (results.install.node?.warmMedian ?? Infinity) <= (results.install.bun?.warmMedian ?? Infinity)
      ? "node"
      : "bun";
}

async function startDevServer(rt, port) {
  const dir = path.join(WORK, rt);
  const viteBin = path.join(dir, "node_modules", "vite", "bin", "vite.js");
  const cmd = rt === "node" ? process.execPath : BUN_EXE;
  const url = `http://127.0.0.1:${port}/`;
  const child = spawn(cmd, [viteBin, "dev", "--port", String(port), "--strictPort"], {
    cwd: dir,
    shell: false,
    env: { ...process.env, CI: "1" },
    stdio: ["ignore", "ignore", "pipe"],
  });
  let errTail = "";
  child.stderr.on("data", (d) => {
    errTail = (errTail + d).slice(-3000);
  });
  const ms = await waitFor(url);
  if (ms == null) console.error(`[dev:${rt}] stderr tail:\n${errTail}`);
  return { child, ms, url };
}

async function waitPortFree(port, timeoutMs = 15000) {
  const t0 = performance.now();
  while (performance.now() - t0 < timeoutMs) {
    const free = await new Promise((resolve) => {
      const s = net.connect(port, "127.0.0.1");
      s.on("connect", () => {
        s.destroy();
        resolve(false);
      });
      s.on("error", () => resolve(true));
    });
    if (free) return;
    await new Promise((r) => setTimeout(r, 250));
  }
}

const HMR_TARGET = path.join("src", "lib", "format.ts");

async function phaseDev() {
  let port = 5199;
  for (const rt of ["node", "bun"]) {
    const starts = [];
    const hmrTimes = [];
    for (let i = 0; i < RUNS; i++) {
      console.log(`[dev:${rt}] run ${i + 1}/${RUNS}`);
      const { child, ms } = await startDevServer(rt, port);
      if (ms == null) {
        console.error(`[dev:${rt}] server did not become ready`);
        await killTree(child.pid);
        port++;
        continue;
      }
      starts.push(ms);
      const modUrl = `http://127.0.0.1:${port}/${HMR_TARGET.replaceAll("\\", "/")}`;
      const filePath = path.join(WORK, rt, HMR_TARGET);
      try {
        const baseline = await (await fetch(modUrl)).text();
        const original = await fsp.readFile(filePath, "utf8");
        const t0 = performance.now();
        await fsp.writeFile(filePath, original + "\nexport const __hmr_probe__ = 1;\n");
        const deadline = t0 + 30000;
        while (performance.now() < deadline) {
          const txt = await (await fetch(modUrl)).text();
          if (txt !== baseline) {
            hmrTimes.push(performance.now() - t0);
            break;
          }
          await new Promise((r) => setTimeout(r, 15));
        }
        await fsp.writeFile(filePath, original);
      } catch (e) {
        console.error(`[hmr:${rt}] error: ${e.message}`);
      }
      await killTree(child.pid);
      await waitPortFree(port);
      await new Promise((r) => setTimeout(r, 500));
    }
    results.dev[rt] = { coldStartMedian: median(starts) };
    results.hmr[rt] = { updateMedian: median(hmrTimes) };
    port++;
  }
}

async function phaseBuild() {
  for (const rt of ["node", "bun"]) {
    const times = [];
    for (let i = 0; i < RUNS; i++) {
      console.log(`[build:${rt}] run ${i + 1}/${RUNS}`);
      const viteBin = path.join(WORK, rt, "node_modules", "vite", "bin", "vite.js");
      const cmd = rt === "node" ? process.execPath : BUN_EXE;
      const { ms, code, errTail } = await runTimed(cmd, [viteBin, "build"], path.join(WORK, rt));
      if (code !== 0) {
        console.error(`[build:${rt}] FAILED\n${errTail}`);
        break;
      }
      times.push(ms);
    }
    results.build[rt] = { median: median(times) };
  }
}

const CPU_BENCH = `
const data = Array.from({ length: 5000 }, (_, i) => ({
  id: i, name: "item" + i, vals: [i * 1.5, i * 2.5, Math.sqrt(i)], meta: { ok: i % 2 === 0 },
}));
let sink = 0;
const ROUNDS = 200;
const t0 = performance.now();
for (let r = 0; r < ROUNDS; r++) {
  const s = JSON.stringify(data);
  const p = JSON.parse(s);
  sink += p.length + s.length;
  for (const o of p) sink += o.vals[0] + (o.meta.ok ? 1 : 0);
}
const ms = performance.now() - t0;
console.log("CPU_RESULT " + JSON.stringify({ ms, sink: sink > 0 }));
`;

const SERVER_BENCH = `
import http from "node:http";
const payload = Buffer.alloc(64 * 1024, 0x61);
const rssLog = [];
setInterval(() => { rssLog.push(process.memoryUsage().rss); }, 100).unref();
http
  .createServer((req, res) => {
    if (req.url === "/rss") {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ rss: Math.max(...rssLog, process.memoryUsage().rss) }));
      return;
    }
    res.writeHead(200, { "content-type": "application/octet-stream", "content-length": payload.length });
    res.end(payload);
  })
  .listen(__PORT__, "127.0.0.1", () => console.log("READY"));
`;

async function loadTest(port, total = 3000, concurrency = 25) {
  const latencies = new Float64Array(total);
  let next = 0;
  let done = 0;
  const worker = async () => {
    while (next < total) {
      const i = next++;
      const t0 = performance.now();
      try {
        const res = await fetch(`http://127.0.0.1:${port}/data`, {
          signal: AbortSignal.timeout(10000),
        });
        await res.arrayBuffer();
        latencies[i] = performance.now() - t0;
      } catch {
        latencies[i] = NaN;
      }
      done++;
    }
  };
  const t0 = performance.now();
  await Promise.all(Array.from({ length: concurrency }, worker));
  const wall = performance.now() - t0;
  const ok = [...latencies].filter((x) => !Number.isNaN(x)).sort((a, b) => a - b);
  const pct = (p) => ok[Math.min(ok.length - 1, Math.floor(ok.length * p))];
  return {
    rps: (ok.length / wall) * 1000,
    p50: pct(0.5),
    p95: pct(0.95),
    errors: total - ok.length,
  };
}

async function benchRuntime(rt, port, cpuFile, serverFile) {
  const cpuOut = await new Promise((resolve) => {
    const child = spawn(rt === "node" ? process.execPath : BUN_EXE, [cpuFile], {
      shell: false,
      stdio: ["ignore", "pipe", "ignore"],
    });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.on("close", () => {
      const line = out.split(/\r?\n/).find((l) => l.startsWith("CPU_RESULT"));
      resolve(line ? JSON.parse(line.slice("CPU_RESULT ".length)) : null);
    });
  });

  await fsp.writeFile(serverFile, SERVER_BENCH.replaceAll("__PORT__", JSON.stringify(port)));
  const child = spawn(rt === "node" ? process.execPath : BUN_EXE, [serverFile], {
    shell: false,
    stdio: ["ignore", "pipe", "ignore"],
  });
  let ready = false;
  child.stdout.on("data", (d) => {
    if (d.toString().includes("READY")) ready = true;
  });
  for (let i = 0; i < 100 && !ready; i++) await new Promise((r) => setTimeout(r, 100));
  if (!ready) {
    console.error(`[server:${rt}] did not start`);
    killTree(child.pid);
    return { cpuMs: cpuOut?.ms ?? null };
  }
  const load = await loadTest(port);
  let peakRss = null;
  try {
    const r = await fetch(`http://127.0.0.1:${port}/rss`);
    peakRss = (await r.json()).rss / 1048576;
  } catch {}
  killTree(child.pid);
  return { cpuMs: cpuOut?.ms ?? null, ...load, peakRssMb: peakRss };
}

async function phaseRuntime() {
  const cpuFile = path.join(WORK, "cpu.bench.js");
  const serverFile = path.join(WORK, "server.bench.js");
  await fsp.writeFile(cpuFile, CPU_BENCH);
  let port = 5299;
  for (const rt of ["node", "bun"]) {
    console.log(`[runtime:${rt}] running cpu + http load test`);
    results.runtime[rt] = await benchRuntime(rt, port++, cpuFile, serverFile);
  }
}

function printReport() {
  const s = (v) => (v == null || Number.isNaN(v) ? "n/a" : String(v));
  const winner = (a, b, lowerBetter = true) => {
    if (a == null || b == null) return "";
    return lowerBetter ? (a <= b ? "  <- node" : "  <- bun") : a >= b ? "  <- node" : "  <- bun";
  };
  console.log("\n================ BUN vs NODE — meroshare-next ================");
  console.log(`node ${results.node} | bun ${results.bun} | ${RUNS} runs (median)\n`);
  const nI = results.install.node ?? {};
  const bI = results.install.bun ?? {};
  console.log("INSTALL");
  console.log(
    `  ${"cold install".padEnd(26)} ${s(fmtMs(nI.cold)).padStart(14)} ${s(fmtMs(bI.cold)).padStart(14)}${winner(nI.cold, bI.cold)}`,
  );
  console.log(
    `  ${"warm install (median)".padEnd(26)} ${s(fmtMs(nI.warmMedian)).padStart(14)} ${s(fmtMs(bI.warmMedian)).padStart(14)}${winner(nI.warmMedian, bI.warmMedian)}`,
  );
  const nD = results.dev.node ?? {};
  const bD = results.dev.bun ?? {};
  console.log("\nDEV SERVER");
  console.log(
    `  ${"cold start -> 200 OK".padEnd(26)} ${s(fmtMs(nD.coldStartMedian)).padStart(14)} ${s(fmtMs(bD.coldStartMedian)).padStart(14)}${winner(nD.coldStartMedian, bD.coldStartMedian)}`,
  );
  console.log(
    `  ${"HMR update round-trip".padEnd(26)} ${s(results.hmr.node?.updateMedian?.toFixed(0) + "ms").padStart(14)} ${s(results.hmr.bun?.updateMedian?.toFixed(0) + "ms").padStart(14)}${winner(results.hmr.node?.updateMedian, results.hmr.bun?.updateMedian)}`,
  );
  console.log("\nBUILD");
  console.log(
    `  ${"vite build (median)".padEnd(26)} ${s(fmtMs(results.build.node?.median)).padStart(14)} ${s(fmtMs(results.build.bun?.median)).padStart(14)}${winner(results.build.node?.median, results.build.bun?.median)}`,
  );
  const nR = results.runtime.node ?? {};
  const bR = results.runtime.bun ?? {};
  console.log("\nRUNTIME (local serving micro-bench)");
  console.log(
    `  ${"CPU json+math (ms)".padEnd(26)} ${s(fmtN(nR.cpuMs)).padStart(14)} ${s(fmtN(bR.cpuMs)).padStart(14)}${winner(nR.cpuMs, bR.cpuMs)}`,
  );
  console.log(
    `  ${"HTTP req/sec".padEnd(26)} ${s(fmtN(nR.rps)).padStart(14)} ${s(fmtN(bR.rps)).padStart(14)}${winner(nR.rps, bR.rps, false)}`,
  );
  console.log(
    `  ${"HTTP p50 (ms)".padEnd(26)} ${s(nR.p50?.toFixed(1)).padStart(14)} ${s(bR.p50?.toFixed(1)).padStart(14)}${winner(nR.p50, bR.p50)}`,
  );
  console.log(
    `  ${"HTTP p95 (ms)".padEnd(26)} ${s(nR.p95?.toFixed(1)).padStart(14)} ${s(bR.p95?.toFixed(1)).padStart(14)}${winner(nR.p95, bR.p95)}`,
  );
  console.log(
    `  ${"peak RSS (MB)".padEnd(26)} ${s(nR.peakRssMb?.toFixed(0)).padStart(14)} ${s(bR.peakRssMb?.toFixed(0)).padStart(14)}`,
  );
  console.log("\nFull data: benchmarks/results.json");
}

(async () => {
  fs.mkdirSync(BENCH_DIR, { recursive: true });
  fs.mkdirSync(WORK, { recursive: true });
  console.log(`bun: ${BUN_EXE} | workdir: ${WORK}\n`);
  const phases = {
    install: phaseInstall,
    dev: phaseDev,
    build: phaseBuild,
    runtime: phaseRuntime,
  };
  const todo = PHASE === "all" ? Object.keys(phases) : PHASE.split(",");
  for (const p of todo) {
    if (!phases[p]) {
      console.error(`unknown phase: ${p}`);
      continue;
    }
    console.log(`\n### PHASE: ${p} ###`);
    await phases[p]();
  }
  printReport();
  await fsp.writeFile(RESULTS_FILE, JSON.stringify(results, null, 2));
})();
