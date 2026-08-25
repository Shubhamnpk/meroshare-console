export type InstallPromptOutcome = "accepted" | "dismissed" | "unavailable";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

declare global {
  interface Window {
    /** Parked by the inline head script; adopted during initInstallCapture. */
    __msInstallPrompt?: BeforeInstallPromptEvent;
  }
}

const DISMISS_KEY = "ms-install-banner-dismissed";

let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
let captured = false;

/** True when the app runs as an installed PWA (standalone display mode). */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function isIosDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const iPadOs =
    /Macintosh/.test(ua) && "ontouchend" in document && navigator.maxTouchPoints > 1;
  return /iPad|iPhone|iPod/.test(ua) || iPadOs;
}

/** Native install flow availability (Chromium browsers). */
export function hasNativeInstallPrompt(): boolean {
  return deferred !== null;
}

export function subscribeInstall(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Attach the global capture listeners once, early in app startup. */
export function initInstallCapture(): void {
  if (captured || typeof window === "undefined") return;
  captured = true;
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferred = event as BeforeInstallPromptEvent;
    listeners.forEach((fn) => fn());
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    listeners.forEach((fn) => fn());
  });
  // Adopt an event that fired before React hydrated.
  const parked = window.__msInstallPrompt;
  if (parked && !deferred) {
    deferred = parked;
    listeners.forEach((fn) => fn());
  }
}

export async function promptInstall(): Promise<InstallPromptOutcome> {
  if (!deferred) return "unavailable";
  await deferred.prompt();
  const choice = await deferred.userChoice.catch(() =>
    ({ outcome: "dismissed" }) as { outcome: "accepted" | "dismissed" },
  );
  if (choice.outcome === "accepted") deferred = null;
  listeners.forEach((fn) => fn());
  return choice.outcome;
}

/** Banner dismissal is permanent; Settings always offers install manually. */
export function dismissInstallBanner(): void {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch {
    // private mode; banner hides for this session only
  }
}

export function isInstallBannerDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) != null;
  } catch {
    return false;
  }
}
