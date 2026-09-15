/**
 * Encrypted credential storage for fingerprint sign-in.
 *
 * Stores { capitalId, username, password } in localStorage, encrypted with
 * AES-256-GCM. A random per-device key is generated on first use and stored
 * alongside the credential. Access is gated by a standard WebAuthn assertion
 * (fingerprint/face/PIN) — you must pass the biometric check before reading
 * the stored credentials.
 *
 * The encryption key lives in localStorage, so this is not unbreakable — but
 * it prevents the password from sitting as plain text and requires both the
 * key and biometric gate to access.
 */

export interface VaultCredentials {
  capitalId: number;
  username: string;
  password: string;
}

interface EncryptedVault {
  iv: string;
  data: string;
}

const VAULT_KEY = "ms-vault.v1";
const VAULT_USER_KEY = "ms-vault-user.v1";
const VAULT_ENC_KEY = "ms-vault-key.v1";

function bufToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBuf(value: string): ArrayBuffer {
  const binary = atob(value);
  const out = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out.buffer;
}

function randomBuf(len: number): Uint8Array<ArrayBuffer> {
  const buf = new ArrayBuffer(len);
  crypto.getRandomValues(new Uint8Array(buf));
  return new Uint8Array(buf);
}

async function getOrCreateKey(): Promise<CryptoKey> {
  try {
    const stored = localStorage.getItem(VAULT_ENC_KEY);
    if (stored) {
      const raw = base64ToBuf(stored);
      return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
    }
  } catch {
    // fall through to generation
  }
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
    "encrypt",
    "decrypt",
  ]);
  const raw = await crypto.subtle.exportKey("raw", key);
  try {
    localStorage.setItem(VAULT_ENC_KEY, bufToBase64(raw));
  } catch {
    // non-fatal — key still works for this session
  }
  return key;
}

async function encrypt(plaintext: string): Promise<EncryptedVault> {
  const key = await getOrCreateKey();
  const iv = randomBuf(12);
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
  return { iv: bufToBase64(iv.buffer), data: bufToBase64(ciphertext) };
}

async function decrypt(vault: EncryptedVault): Promise<string> {
  const key = await getOrCreateKey();
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBuf(vault.iv) },
    key,
    base64ToBuf(vault.data),
  );
  return new TextDecoder().decode(plaintext);
}

function validateCredentials(value: unknown): VaultCredentials {
  const v = value as Partial<VaultCredentials>;
  if (
    typeof v.capitalId !== "number" ||
    !Number.isInteger(v.capitalId) ||
    v.capitalId <= 0 ||
    typeof v.username !== "string" ||
    !v.username.trim() ||
    v.username.length > 64 ||
    typeof v.password !== "string" ||
    !v.password ||
    v.password.length > 128
  ) {
    throw new Error("The saved sign-in is invalid. Sign in with your password.");
  }
  return { capitalId: v.capitalId, username: v.username, password: v.password };
}

export function hasVault(): boolean {
  try {
    return localStorage.getItem(VAULT_KEY) !== null;
  } catch {
    return false;
  }
}

export function clearVault(): void {
  try {
    localStorage.removeItem(VAULT_KEY);
    localStorage.removeItem(VAULT_USER_KEY);
    localStorage.removeItem(VAULT_ENC_KEY);
  } catch {
    // ignore
  }
}

/** Username the vault was saved for. */
export function getVaultOwner(): string | null {
  try {
    return localStorage.getItem(VAULT_USER_KEY);
  } catch {
    return null;
  }
}

/** Store credentials in the vault, encrypted with AES-256-GCM. */
export async function writeVault(creds: VaultCredentials): Promise<void> {
  const valid = validateCredentials(creds);
  const encrypted = await encrypt(JSON.stringify(valid));
  try {
    localStorage.setItem(VAULT_KEY, JSON.stringify(encrypted));
    localStorage.setItem(VAULT_USER_KEY, valid.username);
  } catch {
    throw new Error("Could not save sign-in. Storage may be full.");
  }
}

/** Read and decrypt stored credentials. Caller must gate with a biometric check first. */
export async function readVault(): Promise<VaultCredentials> {
  try {
    const raw = localStorage.getItem(VAULT_KEY);
    if (!raw) throw new Error("No saved sign-in on this device.");
    const vault = JSON.parse(raw) as EncryptedVault;
    if (typeof vault.iv !== "string" || typeof vault.data !== "string") {
      throw new Error("Corrupted vault data.");
    }
    const json = await decrypt(vault);
    return validateCredentials(JSON.parse(json));
  } catch (error) {
    if (error instanceof Error && /saved sign-in|No saved sign-in|Corrupted/i.test(error.message)) {
      throw error;
    }
    throw new Error("Could not unlock saved sign-in. Sign in with your password.");
  }
}
