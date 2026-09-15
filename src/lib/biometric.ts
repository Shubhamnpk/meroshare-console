/**
 * Device biometrics (fingerprint / face / PIN) via WebAuthn platform authenticator.
 *
 
 *
 * Uses userVerification: "preferred" so the platform authenticator can fall
 * back to PIN, pattern, or password when biometrics are unavailable (e.g.
 * Windows Hello PIN on a laptop without a fingerprint reader).
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

function randomId(): Uint8Array<ArrayBuffer> {
  return randomChallenge();
}

export function isWebAuthnSupported(): boolean {
  return typeof window !== "undefined" && !!window.PublicKeyCredential;
}

/** True when this device/browser can do fingerprint, face, or PIN unlock. */
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

function storeEnrollment(credential: PublicKeyCredential): BiometricEnrollment {
  const enrollment: BiometricEnrollment = {
    credentialId: base64urlEncode(credential.rawId),
    createdAt: Date.now(),
  };
  localStorage.setItem(ENROLL_KEY, JSON.stringify(enrollment));
  markUnlockedThisSession();
  return enrollment;
}

/** Register this device's biometrics. Throws with a friendly message. */
export async function enrollBiometric(username: string): Promise<BiometricEnrollment> {
  if (!isWebAuthnSupported()) throw new Error("This browser does not support biometrics.");
  const rpId = window.location.hostname;
  const existing = getEnrollment();
  try {
    const credential = (await navigator.credentials.create({
      publicKey: {
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
          userVerification: "preferred",
        },
        excludeCredentials: existing
          ? [{ id: base64urlDecode(existing.credentialId), type: "public-key" }]
          : [],
        timeout: 60_000,
        attestation: "none",
      },
    })) as PublicKeyCredential | null;
    if (!credential) throw new Error("No credential was created. Try again.");
    return storeEnrollment(credential);
  } catch (error) {
    if (error instanceof DOMException && error.name === "NotAllowedError") {
      throw new Error("Biometric setup was cancelled. Try again when ready.");
    }
    throw new Error("Could not set up biometrics on this device.");
  }
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
        userVerification: "preferred",
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
