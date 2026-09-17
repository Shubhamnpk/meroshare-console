import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { startTmsReauth, completeTmsReauth } from "@/lib/brokers/brokers.functions";
import { solveCaptcha } from "@/lib/captcha-solver";
import { errorMessage } from "@/lib/format";

/**
 * Detects TMS BrokerSessionError from query/mutation results and attempts
 * silent re-auth in the background. If auto-solve fails, the modal opens.
 *
 * Usage: wrap any TMS query's `onError` with `handleSessionError`, or call
 * `handleSessionError` from a global error boundary.
 *
 * Returns `reauthOpen` for the modal and `handleSessionError` to wire up.
 */
export function useTmsReauth() {
  const queryClient = useQueryClient();
  const [reauthOpen, setReauthOpen] = useState(false);
  const busyRef = useRef(false);

  const tryAutoReauth = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    try {
      // 1. Fetch fresh captcha
      const captcha = await startTmsReauth({ data: { brokerId: "tms" } });
      // 2. OCR the image
      const { text, confidence } = await solveCaptcha(captcha.imageDataUrl);
      if (text.length > 0 && confidence >= 70) {
        // 3. Auto-submit
        const result = await completeTmsReauth({
          data: { brokerId: "tms", captchaId: captcha.captchaId, captchaText: text },
        });
        if (result.ok) {
          // Silent success — invalidate all broker data
          void queryClient.invalidateQueries({ queryKey: ["broker-connections"] });
          void queryClient.invalidateQueries({ queryKey: ["broker-data"] });
          return;
        }
      }
      // Auto-solve failed — show modal
      setReauthOpen(true);
    } catch {
      // Any error — show modal for manual solve
      setReauthOpen(true);
    } finally {
      busyRef.current = false;
    }
  }, [queryClient]);

  /**
   * Pass this to `onError` of any TMS query/mutation. If the error is a
   * BrokerSessionError, triggers the reauth flow.
   */
  const handleSessionError = useCallback(
    (err: unknown) => {
      const msg = errorMessage(err, "");
      if (
        msg.includes("session expired") ||
        msg.includes("Reconnect") ||
        msg.includes("reconnect") ||
        msg.includes("401")
      ) {
        void tryAutoReauth();
      }
    },
    [tryAutoReauth],
  );

  return { reauthOpen, setReauthOpen, handleSessionError, tryAutoReauth };
}
