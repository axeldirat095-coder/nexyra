/**
 * Cerveau d'Elena — paramétrage du routage IA par tâche.
 *
 * Permet à l'utilisateur de choisir QUELLE IA Elena utilise pour CHAQUE type
 * de demande (chat, code, retouche, vision, image, scraping, raisonnement gros).
 *
 * Les valeurs sont persistées dans `elena_ai_routing` (1 ligne par user).
 * Si la ligne n'existe pas → on l'insère avec les préréglages recommandés.
 */
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Brain, MessageSquare, Code2, Pencil, Eye, Image as ImageIcon, Globe, Sparkles, Save, RotateCcw, Layers, Zap, Gauge, Rocket, Crown } from "lucide-react";
import { SectionShell } from "./SectionShell";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// =========================================================================
// Catalogue des options par tâche — modèles recommandés pour chaque besoin.
// Format : "provider:model_id" → libellé business.
// =========================================================================

type TaskKey =
  | "chat"
  | "code"
  | "trivial"
  | "vision"
  | "image"
  | "scrape"
  | "reasoning";

type ModelOption = { provider: string; model: string; label: string; hint?: string };

const OPTIONS: Record<TaskKey, ModelOption[]> = {
  chat: [
    { provider: "openrouter", model: "anthropic/claude-sonnet-4.5", label: "Claude Sonnet 4.5 (via OpenRouter)", hint: "Recommandé — meilleure compréhension" },
    { provider: "openrouter", model: "openai/gpt-5", label: "GPT-5 (via OpenRouter)" },
    { provider: "openai", model: "gpt-5-mini", label: "GPT-5 Mini (OpenAI direct)" },
    { provider: "deepseek", model: "deepseek-chat", label: "DeepSeek Chat (le moins cher)" },
  ],
  code: [
    { provider: "openrouter", model: "anthropic/claude-sonnet-4.5", label: "Claude Sonnet 4.5 (via OpenRouter)", hint: "Recommandé — roi du code" },
    { provider: "openrouter", model: "openai/gpt-5", label: "GPT-5 (via OpenRouter)" },
    { provider: "openai", model: "gpt-5", label: "GPT-5 (OpenAI direct)" },
  ],
  trivial: [
    { provider: "deepseek", model: "deepseek-chat", label: "DeepSeek Chat", hint: "Recommandé — 10× moins cher" },
    { provider: "openai", model: "gpt-5-nano", label: "GPT-5 Nano (OpenAI)" },
    { provider: "openrouter", model: "openai/gpt-5-nano", label: "GPT-5 Nano (via OpenRouter)" },
  ],
  vision: [
    { provider: "openrouter", model: "anthropic/claude-sonnet-4.5", label: "Claude Sonnet 4.5 (via OpenRouter)", hint: "Recommandé — voit mieux les designs" },
    { provider: "openrouter", model: "openai/gpt-5", label: "GPT-5 Vision (via OpenRouter)" },
    { provider: "openai", model: "gpt-5", label: "GPT-5 Vision (OpenAI direct)" },
  ],
  image: [
    { provider: "openai", model: "gpt-image-1", label: "OpenAI gpt-image-1", hint: "Recommandé — photos + texte lisible" },
    { provider: "fal", model: "recraft-v3", label: "Recraft v3 (via fal.ai)", hint: "Idéal pour logos/illustrations vectorielles" },
  ],
  scrape: [
    { provider: "firecrawl", model: "firecrawl-v1", label: "Firecrawl", hint: "Recommandé — outil dédié scraping" },
  ],
  reasoning: [
    { provider: "openrouter", model: "openai/gpt-5", label: "GPT-5 (via OpenRouter)", hint: "Recommandé — quand Claude bloque" },
    { provider: "openrouter", model: "anthropic/claude-sonnet-4.5", label: "Claude Sonnet 4.5 (via OpenRouter)" },
    { provider: "openai", model: "gpt-5", label: "GPT-5 (OpenAI direct)" },
  ],
};

const TASKS: Array<{
  key: TaskKey;
  title: string;
  description: string;
  icon: typeof MessageSquare;
}> = [
  { key: "chat", title: "💬 Discussion normale", description: "Quand tu lui parles ou poses une question", icon: MessageSquare },
  { key: "code", title: "🔨 Gros chantier code", description: "Créer une page, refactoriser, gros build", icon: Code2 },
  { key: "trivial", title: "✏️ Petite retouche", description: "Changer une couleur, un mot, un padding", icon: Pencil },
  { key: "vision", title: "👁️ Voir une image", description: "Analyser un screenshot, juger un design", icon: Eye },
  { key: "image", title: "🎨 Générer une image", description: "Créer une photo, une illustration, un logo", icon: ImageIcon },
  { key: "scrape", title: "🕷️ Scraper un site web", description: "Récupérer le contenu d'une page web", icon: Globe },
  { key: "reasoning", title: "🧠 Réfléchir en profondeur", description: "Planifier, raisonner sur un problème complexe", icon: Sparkles },
];

const PRESET_DEFAULTS = {
  chat_provider: "openrouter", chat_model: "anthropic/claude-sonnet-4.5",
  code_provider: "openrouter", code_model: "anthropic/claude-sonnet-4.5",
  trivial_provider: "deepseek", trivial_model: "deepseek-chat",
  vision_provider: "openrouter", vision_model: "anthropic/claude-sonnet-4.5",
  image_provider: "openai", image_model: "gpt-image-1",
  scrape_provider: "firecrawl", scrape_model: "firecrawl-v1",
  reasoning_provider: "openrouter", reasoning_model: "openai/gpt-5",
  fallback_provider: "openai", fallback_model: "gpt-5-mini",
};

type RoutingRow = typeof PRESET_DEFAULTS & { owner_id: string; updated_at: string };

const TASK_COLUMN_MAP: Record<TaskKey, { provider: keyof typeof PRESET_DEFAULTS; model: keyof typeof PRESET_DEFAULTS }> = {
  chat: { provider: "chat_provider", model: "chat_model" },
  code: { provider: "code_provider", model: "code_model" },
  trivial: { provider: "trivial_provider", model: "trivial_model" },
  vision: { provider: "vision_provider", model: "vision_model" },
  image: { provider: "image_provider", model: "image_model" },
  scrape: { provider: "scrape_provider", model: "scrape_model" },
  reasoning: { provider: "reasoning_provider", model: "reasoning_model" },
};

export function AiRoutingSection() {
  const { user } = useAuth();
  const [row, setRow] = useState<RoutingRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    (async () => {
      // Cast en `any` car la table est neuve et types.ts pas encore régénéré.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from("elena_ai_routing")
        .select("*")
        .eq("owner_id", user.id)
        .maybeSingle();
      if (data) {
        setRow(data as RoutingRow);
      } else {
        // Créer la ligne par défaut
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: created } = await (supabase as any)
          .from("elena_ai_routing")
          .insert({ owner_id: user.id, ...PRESET_DEFAULTS })
          .select()
          .single();
        if (created) setRow(created as RoutingRow);
      }
      setLoading(false);
    })();
  }, [user]);

  // -----------------------------------------------------------------------
  // Section Tiers d'intelligence — hooks DÉCLARÉS AVANT les early returns
  // (règle React : l'ordre des hooks doit être stable entre chaque render).
  // -----------------------------------------------------------------------
  const [tierAutoClassify, setTierAutoClassify] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem("elena.tier.autoClassify") !== "false";
  });
  const [tierForced, setTierForced] = useState<string>(() => {
    if (typeof window === "undefined") return "auto";
    return localStorage.getItem("elena.tier.forced") ?? "auto";
  });
  useEffect(() => {
    localStorage.setItem("elena.tier.autoClassify", String(tierAutoClassify));
  }, [tierAutoClassify]);
  useEffect(() => {
    localStorage.setItem("elena.tier.forced", tierForced);
  }, [tierForced]);

  if (!user) {
    return (
      <SectionShell title="Cerveau d'Elena" description="Choisis quelle IA fait quoi.">
        <Card className="border-dashed border-amber-500/40 bg-amber-500/5 p-6 text-center text-sm text-muted-foreground">
          Tu dois être connecté pour configurer le cerveau d'Elena.
        </Card>
      </SectionShell>
    );
  }

  if (loading || !row) {
    return <SectionShell title="Cerveau d'Elena" description="Chargement..."><div /></SectionShell>;
  }

  const getValue = (task: TaskKey) => {
    const cols = TASK_COLUMN_MAP[task];
    return `${row[cols.provider]}:${row[cols.model]}`;
  };

  const setValue = (task: TaskKey, combined: string) => {
    const [provider, ...rest] = combined.split(":");
    const model = rest.join(":");
    const cols = TASK_COLUMN_MAP[task];
    setRow({ ...row, [cols.provider]: provider, [cols.model]: model });
  };

  const save = async () => {
    setSaving(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("elena_ai_routing")
      .update({
        chat_provider: row.chat_provider, chat_model: row.chat_model,
        code_provider: row.code_provider, code_model: row.code_model,
        trivial_provider: row.trivial_provider, trivial_model: row.trivial_model,
        vision_provider: row.vision_provider, vision_model: row.vision_model,
        image_provider: row.image_provider, image_model: row.image_model,
        scrape_provider: row.scrape_provider, scrape_model: row.scrape_model,
        reasoning_provider: row.reasoning_provider, reasoning_model: row.reasoning_model,
        fallback_provider: row.fallback_provider, fallback_model: row.fallback_model,
      })
      .eq("owner_id", user.id);
    setSaving(false);
    if (error) toast.error(`Erreur : ${error.message}`);
    else toast.success("✅ Cerveau d'Elena mis à jour");
  };

  const resetToDefaults = () => {
    setRow({ ...row, ...PRESET_DEFAULTS });
    toast.info("Préréglages recommandés appliqués (n'oublie pas de sauvegarder)");
  };

  // -----------------------------------------------------------------------
  // Tiers d'intelligence — matrice par catégorie.
  // Chaque catégorie a son propre ladder XS→XL. Si le tier échoue (quota,
  // panne), Elena bascule automatiquement sur le tier supérieur de la MÊME
  // catégorie (auto-escalade silencieuse).
  // "—" = ce tier n'existe pas pour cette catégorie (le classifieur ne l'utilise pas).
  // -----------------------------------------------------------------------
  const TIER_META = [
    { key: "XS", icon: Zap, label: "Ultra rapide", cost: "1×" },
    { key: "S", icon: Gauge, label: "Rapide", cost: "1×" },
    { key: "M", icon: Brain, label: "Standard", cost: "~8×" },
    { key: "L", icon: Rocket, label: "Puissant", cost: "~30×" },
    { key: "XL", icon: Crown, label: "Maximum", cost: "~60×" },
  ] as const;

  type TierKey = "XS" | "S" | "M" | "L" | "XL";
  const CATEGORY_TIERS: Array<{
    key: string;
    title: string;
    icon: typeof MessageSquare;
    desc: string;
    tiers: Partial<Record<TierKey, string>>;
  }> = [
    {
      key: "chat", title: "Discussion", icon: MessageSquare,
      desc: "Répondre à une question, échanger, expliquer",
      tiers: {
        XS: "DeepSeek Chat",
        S: "DeepSeek Chat",
        M: "GPT-5 mini (OpenAI)",
        L: "Claude Sonnet 4.5 (OpenRouter)",
        XL: "Claude Sonnet 4.5 + Extended Thinking",
      },
    },
    {
      key: "code", title: "Code (gros chantier)", icon: Code2,
      desc: "Créer une page, refactoriser, gros build",
      tiers: {
        M: "GPT-5 mini (OpenAI)",
        L: "Claude Sonnet 4.5 (OpenRouter)",
        XL: "Claude Sonnet 4.5 + Extended Thinking",
      },
    },
    {
      key: "trivial", title: "Petite retouche", icon: Pencil,
      desc: "Changer un mot, une couleur, un padding",
      tiers: {
        XS: "DeepSeek Chat",
        S: "DeepSeek Chat",
        M: "GPT-5 mini (OpenAI)",
      },
    },
    {
      key: "vision", title: "Voir une image", icon: Eye,
      desc: "Analyser un screenshot, critiquer un design",
      tiers: {
        M: "GPT-5 mini vision (OpenAI)",
        L: "Claude Sonnet 4.5 vision (OpenRouter)",
        XL: "Claude Sonnet 4.5 + Extended Thinking",
      },
    },
    {
      key: "reasoning", title: "Raisonnement profond", icon: Sparkles,
      desc: "Planifier, architecturer, résoudre un problème complexe",
      tiers: {
        M: "GPT-5 mini (OpenAI)",
        L: "Claude Sonnet 4.5 (OpenRouter)",
        XL: "Claude Sonnet 4.5 + Extended Thinking",
      },
    },
    {
      key: "image", title: "Générer une image", icon: ImageIcon,
      desc: "OpenAI pour la qualité (texte, logos), Gemini pour les images simples & rapides",
      tiers: {
        XS: "Gemini 2.5 Flash Image (Nano Banana) — OpenRouter",
        S: "Gemini 3.1 Flash Image (Nano Banana 2) — OpenRouter",
        M: "OpenAI gpt-image-1-mini",
        L: "OpenAI gpt-image-1 (quality: low)",
        XL: "OpenAI gpt-image-1 (quality: high)",
      },
    },
    {
      key: "scrape", title: "Scraper un site web", icon: Globe,
      desc: "Outil dédié — hors système de tiers",
      tiers: { M: "Firecrawl" },
    },
  ];

  const CLASSIFIER_MODEL = "GPT-5 nano (OpenAI) — ~50 tokens par requête";

  return (
    <SectionShell
      title="🧠 Cerveau d'Elena"
      description="Elena classe chaque demande dans une catégorie (discussion, code, image…) puis choisit automatiquement le tier d'IA le moins cher qui fait le job."
    >
      <div className="space-y-4">
        {/* ============ Tiers d'intelligence — matrice par catégorie ============ */}
        <Card className="border-glow-violet/30 bg-glow-violet/5 p-5">
          <div className="mb-4 flex items-start gap-3">
            <Layers className="h-5 w-5 shrink-0 text-glow-violet" />
            <div className="flex-1">
              <Label className="text-sm font-semibold">Tiers d'intelligence par catégorie</Label>
              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                Pour chaque type de demande, voici l'IA utilisée à chaque niveau (XS = ultra-rapide/pas cher, XL = maximum).
                Si un modèle échoue (quota, panne), Elena bascule silencieusement sur le tier supérieur de la même catégorie.
              </p>
              <p className="mt-2 text-[11px] text-glow-blue">
                🎯 Classifieur : <span className="font-mono">{CLASSIFIER_MODEL}</span>
              </p>
            </div>
          </div>

          {/* Légende tiers */}
          <div className="mb-3 flex flex-wrap gap-2">
            {TIER_META.map((t) => {
              const Icon = t.icon;
              return (
                <div key={t.key} className="flex items-center gap-1.5 rounded-md border border-border/40 bg-background/40 px-2 py-1">
                  <Icon className="h-3 w-3 text-glow-violet" />
                  <span className="font-mono text-[10px] font-bold text-glow-violet">{t.key}</span>
                  <span className="text-[10px] text-muted-foreground">{t.label}</span>
                  <span className="font-mono text-[10px] text-muted-foreground">({t.cost})</span>
                </div>
              );
            })}
          </div>

          {/* Matrice catégorie × tier */}
          <div className="space-y-2">
            {CATEGORY_TIERS.map((cat) => {
              const CatIcon = cat.icon;
              return (
                <div key={cat.key} className="rounded-lg border border-border/40 bg-background/40 p-3">
                  <div className="mb-2 flex items-center gap-2">
                    <CatIcon className="h-4 w-4 text-glow-blue" />
                    <span className="text-sm font-medium">{cat.title}</span>
                    <span className="text-[11px] text-muted-foreground">— {cat.desc}</span>
                  </div>
                  <div className="grid grid-cols-1 gap-1.5 md:grid-cols-5">
                    {TIER_META.map((t) => {
                      const model = cat.tiers[t.key as TierKey];
                      return (
                        <div
                          key={t.key}
                          className={`rounded-md border px-2 py-1.5 ${
                            model
                              ? "border-glow-violet/30 bg-glow-violet/5"
                              : "border-border/20 bg-background/20 opacity-40"
                          }`}
                        >
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-[10px] font-bold text-glow-violet">{t.key}</span>
                            <span className="text-[10px] text-muted-foreground">{t.label}</span>
                          </div>
                          <p className="mt-0.5 text-[11px] leading-tight text-foreground">
                            {model ?? "—"}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-4 space-y-3 border-t border-border/40 pt-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex-1">
                <Label className="text-xs font-medium">Classification automatique</Label>
                <p className="text-[11px] text-muted-foreground">
                  Elena choisit le tier seule (recommandé). Sinon elle utilisera toujours le tier forcé ci-dessous.
                </p>
              </div>
              <Switch checked={tierAutoClassify} onCheckedChange={setTierAutoClassify} />
            </div>

            <div className={`flex items-center justify-between gap-4 ${tierAutoClassify ? "opacity-50" : ""}`}>
              <div className="flex-1">
                <Label className="text-xs font-medium">Tier forcé (debug)</Label>
                <p className="text-[11px] text-muted-foreground">
                  Utile pour tester un modèle précis. Désactive la classification auto pour l'appliquer.
                </p>
              </div>
              <Select value={tierForced} onValueChange={setTierForced} disabled={tierAutoClassify}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Auto (défaut)</SelectItem>
                  <SelectItem value="XS">XS — Ultra rapide</SelectItem>
                  <SelectItem value="S">S — Rapide</SelectItem>
                  <SelectItem value="M">M — Standard</SelectItem>
                  <SelectItem value="L">L — Puissant</SelectItem>
                  <SelectItem value="XL">XL — Maximum</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </Card>





        <Card className="border-glow-blue/30 bg-glow-blue/5 p-4">
          <div className="flex items-start gap-3">
            <Brain className="h-5 w-5 shrink-0 text-glow-blue" />
            <div className="text-xs text-muted-foreground leading-relaxed">
              <p className="mb-2 text-sm font-medium text-foreground">Comment ça marche ?</p>
              Pour chaque demande que tu fais à Elena, elle détecte le type de tâche et utilise l'IA que tu as choisie ici.
              Si l'IA principale tombe en panne, elle bascule automatiquement sur ton fallback.
              <br /><br />
              <strong className="text-foreground">Astuce :</strong> garde les recommandations par défaut si tu n'es pas sûr —
              elles sont optimisées pour ton budget (Claude via OpenRouter, DeepSeek pour les retouches, OpenAI pour les images).
            </div>
          </div>
        </Card>

        {TASKS.map((task) => {
          const Icon = task.icon;
          const options = OPTIONS[task.key];
          const currentValue = getValue(task.key);
          const isInOptions = options.some((o) => `${o.provider}:${o.model}` === currentValue);
          return (
            <Card key={task.key} className="border-border/40 bg-card/40 p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="mb-1 flex items-center gap-2">
                    <Icon className="h-4 w-4 text-glow-violet" />
                    <Label className="text-sm font-medium">{task.title}</Label>
                  </div>
                  <p className="text-xs text-muted-foreground">{task.description}</p>
                </div>
                <div className="w-72 shrink-0">
                  <Select
                    value={isInOptions ? currentValue : currentValue}
                    onValueChange={(v) => setValue(task.key, v)}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {options.map((o) => (
                        <SelectItem key={`${o.provider}:${o.model}`} value={`${o.provider}:${o.model}`}>
                          <div className="flex flex-col">
                            <span>{o.label}</span>
                            {o.hint && <span className="text-[10px] text-glow-blue">{o.hint}</span>}
                          </div>
                        </SelectItem>
                      ))}
                      {!isInOptions && (
                        <SelectItem value={currentValue}>
                          {currentValue} (personnalisé)
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </Card>
          );
        })}

        <Card className="border-amber-500/30 bg-amber-500/5 p-5">
          <div className="mb-3 flex items-center gap-2">
            <RotateCcw className="h-4 w-4 text-amber-500" />
            <Label className="text-sm font-medium">Plan B (fallback automatique)</Label>
          </div>
          <p className="mb-3 text-xs text-muted-foreground">
            Si l'IA principale tombe en panne, Elena bascule automatiquement ici. Recommandé : OpenAI direct
            (clé séparée d'OpenRouter, donc si OpenRouter saute, ça fonctionne quand même).
          </p>
          <Select
            value={`${row.fallback_provider}:${row.fallback_model}`}
            onValueChange={(v) => {
              const [provider, ...rest] = v.split(":");
              setRow({ ...row, fallback_provider: provider, fallback_model: rest.join(":") });
            }}
          >
            <SelectTrigger className="w-full md:w-96"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="openai:gpt-5-mini">GPT-5 Mini (OpenAI direct) — recommandé</SelectItem>
              <SelectItem value="openai:gpt-5-nano">GPT-5 Nano (OpenAI direct) — le moins cher</SelectItem>
              <SelectItem value="deepseek:deepseek-chat">DeepSeek Chat (le moins cher)</SelectItem>
              <SelectItem value="openrouter:openai/gpt-5-mini">GPT-5 Mini (via OpenRouter)</SelectItem>
            </SelectContent>
          </Select>
        </Card>

        <div className="flex flex-wrap gap-3 pt-2">
          <Button onClick={save} disabled={saving} className="gap-2">
            <Save className="h-4 w-4" />
            {saving ? "Sauvegarde..." : "Sauvegarder mes choix"}
          </Button>
          <Button variant="outline" onClick={resetToDefaults} className="gap-2">
            <RotateCcw className="h-4 w-4" />
            Revenir aux préréglages recommandés
          </Button>
        </div>
      </div>
    </SectionShell>
  );
}
