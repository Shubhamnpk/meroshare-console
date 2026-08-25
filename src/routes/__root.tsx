import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, useRef, type ReactNode } from "react";
import { toast } from "sonner";

import appCss from "../styles.css?url";
import { Toaster } from "@/components/ui/sonner";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { logout } from "@/lib/meroshare/auth.functions";
import { isSessionError } from "@/lib/format";
import { SettingsProvider } from "@/lib/settings";
import { initInstallCapture } from "@/lib/install";
import { WatchlistProvider } from "@/lib/watchlist";

import { SecurityDialogs } from "@/components/security-dialog";
import { InstallBanner } from "@/components/install-banner";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "MeroShare Investor Console" },
      {
        name: "description",
        content:
          "A modern MeroShare client for Nepali investors: portfolio valuation, IPO applications, transactions and analytics.",
      },
      { property: "og:title", content: "MeroShare Investor Console" },
      {
        property: "og:description",
        content:
          "Portfolio valuation, IPO applications, transactions and analytics for your CDSC demat account.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:site", content: "@Lovable" },
      { name: "theme-color", content: "#2563eb" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "apple-mobile-web-app-title", content: "MeroShare" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
      { rel: "icon", href: "/favicon.ico", sizes: "any" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Sora:wght@500;600;700&family=Manrope:wght@400;500;600;700&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var s=JSON.parse(localStorage.getItem("ms-settings")||"{}");var t=s.theme||localStorage.getItem("ms-theme")||"system";var l=t==="light"||(t==="system"&&matchMedia("(prefers-color-scheme: light)").matches);document.documentElement.classList.toggle("light",l)}catch(e){}`,
          }}
        />
        <script
          dangerouslySetInnerHTML={{
            // The install prompt often fires before React mounts; park it on
            // window so lib/install.ts can adopt it during startup.
            __html: `window.__msInstallPrompt=null;window.addEventListener("beforeinstallprompt",function(e){e.preventDefault();window.__msInstallPrompt=e;});`,
          }}
        />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function SessionExpiryHandler() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const handling = useRef(false);

  useEffect(() => {
    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      if (event.type !== "updated") return;
      const error = event.query.state.error;
      if (!error || !isSessionError(error)) return;
      if (handling.current) return;
      handling.current = true;
      void (async () => {
        try {
          await logout();
        } catch {
          // local logout is best-effort; clearing the cache is what matters
        }
        queryClient.clear();
        toast("Session expired", {
          description: "Your MeroShare session has expired. Please log in again.",
        });
        await router.navigate({ to: "/" });
      })();
    });
    return unsubscribe;
  }, [queryClient, router]);

  return null;
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  useEffect(() => {
    // Register the installability service worker (network-only, no offline cache).
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // SW is optional; the app works fine without it.
      });
    }
    initInstallCapture();
  }, []);

  return (
    <>
      <InstallBanner />
      <SettingsProvider>
        <QueryClientProvider client={queryClient}>
          <WatchlistProvider>
            {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
            <Outlet />
            <SessionExpiryHandler />
            <SecurityDialogs />
            <Toaster position="top-center" richColors />
          </WatchlistProvider>
        </QueryClientProvider>
      </SettingsProvider>
    </>
  );
}
