/**
 * Profil utilisateur permanent — injecté dans CHAQUE message d'Elena.
 * Stocké dans elena_settings.preferences.user_profile (texte libre).
 */
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { UserCircle, Save, Sparkles } from "lucide-react";
import { SectionShell } from "./SectionShell";
import { useElenaSettings } from "@/hooks/useElenaSettings";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

const PLACEHOLDER = `Exemple :
- Entrepreneur autodidacte, aucune formation IA/technique
- Parle français simple, zéro jargon
- Préfère une recommandation claire plutôt que 3 options abstraites
- Pour chaque test : donner l'URL exacte et où cliquer
…`;

export function UserProfileSection() {
  const { user } = useAuth();
  const { settings, loading, update } = useElenaSettings();
  const [profile, setProfile] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (settings) {
      const prefs = (settings.preferences ?? {}) as Record<string, unknown>;
      setProfile(typeof prefs.user_profile === "string" ? prefs.user_profile : "");
    }
  }, [settings]);

  if (!user) {
    return (
      <SectionShell title="Profil utilisateur" description="Qui es-tu pour Elena.">
        <Card className="border-dashed border-amber-500/40 bg-amber-500/5 p-6 text-center text-sm text-muted-foreground">
          Connecte-toi pour remplir ton profil.
        </Card>
      </SectionShell>
    );
  }

  if (loading || !settings) {
    return (
      <SectionShell title="Profil utilisateur" description="Chargement...">
        <div />
      </SectionShell>
    );
  }

  const save = async () => {
    setSaving(true);
    const currentPrefs = (settings.preferences ?? {}) as Record<string, unknown>;
    const res = await update({
      preferences: { ...currentPrefs, user_profile: profile.trim() },
    });
    setSaving(false);
    if (res?.error) toast.error("Erreur : " + res.error.message);
    else toast.success("Profil enregistré — Elena s'en servira dès le prochain message.");
  };

  const charCount = profile.length;

  return (
    <SectionShell
      title="Profil utilisateur"
      description="Ce texte est injecté automatiquement dans CHAQUE message d'Elena, comme une mémoire permanente de qui tu es et de comment tu veux qu'elle te parle."
    >
      <div className="space-y-4">
        <Card className="border-primary/30 bg-primary/5 p-4">
          <div className="flex items-start gap-3">
            <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div className="text-sm">
              <p className="font-medium text-foreground">À quoi ça sert ?</p>
              <p className="mt-1 text-muted-foreground">
                Au lieu de répéter à Elena « parle-moi simplement » à chaque conversation, tu écris ton
                profil ici une bonne fois. Elle l'aura en tête à chaque message, sur tous tes projets.
              </p>
            </div>
          </div>
        </Card>

        <Card className="border-border/40 bg-card/40 p-5">
          <div className="mb-2 flex items-center gap-2">
            <UserCircle className="h-4 w-4 text-muted-foreground" />
            <Label htmlFor="user-profile" className="text-sm font-medium">
              Ton profil (texte libre)
            </Label>
          </div>
          <Textarea
            id="user-profile"
            value={profile}
            onChange={(e) => setProfile(e.target.value)}
            placeholder={PLACEHOLDER}
            className="min-h-[280px] resize-y font-mono text-sm"
            maxLength={4000}
          />
          <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
            <span>Vide = pas d'injection (zéro impact sur Elena).</span>
            <span>{charCount} / 4000</span>
          </div>
        </Card>

        <div className="flex gap-3">
          <Button onClick={save} disabled={saving} className="gap-2">
            <Save className="h-4 w-4" />
            {saving ? "Sauvegarde..." : "Enregistrer le profil"}
          </Button>
        </div>
      </div>
    </SectionShell>
  );
}
