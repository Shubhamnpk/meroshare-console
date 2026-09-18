import { useCallback, useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Eye, EyeOff, Plug, RefreshCw, WandSparkles } from "lucide-react";
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
import {
  getTmsCaptcha,
  saveTmsConnection,
  testTmsConnection,
  verifyTmsOtp,
} from "@/lib/brokers/brokers.functions";
import type { TmsCaptcha, TmsTestResult } from "@/lib/brokers/tms.server";
import { solveCaptcha } from "@/lib/captcha-solver";
import { errorMessage } from "@/lib/format";
import { cn } from "@/lib/utils";

const DEFAULT_HOST = "https://tms77.nepsetms.com.np";

/**
 * TMS connect flow: host → username/password → captcha → test →
 * (OTP?) → save. Nothing is stored until a live test proves it works;
 * saving consumes a server-side proof token, never a replayed login.
 */
export function TmsConnectDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [host, setHost] = useState(DEFAULT_HOST);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [captcha, setCaptcha] = useState<TmsCaptcha | null>(null);
  const [captchaText, setCaptchaText] = useState("");
  const [otp, setOtp] = useState("");
  const [result, setResult] = useState<TmsTestResult | null>(null);
  const [solving, setSolving] = useState(false);
  const [confidence, setConfidence] = useState<number | null>(null);

  const reset = () => {
    setCaptcha(null);
    setCaptchaText("");
    setOtp("");
    setResult(null);
    setSolving(false);
    setConfidence(null);
    captchaMut.reset();
    testMut.reset();
    otpMut.reset();
    saveMut.reset();
  };

  const autoSolve = useCallback(async (dataUrl: string) => {
    try {
      setSolving(true);
      setConfidence(null);
      const { text, confidence } = await solveCaptcha(dataUrl);
      if (text.length > 0) {
        setCaptchaText(text);
        setConfidence(Math.round(confidence));
      }
    } catch {
      // OCR failed: user types manually
    } finally {
      setSolving(false);
    }
  }, []);

  const captchaMut = useMutation({
    mutationFn: (h: string) => getTmsCaptcha({ data: { host: h } }),
    onSuccess: (c) => {
      setCaptcha(c);
      setCaptchaText("");
      setConfidence(null);
      autoSolve(c.imageDataUrl);
    },
    onError: (err) => toast.error(errorMessage(err, "Captcha failed to load.")),
  });

  const testMut = useMutation({
    mutationFn: () =>
      testTmsConnection({
        data: {
          host,
          username: username.trim(),
          password,
          captchaId: captcha?.captchaId ?? "",
          captchaText,
        },
      }),
    onSuccess: (r) => setResult(r),
    onError: (err) =>
      setResult({
        ok: false,
        brokerId: "tms",
        displayName: null,
        clientCodeHint: null,
        holdingSymbols: [],
        steps: [],
        error: errorMessage(err, "Test login failed."),
        needsOtp: false,
        pendingId: null,
        proofId: null,
      }),
  });

  const otpMut = useMutation({
    mutationFn: () => verifyTmsOtp({ data: { pendingId: result?.pendingId ?? "", otp } }),
    onSuccess: (r) => setResult(r),
    onError: (err) =>
      setResult({
        ok: false,
        brokerId: "tms",
        displayName: null,
        clientCodeHint: null,
        holdingSymbols: [],
        steps: [],
        error: errorMessage(err, "OTP verification failed."),
        needsOtp: false,
        pendingId: null,
        proofId: null,
      }),
  });

  const saveMut = useMutation({
    mutationFn: () => saveTmsConnection({ data: { proofId: result?.proofId ?? "" } }),
    onSuccess: () => {
      toast.success("TMS connected.");
      void queryClient.invalidateQueries({ queryKey: ["broker-connections"] });
      onOpenChange(false);
    },
    onError: (err) => toast.error(errorMessage(err, "Could not save the connection.")),
  });

  // Fresh captcha each time the dialog opens.
  useEffect(() => {
    if (open) {
      reset();
      captchaMut.mutate(host);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const canTest =
    username.trim().length > 0 &&
    password.length > 0 &&
    captchaText.trim().length > 0 &&
    !testMut.isPending;
  const showOtpStep = result?.needsOtp === true && result.pendingId;
  const showSave = result?.ok === true && result.proofId;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plug className="size-5 text-primary" /> Connect NEPSE TMS
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="tms-host">TMS host</Label>
            <div className="flex gap-2">
              <Input
                id="tms-host"
                inputMode="url"
                placeholder={DEFAULT_HOST}
                value={host}
                onChange={(e) => setHost(e.target.value)}
                maxLength={128}
                className="num flex-1"
              />
              <Button
                variant="outline"
                size="sm"
                disabled={captchaMut.isPending}
                onClick={() => captchaMut.mutate(host)}
                title="Reload captcha for this host"
              >
                <RefreshCw className={cn("size-3.5", captchaMut.isPending && "animate-spin")} />
              </Button>
            </div>
            <p className="text-[0.68rem] text-muted-foreground">
              Your broker&apos;s address, e.g. https://tmsNN.nepsetms.com.np
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="tms-username">TMS username</Label>
              <Input
                id="tms-username"
                autoComplete="username"
                placeholder="Client code"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                maxLength={128}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tms-password">Password</Label>
              <div className="relative">
                <Input
                  id="tms-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pr-10"
                  maxLength={128}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tms-captcha" className="flex items-center gap-1.5">
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
              {captcha ? (
                <img
                  src={captcha.imageDataUrl}
                  alt="TMS captcha: type the characters shown"
                  className="h-10 shrink-0 rounded-lg border border-border/60 bg-white"
                />
              ) : (
                <span className="flex h-10 w-32 shrink-0 items-center justify-center rounded-lg border border-border/60 text-[0.68rem] text-muted-foreground">
                  {captchaMut.isPending ? "Loading…" : "No image"}
                </span>
              )}
              <Input
                id="tms-captcha"
                autoComplete="off"
                placeholder="Characters above"
                value={captchaText}
                onChange={(e) => setCaptchaText(e.target.value)}
                maxLength={16}
                className="num flex-1"
              />
            </div>
          </div>

          {result && !showOtpStep && !showSave ? (
            <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs">
              <p className="font-semibold text-destructive">
                {result.error ?? "Test login failed."}
              </p>
              {result.hint ? <p className="mt-0.5 text-muted-foreground">{result.hint}</p> : null}
            </div>
          ) : null}

          {showOtpStep ? (
            <div className="space-y-2 rounded-xl border border-primary/25 bg-primary/5 p-3">
              <p className="text-xs font-semibold">TMS asked for a one-time code.</p>
              <div className="flex gap-2">
                <Input
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="OTP from SMS / email"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/[^0-9]/g, "").slice(0, 16))}
                  maxLength={16}
                  className="num flex-1"
                />
                <Button
                  size="sm"
                  disabled={!otp || otpMut.isPending}
                  onClick={() => otpMut.mutate()}
                >
                  {otpMut.isPending ? "Verifying…" : "Verify"}
                </Button>
              </div>
            </div>
          ) : null}

          {showSave ? (
            <div className="rounded-xl border border-gain/30 bg-gain/10 p-3 text-xs">
              <p className="font-semibold text-gain">
                Signed in{result.displayName ? ` as ${result.displayName}` : ""}. Safe to save.
              </p>
              {result.steps.length > 0 ? (
                <p className="num mt-0.5 text-muted-foreground">{result.steps.join(" · ")}</p>
              ) : null}
            </div>
          ) : null}
          {saveMut.isError ? (
            <p className="text-xs text-destructive">
              {errorMessage(saveMut.error, "Could not save the connection.")}
            </p>
          ) : null}

          <div className="flex gap-2">
            {!showSave ? (
              <Button
                size="sm"
                className="flex-1"
                disabled={!canTest}
                onClick={() => testMut.mutate()}
              >
                {testMut.isPending ? "Testing…" : "Test login"}
              </Button>
            ) : (
              <Button
                size="sm"
                className="flex-1"
                disabled={saveMut.isPending}
                onClick={() => saveMut.mutate()}
              >
                {saveMut.isPending ? "Saving…" : "Save connection"}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
