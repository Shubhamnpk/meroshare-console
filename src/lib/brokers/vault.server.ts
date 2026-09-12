// Server-only encrypted vault for linked broker credentials.
// Two layers: (1) each password is AES-GCM encrypted with a dedicated
// BROKER_VAULT_SECRET key, (2) the whole vault lives inside TanStack Start's
// encrypted, httpOnly session cookie. Passwords never leave the server:
// clients only ever receive BrokerConnectionMeta (no secrets).
import { useSession } from "@tanstack/react-start/server";
import type { BrokerConnectionMeta, BrokerId } from "./types";

const VAULT_VERSION = "v1";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days: broker links outlive the 2h CDSC session

interface VaultEntry {
  username: string;
  /** "v1.<base64 iv>.<base64 ciphertext>" AES-GCM of JSON {username,password}. */
  blob: string;
  displayName: string | null;
  connectedAt: string;
  lastTestedAt: string;
}

interface VaultData {
  connections: Partial<Record<BrokerId, VaultEntry>>;
}

function vaultSecret(): string {
  const secret = process.env["BROKER_VAULT_SECRET"];
  if (!secret || secret.length < 32) {
    throw new Error(
      "BROKER_VAULT_SECRET is missing or too short (need ≥32 chars). " +
        "Broker linking is disabled until it is set. See .env.example.",
    );
  }
  return secret;
}

async function vaultKey(): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(vaultSecret()));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

function b64encode(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function b64decode(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** AES-GCM encrypt {username,password}. Returns opaque blob, never logged. */
export async function encryptCredentials(username: string, password: string): Promise<string> {
  const key = await vaultKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    new TextEncoder().encode(JSON.stringify({ username, password })),
  );
  return `${VAULT_VERSION}.${b64encode(iv)}.${b64encode(new Uint8Array(ct))}`;
}

async function decryptCredentials(blob: string): Promise<{ username: string; password: string }> {
  const [version, ivB64, ctB64] = blob.split(".");
  if (version !== VAULT_VERSION || !ivB64 || !ctB64) throw new Error("Unrecognised vault entry");
  const key = await vaultKey();
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: b64decode(ivB64) as BufferSource },
    key,
    b64decode(ctB64) as BufferSource,
  );
  const parsed = JSON.parse(new TextDecoder().decode(pt)) as {
    username?: unknown;
    password?: unknown;
  };
  if (typeof parsed.username !== "string" || typeof parsed.password !== "string") {
    throw new Error("Corrupt vault entry");
  }
  return { username: parsed.username, password: parsed.password };
}

function vaultConfig() {
  return {
    // The session cookie itself is encrypted; password is a second factor here,
    // so the vault key and cookie key never coincide.
    password: process.env["SESSION_SECRET"] ?? "",
    name: "broker_vault",
    maxAge: MAX_AGE,
    cookie: {
      httpOnly: true,
      sameSite: "lax" as const,
      secure: true,
      path: "/",
    },
  };
}

async function readVault(): Promise<VaultData> {
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const session = await useSession<VaultData>(vaultConfig());
  const data = (session.data ?? {}) as Partial<VaultData>;
  return { connections: data.connections ?? {} };
}

async function writeVault(data: VaultData): Promise<void> {
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const session = await useSession<VaultData>(vaultConfig());
  await session.update(data);
}

/** Metadata only — safe to send to the client. */
export async function listConnections(): Promise<BrokerConnectionMeta[]> {
  const vault = await readVault();
  return (Object.keys(vault.connections) as BrokerId[])
    .filter((id) => vault.connections[id])
    .map((brokerId) => {
      const e = vault.connections[brokerId]!;
      return {
        brokerId,
        username: e.username,
        displayName: e.displayName,
        connectedAt: e.connectedAt,
        lastTestedAt: e.lastTestedAt,
      };
    });
}

export async function saveConnection(
  brokerId: BrokerId,
  username: string,
  password: string,
  displayName: string | null,
): Promise<BrokerConnectionMeta> {
  vaultSecret(); // fail fast when the feature is not configured
  const now = new Date().toISOString();
  const vault = await readVault();
  const prev = vault.connections[brokerId];
  vault.connections[brokerId] = {
    username,
    blob: await encryptCredentials(username, password),
    displayName,
    connectedAt: prev?.connectedAt ?? now,
    lastTestedAt: now,
  };
  await writeVault(vault);
  return {
    brokerId,
    username,
    displayName,
    connectedAt: vault.connections[brokerId]!.connectedAt,
    lastTestedAt: now,
  };
}

export async function removeConnection(brokerId: BrokerId): Promise<void> {
  const vault = await readVault();
  delete vault.connections[brokerId];
  await writeVault(vault);
}

/** Decrypts for immediate server-side use only. Callers must never return
 * the result to the client or write it to logs. */
export async function loadCredentials(
  brokerId: BrokerId,
): Promise<{ username: string; password: string } | null> {
  const vault = await readVault();
  const entry = vault.connections[brokerId];
  if (!entry) return null;
  try {
    return await decryptCredentials(entry.blob);
  } catch {
    return null;
  }
}
