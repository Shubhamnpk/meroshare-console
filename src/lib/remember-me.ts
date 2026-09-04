/**
 * "Remember me" stores ONLY the username (and DP choice) on this device so the
 * sign-in form can be prefilled. The password is never stored anywhere.
 */

export interface RememberedLogin {
  username: string;
  capitalId: number | null;
  updatedAt: number;
}

const STORAGE_KEY = "ms-remember-me.v1";

export function loadRemembered(): RememberedLogin | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<RememberedLogin>;
    if (typeof parsed.username !== "string" || !parsed.username.trim()) return null;
    return {
      username: parsed.username.trim(),
      capitalId: typeof parsed.capitalId === "number" ? parsed.capitalId : null,
      updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : Date.now(),
    };
  } catch {
    return null;
  }
}

export function saveRemembered(username: string, capitalId: number | null): void {
  try {
    const value: RememberedLogin = {
      username: username.trim(),
      capitalId,
      updatedAt: Date.now(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // storage unavailable — sign-in still works, just not remembered
  }
}

export function clearRemembered(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
