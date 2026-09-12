// One-command local secret setup: `npm run setup:secrets`.
// Creates .env.local (gitignored) with random SESSION_SECRET + BROKER_VAULT_SECRET
// when missing. Never overwrites existing values — only fills gaps.
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = join(root, ".env.local");
const needed = ["SESSION_SECRET", "BROKER_VAULT_SECRET"];

const existing = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
const missing = needed.filter((k) => !new RegExp(`^${k}=.+`, "m").test(existing));

if (missing.length === 0) {
  console.log(".env.local already has all secrets — nothing to do.");
  process.exit(0);
}

const lines = missing.map((k) => `${k}=${randomBytes(48).toString("base64")}`);
const prefix = existing.length > 0 && !existing.endsWith("\n") ? "\n" : "";
if (!existsSync(envPath)) {
  writeFileSync(
    envPath,
    "# Local dev secrets (gitignored). Do not commit.\n" + lines.join("\n") + "\n",
  );
} else {
  appendFileSync(envPath, prefix + lines.join("\n") + "\n");
}
console.log(`Created in .env.local: ${missing.join(", ")}`);
console.log("Restart the dev server so it picks them up.");
