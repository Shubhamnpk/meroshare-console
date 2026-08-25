import { useEffect, useState } from "react";
import { Download, Share, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  dismissInstallBanner,
  hasNativeInstallPrompt,
  initInstallCapture,
  isInstallBannerDismissed,
  isIosDevice,
  isStandalone,
  promptInstall,
  subscribeInstall,
} from "@/lib/install";

/**
 * Top install banner. Shows on any device while the app is not installed
 * (standalone display mode). Dismissing hides it permanently; Settings keeps a
 * manual install option either way.
 */
export function InstallBanner() {
  const [visible, setVisible] = useState(false);
  const [promptReady, setPromptReady] = useState(false);

  useEffect(() => {
    initInstallCapture();
    const sync = () => {
      setVisible(!isStandalone() && !isInstallBannerDismissed());
      setPromptReady(hasNativeInstallPrompt());
    };
    sync();
    const unsubscribe = subscribeInstall(sync);
    return unsubscribe;
  }, []);

  if (!visible) return null;
  const ios = isIosDevice();
  // No native prompt: iOS Safari never supports it, and other non-Chromium
  // browsers may not either. Show the manual gesture instead of a dead button.
  const manual = ios
    ? "Tap Share, then Add to Home Screen."
    : !promptReady
      ? "Open your browser menu and choose Install app."
      : null;

  const dismiss = () => {
    dismissInstallBanner();
    setVisible(false);
  };

  const install = async () => {
    await promptInstall();
  };

  return (
    <div className="relative z-50 flex items-center gap-3 bg-gradient-to-r from-teal-600 to-blue-600 px-4 py-2.5 text-white">
      <img src="/logo-512.png" alt="" className="hidden size-9 rounded-lg sm:block" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">Get the MeroShare app</p>
        <p className="truncate text-xs text-white/80">
          {manual ?? "Full-screen experience, straight from your home screen."}
        </p>
      </div>
      {manual ? (
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-white/15 px-3 py-1.5 text-xs font-semibold">
          <Share className="size-3.5" /> {ios ? "Add to Home Screen" : "Install app"}
        </span>
      ) : (
        <Button
          size="sm"
          className="shrink-0 bg-white font-semibold text-blue-700 hover:bg-white/90"
          onClick={() => void install()}
        >
          <Download className="size-4" /> Install
        </Button>
      )}
      <button
        type="button"
        aria-label="Don't show the install banner again"
        onClick={dismiss}
        className="rounded-md p-1.5 text-white/80 transition-colors hover:bg-white/15 hover:text-white"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
