import { useCallback, useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { WandSparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { completeTmsReauth, startTmsReauth } from "@/lib/brokers/brokers.functions";
import { solveCaptcha } from "@/lib/captcha-solver";
import { errorMessage } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Lightweight re-auth modal. Appears when the TMS session expires.
 * Auto-solves the captcha in the background — user only sees it if OCR fails.
 */
export function TmsReauthModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [captchaId, setCaptchaId] = useState("");
  const [imageDataUrl, setImageDataUrl] = useState("");
  const [captchaText, setCaptchaText] = useState("");
  const [solving, setSolving] = useState(false);
  const [confidence, setConfidence] = useState<number | null>(null);

  const reset = () => {
    setCaptchaId("");
    setImageDataUrl("");
    setCaptchaText("");
    setSolving(false);
    setConfidence(null);
    startMut.reset();
    completeMut.reset();
  };

  const startMut = useMutation({
    mutationFn: () => startTmsReauth({ data: { brokerId: "tms" } }),
    onSuccess: async (c) => {
      setCaptchaId(c.captchaId);
      setImageDataUrl(c.imageDataUrl);
      setCaptchaText("");
      setConfidence(null);
      // Auto-solve immediately
      try {
        setSolving(true);
        const { text, confidence: conf } = await solveCaptcha(c.imageDataUrl);
        if (text.length > 0) {
          setCaptchaText(text);
          setConfidence(Math.round(conf));
          // Auto-submit if confidence is high
          if (conf >= 70) {
            completeMut.mutate({
              brokerId: "tms",
              captchaId: c.captchaId,
              captchaText: text,
            });
          }
        }
      } catch {
        // OCR failed — user types manually
      } finally {
        setSolving(false);
      }
    },
    onError: (err) => {
      toast.error(errorMessage(err, "Could not load captcha."));
      onOpenChange(false);
    },
  });

  const completeMut = useMutation({
    mutationFn: (input: { brokerId: "tms"; captchaId: string; captchaText: string }) =>
      completeTmsReauth({ data: input }),
    onSuccess: (r) => {
      if (r.ok) {
        toast.success("TMS reconnected.");
        void queryClient.invalidateQueries({ queryKey: ["broker-connections"] });
        void queryClient.invalidateQueries({ queryKey: ["broker-data"] });
        onOpenChange(false);
      } else {
        toast.error(r.error ?? "Re-auth failed. Try again.");
        // Refresh captcha for retry
        startMut.mutate();
      }
    },
    onError: (err) => {
      toast.error(errorMessage(err, "Re-auth failed."));
      startMut.mutate();
    },
  });

  // Kick off captcha fetch when modal opens
  useEffect(() => {
    if (open) {
      reset();
      startMut.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const canSubmit = captchaText.trim().length > 0 && !completeMut.isPending && !solving;

  const handleSubmit = useCallback(() => {
    if (!captchaText.trim() || !captchaId) return;
    completeMut.mutate({ brokerId: "tms", captchaId, captchaText: captchaText.trim() });
  }, [captchaText, captchaId, completeMut]);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-sm">TMS session expired</DialogTitle>
          <DialogDescription className="text-xs">
            Solving the captcha automatically. If it fails, type the characters shown.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="reauth-captcha" className="flex items-center gap-1.5">
              Captcha
              {solving ? (
                <span className="inline-flex items-center gap-1 text-[0.65rem] text-muted-foreground">
                  <WandSparkles className="size-3 animate-pulse" /> Solving…
                </span>
              ) : confidence !== null ? (
                <span
                  className={cn(
                    "text-[0.65rem]",
                    confidence >= 70
                      ? "text-gain"
                      : confidence >= 40
                        ? "text-muted-foreground"
                        : "text-destructive",
                  )}
                >
                  {confidence >= 70 ? "Auto-solved" : "Low confidence"} ({confidence}%)
                </span>
              ) : null}
            </Label>
            <div className="flex items-center gap-2">
              {imageDataUrl ? (
                <img
                  src={imageDataUrl}
                  alt="Captcha"
                  className="h-10 shrink-0 rounded-lg border border-border/60 bg-white"
                />
              ) : (
                <span className="flex h-10 w-28 shrink-0 items-center justify-center rounded-lg border border-border/60 text-[0.68rem] text-muted-foreground">
                  {startMut.isPending ? "Loading…" : "No image"}
                </span>
              )}
              <Input
                id="reauth-captcha"
                autoComplete="off"
                placeholder="Characters above"
                value={captchaText}
                onChange={(e) => setCaptchaText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSubmit();
                }}
                maxLength={16}
                className="num flex-1"
              />
            </div>
          </div>

          {completeMut.isError ? (
            <p className="text-xs text-destructive">
              {errorMessage(completeMut.error, "Re-auth failed. Try again.")}
            </p>
          ) : null}

          <div className="flex gap-2">
            <Button size="sm" className="flex-1" disabled={!canSubmit} onClick={handleSubmit}>
              {completeMut.isPending ? "Verifying…" : "Reconnect"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => startMut.mutate()}
              disabled={startMut.isPending || solving}
            >
              Retry
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
