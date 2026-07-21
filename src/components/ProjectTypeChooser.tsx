import { useState } from "react";
import { Copy, Globe, Layout, Smartphone, Sparkles } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";
import { Link } from "@tanstack/react-router";

type ProjectType = Database["public"]["Enums"]["project_type"];

type StarterId = "blank" | "nexyra_copy";

interface ProjectTypeChooserProps {
  open: boolean;
  onCreated: (projectId: string, type: ProjectType) => void;
  onClose?: () => void;
}

const TYPES: Array<{
  id: ProjectType;
  label: string;
  desc: string;
  icon: typeof Globe;
  accent: string;
  available: boolean;
}> = [
  { id: "website", label: "Site web", desc: "Vitrine, landing, blog, portfolio", icon: Globe, accent: "text-glow-blue", available: true },
  { id: "webapp", label: "Application web", desc: "SaaS, dashboard, outil interne", icon: Layout, accent: "text-glow-violet", available: true },
  { id: "mobile_app", label: "Application mobile", desc: "iOS / Android (React Native)", icon: Smartphone, accent: "text-glow-pink", available: true },
];

const STARTERS: Array<{
  id: StarterId;
  label: string;
  desc: string;
  icon: typeof Copy;
}> = [
  { id: "blank", label: "Projet vide", desc: "Elena part d'une base simple", icon: Sparkles },
];

export function ProjectTypeChooser({ open, onCreated, onClose }: ProjectTypeChooserProps) {
  const { user } = useAuth();
  const [selected, setSelected] = useState<ProjectType | null>(null);
  const [starter, setStarter] = useState<StarterId>("blank");
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    if (!user) {
      toast.error("Connecte-toi d'abord");
      return;
    }
    if (!selected || !name.trim()) return;
    setCreating(true);

    // Récupère l'organisation perso de l'utilisateur (créée auto à l'inscription)
    const { data: org, error: orgErr } = await supabase
      .from("organizations")
      .select("id")
      .eq("owner_id", user.id)
      .eq("is_personal", true)
      .maybeSingle();
    if (orgErr || !org) {
      setCreating(false);
      toast.error("Espace personnel introuvable");
      return;
    }

    const { data, error } = await supabase
      .from("projects")
      .insert({
        owner_id: user.id,
        org_id: org.id,
        name: name.trim(),
        type: selected,
        status: "active",
        metadata: starter === "nexyra_copy" ? { starter: "nexyra_copy" } : {},
      })
      .select()
      .single();
    setCreating(false);
    if (error || !data) {
      toast.error("Erreur de création");
      return;
    }
    toast.success(`Projet "${data.name}" créé`);
    onCreated(data.id, selected);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose?.()}>
      <DialogContent className="max-w-2xl border-border/40 bg-card/95 backdrop-blur-xl">
        <DialogHeader>
          <DialogTitle className="text-xl gradient-text">
            <Sparkles className="mr-2 inline h-5 w-5 text-glow-blue" />
            Nouveau projet avec Elena
          </DialogTitle>
          <DialogDescription>
            Choisis le type de projet — Elena adaptera son expertise et ses outils en conséquence.
          </DialogDescription>
        </DialogHeader>

        {!user && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-4 text-center">
            <p className="mb-2 text-sm">Tu dois être connecté pour créer un projet.</p>
            <Link
              to="/auth"
              search={{ redirect: undefined }}
              className="inline-block rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            >
              Se connecter
            </Link>
          </div>
        )}

        {user && (
          <>
            <div className="grid gap-3 md:grid-cols-3">
              {TYPES.map((t) => {
                const Icon = t.icon;
                const isSelected = selected === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => setSelected(t.id)}
                    disabled={!t.available}
                    className={`group relative flex flex-col items-center gap-3 rounded-xl border p-5 text-center transition-all ${
                      isSelected
                        ? "border-primary/60 bg-primary/10 shadow-[0_0_0_1px_hsl(var(--primary)/0.3)]"
                        : "border-border/40 bg-card/30 hover:border-border/70 hover:bg-card/50"
                    } ${!t.available ? "cursor-not-allowed opacity-50" : ""}`}
                  >
                    <span className={`flex h-12 w-12 items-center justify-center rounded-xl border border-border/30 bg-background/40 ${t.accent}`}>
                      <Icon className="h-6 w-6" />
                    </span>
                    <div>
                      <p className="text-sm font-semibold">{t.label}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{t.desc}</p>
                    </div>
                    {!t.available && (
                      <span className="absolute right-2 top-2 rounded-full bg-muted/40 px-2 py-0.5 text-[9px] uppercase text-muted-foreground">
                        Bientôt
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="space-y-2">
              <Label>Base de départ</Label>
              <div className="grid gap-3 md:grid-cols-2">
                {STARTERS.map((s) => {
                  const Icon = s.icon;
                  const isSelected = starter === s.id;
                  return (
                    <button
                      key={s.id}
                      onClick={() => {
                        setStarter(s.id);
                        if (s.id === "nexyra_copy") {
                          setSelected("webapp");
                          setName((current) => current || "Nexyra 3");
                        }
                      }}
                      className={`flex items-center gap-3 rounded-xl border p-4 text-left transition-all ${
                        isSelected
                          ? "border-primary/60 bg-primary/10"
                          : "border-border/40 bg-card/30 hover:border-border/70 hover:bg-card/50"
                      }`}
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border/30 bg-background/40 text-primary">
                        <Icon className="h-5 w-5" />
                      </span>
                      <span>
                        <span className="block text-sm font-semibold">{s.label}</span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">{s.desc}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {selected && (
              <div className="space-y-2">
                <Label htmlFor="project-name">Nom du projet</Label>
                <Input
                  id="project-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Mon super projet"
                  autoFocus
                  onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                />
              </div>
            )}

            <div className="flex justify-end gap-2">
              {onClose && (
                <Button variant="ghost" onClick={onClose}>
                  Annuler
                </Button>
              )}
              <Button onClick={handleCreate} disabled={!selected || !name.trim() || creating}>
                {creating ? "Création..." : "Créer le projet"}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
