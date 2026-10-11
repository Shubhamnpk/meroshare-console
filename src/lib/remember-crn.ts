/**
 * "Remember CRN" stores ONLY the CRN (and the auto-fill choice) on this
 * device so the IPO apply form can prefill it. The transaction PIN is never
 * stored anywhere.
 */

export interface RememberedCrn {
  crn: string;
  autoRemember: boolean;
  updatedAt: number;
}

const STORAGE_KEY = "ms-remember-crn.v1";

export function loadRememberedCrn(): RememberedCrn | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<RememberedCrn>;
    return {
      crn: typeof parsed.crn === "string" ? parsed.crn.trim() : "",
      autoRemember: parsed.autoRemember === true,
      updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : Date.now(),
    };
  } catch {
    return null;
  }
}

export function saveRememberedCrn(crn: string, autoRemember = true): void {
  try {
    const value: RememberedCrn = {
      crn: crn.trim(),
      autoRemember,
      updatedAt: Date.now(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // storage unavailable - apply form still works, just not remembered
  }
}

export function clearRememberedCrn(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
