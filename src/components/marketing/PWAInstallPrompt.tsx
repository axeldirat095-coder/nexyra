import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Download, X } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "nexyra-pwa-dismissed";

export function PWAInstallPrompt() {
  const [evt, setEvt] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (localStorage.getItem(DISMISS_KEY)) return;

    const handler = (e: Event) => {
      e.preventDefault();
      setEvt(e as BeforeInstallPromptEvent);
      setVisible(true);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const onInstall = async () => {
    if (!evt) return;
    await evt.prompt();
    const { outcome } = await evt.userChoice;
    if (outcome === "accepted") localStorage.setItem(DISMISS_KEY, "installed");
    setVisible(false);
  };

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setVisible(false);
  };

  return (
    <AnimatePresence>
      {visible ? (
        <motion.div
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          className="fixed bottom-4 left-1/2 z-[60] flex w-[min(420px,calc(100vw-2rem))] -translate-x-1/2 items-center gap-3 rounded-2xl border border-border/60 bg-card/90 p-3 pl-4 shadow-2xl backdrop-blur-xl"
          role="dialog"
          aria-label="Installer Nexyra"
        >
          <img src="/images/nexyra-logo-transparent.png" alt="" className="h-10 w-10" />
          <div className="flex-1 text-sm">
            <div className="font-semibold text-foreground">Installer Nexyra</div>
            <div className="text-xs text-muted-foreground">Accès rapide depuis ton bureau ou ton mobile.</div>
          </div>
          <button
            onClick={onInstall}
            className="btn-gradient inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold"
          >
            <Download className="h-3.5 w-3.5" /> Installer
          </button>
          <button
            onClick={dismiss}
            aria-label="Fermer"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary/50 hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
