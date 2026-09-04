import { useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Fingerprint, Loader2, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  clearSessionUnlock,
  isBiometricEnrolled,
  isUnlockedThisSession,
  unlockWithBiometrics,
} from "@/lib/biometric";
import { logout } from "@/lib/meroshare/auth.functions";

/**
 * App-lock gate: when biometrics are enrolled on this device, a signed-in
 * session stays hidden until the user passes a fingerprint/face check.
 * Unlock lasts for the browser tab session only.
 */
export function BiometricGate({ children }: { children: ReactNode }) {
  const [enrolled] = useState(() => isBiometricEnrolled());
  const [unlocked, setUnlocked] = useState(() => isUnlockedThisSession());
  const [busy, setBusy] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  if (!enrolled || unlocked) return <>{children}</>;

  const onUnlock = async () => {
    setBusy(true);
    setError(null);
    try {
      await unlockWithBiometrics();
      setUnlocked(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Biometric check failed. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const onSignOut = async () => {
    setSigningOut(true);
    try {
      await queryClient.cancelQueries();
      queryClient.clear();
      await logout();
      clearSessionUnlock();
    } finally {
      setSigningOut(false);
      navigate({ to: "/", replace: true });
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6 text-center">
        <div className="mx-auto flex size-16 items-center justify-center rounded-3xl border border-primary/20 bg-primary/10 text-primary">
          <Fingerprint className="size-8" />
        </div>
        <div>
          <h1 className="font-display text-2xl font-semibold">Unlock MeroShare Console</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Use your fingerprint or face to continue on this device.
          </p>
        </div>
        {error ? (
          <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <Button onClick={onUnlock} disabled={busy} className="h-11 w-full">
          {busy ? (
            <>
              <Loader2 className="size-4 animate-spin" /> Checking…
            </>
          ) : (
            <>
              <Fingerprint className="size-4" /> Unlock with biometrics
            </>
          )}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onSignOut}
          disabled={signingOut}
          className="gap-1.5 text-xs text-muted-foreground"
        >
          <LogOut className="size-3.5" />
          {signingOut ? "Signing out…" : "Sign out instead"}
        </Button>
      </div>
    </div>
  );
}
