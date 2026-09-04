/**
 * Encrypted fingerprint sign-in vault.
 *
 * How it works: the WebAuthn PRF extension turns a biometric ceremony into a
 * deterministic 32-byte secret bound to the enrolled credential. That secret
 * (through SHA-256) becomes an AES-GCM key that encrypts { capitalId,
 * username, password } into localStorage. Nothing decryptable ever leaves the
 * device, and without the fingerprint the stored blob is useless.
 *
 * PRF support varies (best on Android/Chrome and recent iOS/macOS/Windows) so
 * every entry point fails with a friendly message instead of throwing raw
 * errors. The plain password flow always keeps working.
 */
import { getEnrollment, markUnlockedThisSession } from "./biometric";

export interface VaultCredentials {
  capitalId: number;
  username: string;
  password: string;
}

interface StoredVault {
  iv: string;
  data: string;
}

const VAULT_KEY = "ms-vault.v1";
const VAULT_USER_KEY = "ms-vault-user.v1";
const SALT_KEY = "ms-vault-salt.v1";

function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBuffer(value: string): ArrayBuffer {
  const binary = atob(value);
  const out = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out.buffer;
}

/** Per-device salt for the PRF evaluation (public, just domain separation). */
function getOrCreateSalt(): Uint8Array<ArrayBuffer> {
  try {
    const raw = localStorage.getItem(SALT_KEY);
    if (raw) {
      const bytes = Uint8Array.from(atob(raw), (ch) => ch.charCodeAt(0));
      if (bytes.length === 32) {
        const out = new Uint8Array(new ArrayBuffer(32));
        out.set(bytes);
        return out;
      }
    }
  } catch {
    // fall through to generation
  }
  const buffer = new ArrayBuffer(32);
  crypto.getRandomValues(new Uint8Array(buffer));
  try {
    localStorage.setItem(SALT_KEY, bufferToBase64(buffer));
  } catch {
    // storage unavailable — encryption still works for this session
  }
  return new Uint8Array(buffer);
}

function prfOutput(credential: PublicKeyCredential): ArrayBuffer {
  const results = credential.getClientExtensionResults()?.prf?.results?.first;
  if (!results) {
    throw new Error(
      "This device doesn't support encrypted fingerprint sign-in. Sign in with your password instead.",
    );
  }
  const bytes = ArrayBuffer.isView(results)
    ? new Uint8Array(results.buffer, results.byteOffset, results.byteLength)
    : new Uint8Array(results);
  const out = new Uint8Array(new ArrayBuffer(bytes.byteLength));
  out.set(bytes);
  return out.buffer;
}

async function vaultKey(prfSecret: ArrayBuffer, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const combined = new Uint8Array(new ArrayBuffer(prfSecret.byteLength + salt.byteLength));
  combined.set(new Uint8Array(prfSecret), 0);
  combined.set(salt, prfSecret.byteLength);
  const hashed = await crypto.subtle.digest("SHA-256", combined);
  return crypto.subtle.importKey("raw", hashed, "AES-GCM", false, ["encrypt", "decrypt"]);
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
  } catch {
    // ignore
  }
}

/** Username the vault was saved for (plaintext — same as Remember Me). */
export function getVaultOwner(): string | null {
  try {
    return localStorage.getItem(VAULT_USER_KEY);
  } catch {
    return null;
  }
}

async function prfCeremony(): Promise<{ credential: PublicKeyCredential; secret: ArrayBuffer }> {
  const enrollment = getEnrollment();
  if (!enrollment) throw new Error("Biometrics are not set up on this device.");
  const salt = getOrCreateSalt();
  let credential: PublicKeyCredential;
  try {
    const result = await navigator.credentials.get({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(new ArrayBuffer(32))),
        allowCredentials: [{ id: base64ToBuffer(enrollment.credentialId), type: "public-key" }],
        userVerification: "required",
        timeout: 60_000,
        extensions: { prf: { eval: { first: salt } } },
      },
    });
    if (!result) throw new Error("Biometric check did not complete. Try again.");
    credential = result as PublicKeyCredential;
  } catch (error) {
    if (error instanceof DOMException && error.name === "NotAllowedError") {
      throw new Error("Fingerprint check was cancelled. Try again.");
    }
    if (error instanceof Error && /support encrypted fingerprint/i.test(error.message)) {
      throw error;
    }
    throw new Error("Biometric check failed. Try again or use your password.");
  }
  return { credential, secret: prfOutput(credential) };
}

/** Run a biometric ceremony and encrypt the credentials into the vault. */
export async function writeVault(creds: VaultCredentials): Promise<void> {
  const valid = validateCredentials(creds);
  const salt = getOrCreateSalt();
  const { secret } = await prfCeremony();
  const key = await vaultKey(secret, salt);
  const iv = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(12)));
  const plaintext = new TextEncoder().encode(JSON.stringify(valid));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);
  const stored: StoredVault = {
    iv: bufferToBase64(iv.buffer),
    data: bufferToBase64(ciphertext),
  };
  localStorage.setItem(VAULT_KEY, JSON.stringify(stored));
  try {
    localStorage.setItem(VAULT_USER_KEY, valid.username);
  } catch {
    // non-fatal
  }
  // A passed ceremony counts as this session's unlock — no second prompt.
  markUnlockedThisSession();
}

/** Run a biometric ceremony and decrypt the stored credentials. */
export async function readVault(): Promise<VaultCredentials> {
  let stored: StoredVault;
  try {
    const raw = localStorage.getItem(VAULT_KEY);
    if (!raw) throw new Error("No saved sign-in on this device.");
    stored = JSON.parse(raw) as StoredVault;
    if (typeof stored.iv !== "string" || typeof stored.data !== "string") {
      throw new Error("The saved sign-in is invalid. Sign in with your password.");
    }
  } catch (error) {
    if (error instanceof Error && /saved sign-in|No saved sign-in/i.test(error.message)) {
      throw error;
    }
    throw new Error("The saved sign-in is invalid. Sign in with your password.");
  }
  const salt = getOrCreateSalt();
  const { secret } = await prfCeremony();
  const key = await vaultKey(secret, salt);
  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: base64ToBuffer(stored.iv) },
      key,
      base64ToBuffer(stored.data),
    );
    const creds = validateCredentials(JSON.parse(new TextDecoder().decode(plaintext)));
    // A passed ceremony counts as this session's unlock — no second prompt.
    markUnlockedThisSession();
    return creds;
  } catch {
    throw new Error(
      "Could not unlock the saved sign-in — it may belong to a different sign-in or device. Use your password.",
    );
  }
}
