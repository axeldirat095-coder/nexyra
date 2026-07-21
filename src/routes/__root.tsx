import { useEffect, useState } from "react";
import { Outlet, Link, createRootRoute, HeadContent, Scripts, useRouterState } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import appCss from "../styles.css?url";
import { installGlobalErrorCapture, captureError } from "@/lib/observability";
import { I18nProvider } from "@/i18n/i18n";
import { PWAInstallPrompt } from "@/components/marketing/PWAInstallPrompt";
import { FullscreenButton } from "@/components/FullscreenButton";
import { Toaster } from "@/components/ui/sonner";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
          <a
            href="/dev"
            className="inline-flex items-center justify-center rounded-md bg-gradient-to-r from-blue-500 to-violet-500 px-4 py-2 text-sm font-medium text-white shadow-lg transition-opacity hover:opacity-90"
          >
            🚀 Tester Elena V3
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: "Nexyra AI — Elena, ton agente IA" },
      { name: "description", content: "Plateforme IA pour entrepreneurs : Elena t'aide à construire sites, web apps et apps mobiles." },
      { name: "author", content: "Nexyra AI" },
      { name: "theme-color", content: "#0A0A0F" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "apple-mobile-web-app-title", content: "Nexyra" },
      { name: "mobile-web-app-capable", content: "yes" },
      { property: "og:title", content: "Nexyra AI — Elena, ton agente IA" },
      { property: "og:description", content: "Plateforme IA pour entrepreneurs : Elena t'aide à construire sites, web apps et apps mobiles." },
      { property: "og:type", content: "website" },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/fe3ac8dc-3965-43a1-b0ea-8d1cd1866437/id-preview-5da0d586--10d1006f-1911-4b3f-a6c4-29b743e7d25e.lovable.app-1778280447110.png" },
      { property: "og:image:width", content: "1216" },
      { property: "og:image:height", content: "640" },
      { property: "og:locale", content: "fr_FR" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:site", content: "@NexyraAI" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/fe3ac8dc-3965-43a1-b0ea-8d1cd1866437/id-preview-5da0d586--10d1006f-1911-4b3f-a6c4-29b743e7d25e.lovable.app-1778280447110.png" },
      { name: "robots", content: "index, follow" },
      {
        name: "application/ld+json",
        content: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          name: "Nexyra AI",
          applicationCategory: "DeveloperApplication",
          operatingSystem: "Web",
          description: "Plateforme IA avec Elena, agente qui construit sites, web apps et apps mobiles.",
          offers: { "@type": "Offer", price: "0", priceCurrency: "EUR" },
        }),
      },
      { name: "twitter:title", content: "Nexyra AI — Elena, ton agente IA" },
      { name: "twitter:description", content: "Plateforme IA pour entrepreneurs : Elena t'aide à construire sites, web apps et apps mobiles." },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "icon", type: "image/png", href: "/images/nexyra-logo-transparent.png" },
      { rel: "apple-touch-icon", href: "/images/nexyra-logo.png" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
  }));
  useEffect(() => {
    installGlobalErrorCapture();
    if (typeof window !== "undefined" && "serviceWorker" in navigator && import.meta.env.PROD) {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
  }, []);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <AnimatePresence mode="wait">
          <motion.div
            key={pathname}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          >
            <Outlet />
          </motion.div>
        </AnimatePresence>
        <PWAInstallPrompt />
        <FullscreenButton />
        <Toaster position="top-right" richColors closeButton />
      </I18nProvider>
    </QueryClientProvider>
  );
}

// Error boundary global → capture en base
export function ErrorBoundary({ error }: { error: Error }) {
  useEffect(() => {
    captureError(error, { level: "fatal", source: "client" });
  }, [error]);
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6 text-center">
      <div>
        <h1 className="text-2xl font-semibold text-destructive">Erreur inattendue</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
      </div>
    </div>
  );
}
