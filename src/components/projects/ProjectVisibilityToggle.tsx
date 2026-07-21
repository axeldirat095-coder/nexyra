import { useState } from "react";
import { Lock, Globe, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Visibility = "private" | "public";

interface ProjectVisibilityToggleProps {
  projectId: string;
  initial: Visibility;
  onChange?: (next: Visibility) => void;
  size?: "sm" | "md";
}

/**
 * Toggle "outil perso" (private) vs "mode public" sur un projet.
 * Persisté dans `projects.visibility`.
 */
export function ProjectVisibilityToggle({
  projectId,
  initial,
  onChange,
  size = "sm",
}: ProjectVisibilityToggleProps) {
  const [value, setValue] = useState<Visibility>(initial);
  const [loading, setLoading] = useState(false);

  const set = async (next: Visibility) => {
    if (next === value || loading) return;
    setLoading(true);
    const { error } = await supabase
      .from("projects")
      .update({ visibility: next })
      .eq("id", projectId);
    setLoading(false);
    if (error) {
      toast.error("Impossible de changer la visibilité");
      return;
    }
    setValue(next);
    onChange?.(next);
    toast.success(next === "public" ? "Projet passé en public 🌐" : "Projet privé 🔒");
  };

  const cls =
    size === "sm"
      ? "h-7 gap-1 px-2 text-[11px]"
      : "h-9 gap-1.5 px-3 text-xs";

  return (
    <div
      className="inline-flex items-center rounded-full border border-border/60 bg-card/40 p-0.5 backdrop-blur-md"
      role="group"
      aria-label="Visibilité du projet"
    >
      <button
        type="button"
        onClick={() => set("private")}
        disabled={loading}
        aria-pressed={value === "private"}
        className={`inline-flex items-center rounded-full font-medium transition-all ${cls} ${
          value === "private"
            ? "bg-secondary/80 text-foreground shadow-inner"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        {loading && value !== "private" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Lock className="h-3 w-3" />}
        Outil perso
      </button>
      <button
        type="button"
        onClick={() => set("public")}
        disabled={loading}
        aria-pressed={value === "public"}
        className={`inline-flex items-center rounded-full font-medium transition-all ${cls} ${
          value === "public"
            ? "bg-gradient-to-r from-primary/80 to-violet-500/80 text-white shadow-[0_0_12px_oklch(0.6_0.22_270/35%)]"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        {loading && value !== "public" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Globe className="h-3 w-3" />}
        Public
      </button>
    </div>
  );
}
