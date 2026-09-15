import http from "node:http";

const UPSTREAM = process.env["CDSC_UPSTREAM"] ?? "https://webbackend.cdsc.com.np";
const PORT = Number(process.env["PORT"] ?? 8080);

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const target = UPSTREAM + (req.url ?? "/");
    const headers = { ...req.headers };
    // Let fetch set these for the upstream leg.
    delete headers["host"];
    delete headers["connection"];
    delete headers["content-length"];
    // Forward real user IP for audit (WAF still sees Oracle IP, but CDSC can log per-user).
    const clientIp =
      (req.headers["x-forwarded-for"]?.toString().split(",")[0]?.trim() ??
        req.headers["x-real-ip"]?.toString().trim() ??
        req.socket.remoteAddress ??
        "") || "";
    if (clientIp) {
      const prev = headers["x-forwarded-for"]?.toString() ?? "";
      const parts = prev
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      // Don't append twice — dedupes "ip, ip" chains CDSC would otherwise store.
      if (!parts.includes(clientIp)) parts.push(clientIp);
      headers["x-forwarded-for"] = parts.join(", ");
      headers["x-real-ip"] = clientIp;
      // Cloudflare-style
      if (!headers["cf-connecting-ip"]) headers["cf-connecting-ip"] = clientIp;
    }

    const body = req.method === "GET" || req.method === "HEAD" ? undefined : await readBody(req);
    const upstream = await fetch(target, {
      method: req.method,
      headers,
      body,
    });

    const out = {};
    upstream.headers.forEach((value, key) => {
      const k = key.toLowerCase();
      // We buffer (and thereby decode) the body, so these must not pass through.
      if (k === "content-encoding" || k === "content-length" || k === "transfer-encoding") return;
      out[key] = value;
    });
    const buf = Buffer.from(await upstream.arrayBuffer());
    res.writeHead(upstream.status, out);
    res.end(buf);
  } catch (err) {
    console.error("[cdsc-proxy]", err instanceof Error ? err.message : err);
    res.writeHead(502, { "Content-Type": "text/plain" });
    res.end("proxy could not reach CDSC");
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[cdsc-proxy] listening on http://127.0.0.1:${PORT} -> ${UPSTREAM}`);
});
