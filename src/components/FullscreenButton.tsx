import { useEffect, useState } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import { useRouterState } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

// Affiché sur toutes les pages applicatives (pas sur auth pour ne pas gêner le formulaire).
const DISABLED_ROUTES = ["/auth"];

export function FullscreenButton() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [isFs, setIsFs] = useState(false);

  useEffect(() => {
    const onChange = () => setIsFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const disabled = DISABLED_ROUTES.some((r) => pathname === r || pathname.startsWith(r + "/"));
  if (disabled) return null;

  const toggle = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen();
      }
    } catch {
      // ignore (browser may block in iframe)
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      title={isFs ? "Quitter le plein écran" : "Plein écran"}
      aria-label={isFs ? "Quitter le plein écran" : "Plein écran"}
      className={cn(
        "fixed z-[70] top-4 right-4 h-9 w-9 rounded-md",
        "bg-card/60 text-muted-foreground backdrop-blur-md border border-border/40",
        "shadow-md hover:border-primary/50 hover:text-foreground transition-all",
        "flex items-center justify-center",
      )}
    >
      {isFs ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
    </button>
  );
}
