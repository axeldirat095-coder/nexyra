import { Sun, Moon } from "lucide-react";
import { useTheme } from "@/hooks/useTheme";

export function ThemeToggle({ className = "" }: { className?: string }) {
  const { theme, toggle } = useTheme();
  return (
    <button
      onClick={toggle}
      title={theme === "dark" ? "Mode clair" : "Mode sombre"}
      aria-label="Basculer le thème"
      className={`inline-flex h-8 w-8 items-center justify-center rounded-full border border-border/40 bg-card/40 text-muted-foreground transition-all hover:border-primary/50 hover:text-foreground ${className}`}
    >
      {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}
