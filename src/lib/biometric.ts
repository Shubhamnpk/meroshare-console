/**
 * Device biometrics (fingerprint / face) via WebAuthn platform authenticator.
 *
 * This is a convenience app-lock for this device: after enrollment, opening the
 * app with a valid session asks for a biometric check before showing anything.
 * It does NOT replace the MeroShare password - the CDSC session still expires
 * normally and sign-in still needs the password. No biometric data ever leaves
 * the device; we only keep the credential id to challenge against.
 */

export interface BiometricEnrollment {
  credentialId: string;
  createdAt: number;
}

const ENROLL_KEY = "ms-biometric.v1";
const UNLOCK_KEY = "ms-biometric-unlocked";

function base64urlEncode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlDecode(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const out = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function randomChallenge(): Uint8Array<ArrayBuffer> {
  const buffer = new ArrayBuffer(32);
  crypto.getRandomValues(new Uint8Array(buffer));
  return new Uint8Array(buffer);
}

export function isWebAuthnSupported(): boolean {
  return typeof window !== "undefined" && !!window.PublicKeyCredential;
}

/** True when this device/browser can do fingerprint or face unlock. */
export async function isPlatformAuthenticatorAvailable(): Promise<boolean> {
  try {
    if (!isWebAuthnSupported()) return false;
    if (typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === "function") {
      return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    }
    return false;
  } catch {
    return false;
  }
}

export function getEnrollment(): BiometricEnrollment | null {
  try {
    const raw = localStorage.getItem(ENROLL_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<BiometricEnrollment>;
    if (typeof parsed.credentialId !== "string" || !parsed.credentialId) return null;
    return {
      credentialId: parsed.credentialId,
      createdAt: typeof parsed.createdAt === "number" ? parsed.createdAt : Date.now(),
    };
  } catch {
    return null;
  }
}

export function isBiometricEnrolled(): boolean {
  return getEnrollment() !== null;
}

export interface EnrollResult {
  enrollment: BiometricEnrollment;
  /**
   * Encrypted-storage (PRF) support learned during enrollment:
   * true = confirmed, false = confirmed NOT supported,
   * null = unknown (older client) - saving will be attempted anyway.
   */
  prfEnabled: boolean | null;
}

function randomId(): Uint8Array<ArrayBuffer> {
  const buffer = new ArrayBuffer(32);
  crypto.getRandomValues(new Uint8Array(buffer));
  return new Uint8Array(buffer);
}

function cancelledError(): Error {
  return new Error("Biometric setup was cancelled. Try again when ready.");
}

async function createCredential(username: string, probePrf: boolean): Promise<PublicKeyCredential> {
  const rpId = window.location.hostname;
  const existing = getEnrollment();
  const input: PublicKeyCredentialCreationOptions = {
    challenge: randomId(),
    rp: { name: "MeroShare Console", id: rpId },
    user: {
      id: randomId().slice(0, 16),
      name: username || "meroshare-user",
      displayName: username || "MeroShare user",
    },
    pubKeyCredParams: [
      { type: "public-key", alg: -7 },
      { type: "public-key", alg: -257 },
    ],
    authenticatorSelection: {
      authenticatorAttachment: "platform",
      userVerification: "required",
    },
    excludeCredentials: existing
      ? [{ id: base64urlDecode(existing.credentialId), type: "public-key" }]
      : [],
    timeout: 60_000,
    attestation: "none",
  };
  if (probePrf) input.extensions = { prf: { eval: { first: randomId() } } };
  const credential = (await navigator.credentials.create({
    publicKey: input,
  })) as PublicKeyCredential | null;
  if (!credential) throw new Error("No credential was created. Try again.");
  return credential;
}

function storeEnrollment(credential: PublicKeyCredential): BiometricEnrollment {
  const enrollment: BiometricEnrollment = {
    credentialId: base64urlEncode(credential.rawId),
    createdAt: Date.now(),
  };
  localStorage.setItem(ENROLL_KEY, JSON.stringify(enrollment));
  markUnlockedThisSession();
  return enrollment;
}

/**
 * Register this device's biometrics, probing encrypted-storage (PRF) support
 * for free via the enrollment ceremony. Throws with a friendly message.
 */
export async function enrollBiometricDetailed(username: string): Promise<EnrollResult> {
  if (!isWebAuthnSupported()) throw new Error("This browser does not support biometrics.");
  try {
    const credential = await createCredential(username, true);
    const enabled = credential.getClientExtensionResults()?.prf?.enabled;
    return { enrollment: storeEnrollment(credential), prfEnabled: enabled ?? null };
  } catch (error) {
    if (error instanceof DOMException && error.name === "NotAllowedError") {
      throw cancelledError();
    }
    const probeRejected =
      (error instanceof DOMException && error.name === "NotSupportedError") ||
      (error instanceof Error && /not supported/i.test(error.message));
    if (!probeRejected) {
      if (error instanceof Error && /not supported|not allowed/i.test(error.message)) throw error;
      throw new Error("Could not set up biometrics on this device.");
    }
    // Older client choked on the PRF probe - retry clean. Support stays
    // unknown and saving will be attempted at the next step.
    try {
      const credential = await createCredential(username, false);
      return { enrollment: storeEnrollment(credential), prfEnabled: null };
    } catch (retryError) {
      if (retryError instanceof DOMException && retryError.name === "NotAllowedError") {
        throw cancelledError();
      }
      throw new Error("Could not set up biometrics on this device.");
    }
  }
}

/** Register this device's biometrics. Throws with a friendly message on failure. */
export async function enrollBiometric(username: string): Promise<BiometricEnrollment> {
  return (await enrollBiometricDetailed(username)).enrollment;
}

/** Challenge the enrolled credential. Resolves on success, throws when it fails. */
export async function unlockWithBiometrics(): Promise<void> {
  const enrollment = getEnrollment();
  if (!enrollment) throw new Error("Biometrics are not set up on this device.");
  try {
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge: randomChallenge(),
        allowCredentials: [{ id: base64urlDecode(enrollment.credentialId), type: "public-key" }],
        userVerification: "required",
        timeout: 60_000,
      },
    });
    if (!assertion) throw new Error("Biometric check did not complete. Try again.");
    markUnlockedThisSession();
  } catch (error) {
    if (error instanceof DOMException && error.name === "NotAllowedError") {
      throw new Error("Unlock was cancelled. Try again.");
    }
    throw new Error("Biometric check failed. Try again or sign out.");
  }
}

export function disableBiometrics(): void {
  try {
    localStorage.removeItem(ENROLL_KEY);
    sessionStorage.removeItem(UNLOCK_KEY);
  } catch {
    // ignore
  }
}

export function isUnlockedThisSession(): boolean {
  try {
    return sessionStorage.getItem(UNLOCK_KEY) === "1";
  } catch {
    return false;
  }
}

export function markUnlockedThisSession(): void {
  try {
    sessionStorage.setItem(UNLOCK_KEY, "1");
  } catch {
    // ignore
  }
}

export function clearSessionUnlock(): void {
  try {
    sessionStorage.removeItem(UNLOCK_KEY);
  } catch {
    // ignore
  }
}
