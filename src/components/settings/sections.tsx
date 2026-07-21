import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plug,
  KeyRound,
  Cpu,
  Bot,
  Wrench,
  Database,
  Palette,
  Save,
  Check,
  X,
  Globe,
  Layout,
  Smartphone,
  LoaderCircle,
} from "lucide-react";
import { SectionShell } from "./SectionShell";
import { useElenaSettings, type ElenaMode } from "@/hooks/useElenaSettings";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import type { Database as DBTypes } from "@/integrations/supabase/types";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";

const AVAILABLE_MODELS = [
  { value: "google/gemini-3-flash-preview", label: "Gemini 3 Flash (rapide, défaut)" },
  { value: "google/gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite (le moins cher)" },
  { value: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash (équilibré)" },
  { value: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro (puissant)" },
  { value: "google/gemini-3.1-pro-preview", label: "Gemini 3.1 Pro Preview" },
  { value: "openai/gpt-5-nano", label: "GPT-5 Nano (économique)" },
  { value: "openai/gpt-5-mini", label: "GPT-5 Mini (équilibré)" },
  { value: "openai/gpt-5", label: "GPT-5 (puissant)" },
  { value: "openai/gpt-5.2", label: "GPT-5.2 (raisonnement avancé)" },
];

function NotConnected() {
  return (
    <Card className="border-dashed border-amber-500/40 bg-amber-500/5 p-6 text-center">
      <p className="text-sm text-muted-foreground">
        Tu dois être connecté pour configurer Elena.
      </p>
      <Link
        to="/auth"
        search={{ redirect: undefined }}
        className="mt-3 inline-block rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
      >
        Se connecter
      </Link>
    </Card>
  );
}

// =================== AGENT (prompts système) ===================
export function AgentSection() {
  const { user } = useAuth();
  const { settings, loading, update } = useElenaSettings();
  const [website, setWebsite] = useState("");
  const [webapp, setWebapp] = useState("");
  const [mobile, setMobile] = useState("");
  const [explanationMode, setExplanationMode] = useState(false);
  const [autoQa, setAutoQa] = useState(false);
  const [loopEngine, setLoopEngine] = useState<"legacy" | "ai_sdk_v5">("legacy");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (settings) {
      setWebsite(settings.system_prompt_website);
      setWebapp(settings.system_prompt_webapp);
      setMobile(settings.system_prompt_mobile);
      const prefs = (settings.preferences ?? {}) as Record<string, unknown>;
      setExplanationMode(prefs.explanation_mode === true);
      setAutoQa(prefs.auto_qa !== false); // default ON
      setLoopEngine(prefs.loop_engine === "ai_sdk_v5" ? "ai_sdk_v5" : "legacy");
    }
  }, [settings]);

  if (!user) return <SectionShell title="Agent Elena" description="Personnalité d'Elena par type de projet."><NotConnected /></SectionShell>;
  if (loading || !settings) return <SectionShell title="Agent Elena" description="Chargement..."><div /></SectionShell>;

  const save = async () => {
    setSaving(true);
    const currentPrefs = (settings.preferences ?? {}) as Record<string, unknown>;
    const res = await update({
      system_prompt_website: website,
      system_prompt_webapp: webapp,
      system_prompt_mobile: mobile,
      preferences: {
        ...currentPrefs,
        explanation_mode: explanationMode,
        auto_qa: autoQa,
        loop_engine: loopEngine,
      },
    });
    setSaving(false);
    if (res?.error) toast.error("Erreur de sauvegarde");
    else toast.success("Préférences Elena sauvegardées");
  };

  return (
    <SectionShell
      title="Agent Elena"
      description="Définis le prompt système d'Elena et ses préférences de comportement."
    >
      <div className="space-y-5">
        <Card className="border-border/40 bg-card/40 p-5 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <Label className="text-sm font-medium">Mode explication</Label>
              <p className="mt-1 text-xs text-muted-foreground">
                Elena décrit ce qu'elle va faire AVANT de coder. Idéal pour comprendre / valider le plan.
              </p>
            </div>
            <Switch checked={explanationMode} onCheckedChange={setExplanationMode} />
          </div>
          <div className="flex items-start justify-between gap-4 border-t border-border/40 pt-4">
            <div className="flex-1 min-w-0">
              <Label className="text-sm font-medium">Auto-QA visuelle</Label>
              <p className="mt-1 text-xs text-muted-foreground">
                Elena prend un screenshot et vérifie le rendu en fin de génération.
              </p>
            </div>
            <Switch checked={autoQa} onCheckedChange={setAutoQa} />
          </div>
          <div className="border-t border-border/40 pt-4">
            <Label className="text-sm font-medium">Moteur du loop agent</Label>
            <p className="mt-1 mb-3 text-xs text-muted-foreground">
              <strong className="text-foreground">Legacy</strong> = loop maison (toutes capacités, 14 outils).{" "}
              <strong className="text-foreground">AI SDK v5</strong> = nouveau loop Vercel AI SDK (preview, outils
              limités : read/write/list_files). Bascule pour tester le futur moteur.
            </p>
            <div className="inline-flex overflow-hidden rounded-md border border-border/40">
              {(["legacy", "ai_sdk_v5"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setLoopEngine(m)}
                  className={`px-3 py-1.5 text-xs font-medium transition ${
                    loopEngine === m
                      ? "bg-glow-blue/20 text-glow-blue"
                      : "text-muted-foreground hover:bg-secondary/40"
                  }`}
                >
                  {m === "legacy" ? "Legacy (stable)" : "AI SDK v5 (preview)"}
                </button>
              ))}
            </div>
          </div>
        </Card>
        <Card className="border-border/40 bg-card/40 p-5">
          <div className="mb-3 flex items-center gap-2">
            <Globe className="h-4 w-4 text-glow-blue" />
            <Label className="text-sm font-medium">Sites web</Label>
          </div>
          <Textarea rows={3} value={website} onChange={(e) => setWebsite(e.target.value)} />
        </Card>
        <Card className="border-border/40 bg-card/40 p-5">
          <div className="mb-3 flex items-center gap-2">
            <Layout className="h-4 w-4 text-glow-violet" />
            <Label className="text-sm font-medium">Applications web</Label>
          </div>
          <Textarea rows={3} value={webapp} onChange={(e) => setWebapp(e.target.value)} />
        </Card>
        <Card className="border-border/40 bg-card/40 p-5">
          <div className="mb-3 flex items-center gap-2">
            <Smartphone className="h-4 w-4 text-glow-pink" />
            <Label className="text-sm font-medium">Applications mobiles</Label>
          </div>
          <Textarea rows={3} value={mobile} onChange={(e) => setMobile(e.target.value)} />
        </Card>
        <Button onClick={save} disabled={saving}>
          <Save className="h-4 w-4" />
          {saving ? "Sauvegarde..." : "Sauvegarder"}
        </Button>
      </div>
    </SectionShell>
  );
}

// =================== MODÈLES IA (routeur Auto/Éco/Standard/Premium) ===================
export function ModelsSection() {
  const { user } = useAuth();
  const { settings, loading, update } = useElenaSettings();
  const [mode, setMode] = useState<ElenaMode>("auto");
  const [eco, setEco] = useState("");
  const [standard, setStandard] = useState("");
  const [premium, setPremium] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (settings) {
      setMode(settings.default_mode);
      setEco(settings.model_eco);
      setStandard(settings.model_standard);
      setPremium(settings.model_premium);
    }
  }, [settings]);

  if (!user) return <SectionShell title="Modèles IA" description="Routeur intelligent d'Elena."><NotConnected /></SectionShell>;
  if (loading || !settings) return <SectionShell title="Modèles IA" description="Chargement..."><div /></SectionShell>;

  const save = async () => {
    setSaving(true);
    const res = await update({
      default_mode: mode,
      model_eco: eco,
      model_standard: standard,
      model_premium: premium,
    });
    setSaving(false);
    if (res?.error) toast.error("Erreur");
    else toast.success("Routeur mis à jour");
  };

  return (
    <SectionShell
      title="Modèles IA — Routeur Elena"
      description="Choisis le mode par défaut et assigne un modèle à chaque niveau. En mode Auto, Elena choisit elle-même selon la complexité."
    >
      <div className="space-y-5">
        <Card className="border-border/40 bg-card/40 p-5">
          <Label className="mb-2 block text-sm font-medium">Mode par défaut</Label>
          <Select value={mode} onValueChange={(v) => setMode(v as ElenaMode)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">🧠 Auto — Elena choisit selon la tâche</SelectItem>
              <SelectItem value="eco">💰 Éco — toujours le moins cher</SelectItem>
              <SelectItem value="standard">⚖️ Standard — équilibré</SelectItem>
              <SelectItem value="premium">⚡ Premium — toujours le plus puissant</SelectItem>
            </SelectContent>
          </Select>
        </Card>

        <div className="grid gap-4 md:grid-cols-3">
          <ModelPicker label="💰 Modèle Éco" value={eco} onChange={setEco} />
          <ModelPicker label="⚖️ Modèle Standard" value={standard} onChange={setStandard} />
          <ModelPicker label="⚡ Modèle Premium" value={premium} onChange={setPremium} />
        </div>

        <Button onClick={save} disabled={saving}>
          <Save className="h-4 w-4" />
          {saving ? "Sauvegarde..." : "Sauvegarder le routeur"}
        </Button>
      </div>
    </SectionShell>
  );
}

function ModelPicker({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <Card className="border-border/40 bg-card/40 p-4">
      <Label className="mb-2 block text-xs font-medium text-muted-foreground">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          {AVAILABLE_MODELS.map((m) => (
            <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Card>
  );
}

// =================== INTÉGRATIONS API (clés perso chiffrées) ===================
type ProviderId = "openai" | "codex" | "anthropic" | "google" | "xai" | "mistral" | "huggingface" | "replicate";
const PROVIDERS: Array<{ id: ProviderId; name: string; hint: string; placeholder: string; docUrl: string }> = [
  { id: "openai", name: "OpenAI", hint: "GPT-5, GPT-4o — utilisé par l'agent Elena (BYOK)", placeholder: "sk-...", docUrl: "https://platform.openai.com/api-keys" },
  { id: "codex", name: "OpenAI Codex", hint: "Spécialisé code — alternative pour l'agent", placeholder: "sk-...", docUrl: "https://platform.openai.com/api-keys" },
  { id: "anthropic", name: "Anthropic Claude", hint: "Claude Sonnet/Opus — fallback agent", placeholder: "sk-ant-...", docUrl: "https://console.anthropic.com/settings/keys" },
  { id: "google", name: "Google Gemini", hint: "Gemini Pro/Flash", placeholder: "AIza...", docUrl: "https://aistudio.google.com/apikey" },
  { id: "xai", name: "xAI Grok", hint: "Grok 2 / Grok Code", placeholder: "xai-...", docUrl: "https://console.x.ai/" },
  { id: "mistral", name: "Mistral", hint: "Codestral, Mistral Large", placeholder: "...", docUrl: "https://console.mistral.ai/api-keys/" },
  { id: "huggingface", name: "Hugging Face", hint: "Open-source à la demande", placeholder: "hf_...", docUrl: "https://huggingface.co/settings/tokens" },
  { id: "replicate", name: "Replicate", hint: "GPU à la seconde", placeholder: "r8_...", docUrl: "https://replicate.com/account/api-tokens" },
];

type KeyRow = { provider: ProviderId; is_active: boolean; last_used_at: string | null };
type KeyFeedback = { tone: "success" | "error" | "info"; message: string };

export function IntegrationsSection() {
  const { user } = useAuth();
  const { settings, update } = useElenaSettings();
  const [keys, setKeys] = useState<Record<string, KeyRow | undefined>>({});
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Record<string, KeyFeedback | undefined>>({});
  const [savingFb, setSavingFb] = useState(false);

  const actionKey = (provider: ProviderId, action: "test" | "save" | "toggle" | "remove") => `${provider}:${action}`;
  const isBusy = (provider: ProviderId, action?: "test" | "save" | "toggle" | "remove") =>
    action ? busyAction === actionKey(provider, action) : busyAction?.startsWith(`${provider}:`) ?? false;

  const refresh = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("api_keys")
      .select("provider, is_active, last_used_at")
      .eq("owner_id", user.id);
    const map: Record<string, KeyRow> = {};
    (data ?? []).forEach((k) => { map[k.provider] = k as KeyRow; });
    setKeys(map);
  };

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    refresh().finally(() => setLoading(false));
  }, [user]);

  if (!user) return <SectionShell title="Intégrations & API" description="Connecte tes clés API."><NotConnected /></SectionShell>;

  const testKey = async (p: typeof PROVIDERS[0]) => {
    const draft = drafts[p.id]?.trim() ?? "";
    const hasStored = !!keys[p.id];
    if (!draft && !hasStored) { toast.error("Colle d'abord ta clé"); return; }
    if (draft && draft.length < 8) { toast.error("Clé trop courte"); return; }
    setBusyAction(actionKey(p.id, "test"));
    const label = draft ? "nouvelle clé" : "clé enregistrée";
    setFeedback((prev) => ({ ...prev, [p.id]: { tone: "info", message: `Test de la ${label} ${p.name} en cours...` } }));
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      const res = await fetch("/api/test-provider-key", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ provider: p.id, key: draft || undefined }),
      });
      const json = await res.json();
      if (json.ok) {
        const suffix = json.usedStored ? " (clé enregistrée)" : "";
        setFeedback((prev) => ({ ...prev, [p.id]: { tone: "success", message: `Clé ${p.name} valide${suffix}.` } }));
        toast.success(`✅ ${p.name} : clé valide${suffix}`);
      } else {
        setFeedback((prev) => ({ ...prev, [p.id]: { tone: "error", message: json.error ?? "Clé invalide." } }));
        toast.error(`❌ ${p.name} : ${json.error ?? "clé invalide"}`);
      }
    } catch (e) {
      setFeedback((prev) => ({
        ...prev,
        [p.id]: { tone: "error", message: e instanceof Error ? e.message : "Erreur réseau" },
      }));
      toast.error(`Test impossible : ${e instanceof Error ? e.message : "erreur réseau"}`);
    } finally {
      setBusyAction(null);
    }
  };

  const saveKey = async (p: typeof PROVIDERS[0]) => {
    const draft = drafts[p.id]?.trim();
    if (!draft || draft.length < 8) { toast.error("Clé invalide (trop courte)"); return; }
    setBusyAction(actionKey(p.id, "save"));
    setFeedback((prev) => ({ ...prev, [p.id]: { tone: "info", message: `Enregistrement de ${p.name} en cours...` } }));
    try {
      const { data, error } = await supabase.rpc("set_api_key", {
        _provider: p.id,
        _key: draft,
        _label: p.name,
      });
      if (error) {
        console.error("set_api_key error", error);
        setFeedback((prev) => ({ ...prev, [p.id]: { tone: "error", message: error.message } }));
        toast.error(`Erreur enregistrement : ${error.message}`);
        return;
      }
      if (!data) {
        const silentError = "Aucun identifiant retourné par le serveur.";
        setFeedback((prev) => ({ ...prev, [p.id]: { tone: "error", message: silentError } }));
        toast.error(silentError);
        return;
      }
      setDrafts((d) => ({ ...d, [p.id]: "" }));
      await refresh();
      setFeedback((prev) => ({ ...prev, [p.id]: { tone: "success", message: `Clé ${p.name} enregistrée.` } }));
      toast.success(`✅ Clé ${p.name} enregistrée (chiffrée)`);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Erreur inconnue";
      setFeedback((prev) => ({ ...prev, [p.id]: { tone: "error", message } }));
      toast.error(`Erreur enregistrement : ${message}`);
    } finally {
      setBusyAction(null);
    }
  };

  const toggleActive = async (p: typeof PROVIDERS[0], checked: boolean) => {
    if (!keys[p.id]) { toast.error("Ajoute d'abord ta clé"); return; }
    setBusyAction(actionKey(p.id, "toggle"));
    await supabase
      .from("api_keys")
      .update({ is_active: checked })
      .eq("owner_id", user.id)
      .eq("provider", p.id);
    setBusyAction(null);
    await refresh();
  };

  const removeKey = async (p: typeof PROVIDERS[0]) => {
    if (!confirm(`Supprimer ta clé ${p.name} ?`)) return;
    setBusyAction(actionKey(p.id, "remove"));
    await supabase.from("api_keys").delete().eq("owner_id", user.id).eq("provider", p.id);
    setBusyAction(null);
    await refresh();
    setFeedback((prev) => ({ ...prev, [p.id]: { tone: "info", message: `Clé ${p.name} supprimée.` } }));
    toast.success(`Clé ${p.name} supprimée`);
  };

  return (
    <SectionShell
      title="Clés API — fournisseurs IA"
      description="Tes clés sont chiffrées avant d'être stockées. Elles ne quittent jamais le serveur. Elena utilise ta clé pour répondre."
    >
      {/* === Provider par défaut de l'agent === */}
      {settings && (
        <Card className="mb-4 border-glow-violet/40 bg-glow-violet/5 p-4">
          <div className="mb-2 flex items-center gap-2">
            <Bot className="h-4 w-4 text-glow-violet" />
            <Label className="text-sm font-medium">Provider par défaut de l'agent Elena</Label>
          </div>
          <p className="mb-3 text-xs text-muted-foreground">
            Quand Elena code (mode autonome), elle utilise ce provider. Bascule à tout moment.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Select
              value={settings.agent_provider ?? "openai"}
              onValueChange={async (v) => {
                const { error } = (await update({
                  agent_provider: v as DBTypes["public"]["Enums"]["ai_provider"],
                })) ?? {};
                if (error) toast.error("Échec de la mise à jour");
                else toast.success(`Provider Elena : ${v}`);
              }}
            >
              <SelectTrigger><SelectValue placeholder="Provider" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="openai">🟢 OpenAI (recommandé)</SelectItem>
                <SelectItem value="codex">🟢 OpenAI Codex</SelectItem>
                <SelectItem value="anthropic">🟣 Anthropic Claude</SelectItem>
                <SelectItem value="google">🔵 Google Gemini</SelectItem>
                <SelectItem value="xai">⚡ xAI Grok</SelectItem>
                <SelectItem value="mistral">🇫🇷 Mistral / Codestral</SelectItem>
                <SelectItem value="deepseek">🐳 DeepSeek</SelectItem>
                <SelectItem value="groq">⚡ Groq (rapide)</SelectItem>
                <SelectItem value="openrouter">🌐 OpenRouter</SelectItem>
                <SelectItem value="huggingface">🤗 Hugging Face</SelectItem>
                <SelectItem value="replicate">🎨 Replicate</SelectItem>
                <SelectItem value="lovable">💜 Lovable AI</SelectItem>
              </SelectContent>
            </Select>
            <Input
              type="text"
              placeholder="Modèle (ex. gpt-5-mini)"
              defaultValue={settings.agent_model ?? "gpt-5-mini"}
              onBlur={async (e) => {
                const v = e.target.value.trim();
                if (!v || v === settings.agent_model) return;
                const { error } = (await update({ agent_model: v })) ?? {};
                if (error) toast.error("Échec");
                else toast.success("Modèle mis à jour");
              }}
              className="font-mono text-xs"
            />
          </div>
        </Card>
      )}

      <div className="space-y-3">
        {PROVIDERS.map((p) => {
          const row = keys[p.id];
          const hasKey = !!row;
          const isActive = row?.is_active ?? false;
          return (
            <Card key={p.id} className="border-border/40 bg-card/40 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className={`flex h-9 w-9 items-center justify-center rounded-md border ${hasKey && isActive ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400" : "border-border/40 bg-card/50 text-muted-foreground"}`}>
                    {hasKey && isActive ? <Check className="h-4 w-4" /> : <KeyRound className="h-4 w-4" />}
                  </span>
                  <div>
                    <p className="text-sm font-medium">{p.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {p.hint} · <a href={p.docUrl} target="_blank" rel="noreferrer" className="underline hover:text-foreground">obtenir une clé →</a>
                    </p>
                    {hasKey && row?.last_used_at && (
                      <p className="mt-0.5 text-[10px] text-muted-foreground">Dernière utilisation : {new Date(row.last_used_at).toLocaleString()}</p>
                    )}
                  </div>
                </div>
                {hasKey && (
                  <Switch checked={isActive} onCheckedChange={(v) => toggleActive(p, v)} disabled={isBusy(p.id, "toggle")} />
                )}
              </div>

              <div className="mt-3 flex gap-2">
                <Input
                  type="password"
                  placeholder={hasKey ? "•••••••• (clé enregistrée — colle pour remplacer)" : p.placeholder}
                  value={drafts[p.id] ?? ""}
                  onChange={(e) => setDrafts((d) => ({ ...d, [p.id]: e.target.value }))}
                  className="font-mono text-xs"
                />
                <Button
                  variant="outline"
                  onClick={() => testKey(p)}
                  disabled={isBusy(p.id) || (!drafts[p.id]?.trim() && !hasKey)}
                  size="sm"
                  title={drafts[p.id]?.trim() ? "Vérifie la nouvelle clé sans l'enregistrer" : "Vérifie la clé déjà enregistrée auprès du fournisseur"}
                >
                  {isBusy(p.id, "test") ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  {isBusy(p.id, "test") ? "Test..." : "Tester"}
                </Button>
                <Button
                  onClick={() => saveKey(p)}
                  disabled={isBusy(p.id) || !(drafts[p.id]?.trim())}
                  size="sm"
                  title={hasKey ? "Colle une nouvelle clé puis clique pour remplacer la précédente" : "Enregistre la clé (chiffrée)"}
                >
                  {isBusy(p.id, "save") ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  {isBusy(p.id, "save") ? "Enregistrement..." : hasKey ? "Remplacer" : "Enregistrer"}
                </Button>
                {hasKey && (
                  <Button variant="ghost" size="sm" onClick={() => removeKey(p)} disabled={isBusy(p.id)}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>

              {feedback[p.id] && (
                <p
                  className={`mt-2 text-xs ${
                    feedback[p.id]?.tone === "error"
                      ? "text-destructive"
                      : feedback[p.id]?.tone === "success"
                        ? "text-emerald-400"
                        : "text-muted-foreground"
                  }`}
                >
                  {feedback[p.id]?.message}
                </p>
              )}
            </Card>
          );
        })}
      </div>

      {/* Bascule fallback automatique */}
      {settings && (
        <Card className="mt-4 border-border/40 bg-card/40 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Fallback automatique entre providers</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Si OpenAI échoue (clé invalide, quota, panne), Elena bascule automatiquement sur Anthropic puis Google
                en utilisant tes clés perso. Chaque bascule est tracée.
              </p>
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                Ordre actuel : <span className="font-mono text-foreground">{(settings.fallback_chain ?? []).join(" → ")}</span>
              </p>
            </div>
            <Switch
              checked={settings.fallback_enabled ?? true}
              disabled={savingFb}
              onCheckedChange={async (v) => {
                setSavingFb(true);
                const { error } = (await update({ fallback_enabled: v })) ?? {};
                setSavingFb(false);
                if (error) toast.error("Échec de la mise à jour");
                else toast.success(v ? "Fallback activé" : "Fallback désactivé");
              }}
            />
          </div>
        </Card>
      )}

      <Card className="mt-4 border-amber-500/30 bg-amber-500/5 p-4">
        <p className="text-xs text-amber-200/90">
          ⚠️ <strong>Elena n'utilise pas Lovable AI</strong> — elle parle directement aux fournisseurs avec tes clés.
          Sans clé OpenAI active, le chat Elena ne fonctionnera pas. Tes coûts API seront facturés directement par OpenAI selon ta consommation.
        </p>
      </Card>

      {/* === Services externes à débloquer (chantier Elena 2.0) === */}
      <ExternalServicesChecklist />

      {loading && <p className="mt-3 text-xs text-muted-foreground">Chargement...</p>}
    </SectionShell>
  );
}

// ============== Services externes — clés à fournir pour débloquer Elena 2.0 ==============
type ExternalService = {
  category: string;
  name: string;
  unlocks: string;
  envVar: string;
  url: string;
  priority: "P0" | "P1" | "P2";
};

const EXTERNAL_SERVICES: ExternalService[] = [
  // --- LLM additionnels ---
  { category: "🤖 LLM", name: "DeepSeek V3/R1", unlocks: "Modèle ultra low-cost (~10× moins cher qu'OpenAI)", envVar: "DEEPSEEK_API_KEY", url: "https://platform.deepseek.com/api_keys", priority: "P0" },
  { category: "🤖 LLM", name: "Groq", unlocks: "Inférence Llama 3.3 ultra-rapide (~500 tok/s)", envVar: "GROQ_API_KEY", url: "https://console.groq.com/keys", priority: "P1" },
  { category: "🤖 LLM", name: "OpenRouter", unlocks: "Routeur universel (200+ modèles, 1 seule clé)", envVar: "OPENROUTER_API_KEY", url: "https://openrouter.ai/keys", priority: "P1" },

  // --- Voix / audio ---
  { category: "🎙️ Voix", name: "ElevenLabs", unlocks: "TTS v3 (voix premium) + STT Scribe", envVar: "ELEVENLABS_API_KEY", url: "https://elevenlabs.io/app/settings/api-keys", priority: "P1" },

  // --- Vidéo ---
  { category: "🎬 Vidéo", name: "fal.ai (Veo3 / Kling / Luma)", unlocks: "Génération vidéo + animation d'image (image-to-video). 1 seule clé pour Veo 3, Kling v2, Luma Dream Machine.", envVar: "FAL_API_KEY", url: "https://fal.ai/dashboard/keys", priority: "P0" },
  { category: "🎬 Vidéo", name: "Runway Gen-4", unlocks: "Alternative : génération vidéo IA depuis prompt/image", envVar: "RUNWAY_API_KEY", url: "https://dev.runwayml.com/", priority: "P2" },

  // --- Image vectorielle ---
  { category: "🎨 Image", name: "Recraft V3", unlocks: "Logos & SVG vectoriels propres", envVar: "RECRAFT_API_KEY", url: "https://www.recraft.ai/profile/api", priority: "P2" },

  // --- Web / scraping ---
  { category: "🌐 Web", name: "Browserbase", unlocks: "Playwright cloud (browse + actions JS-heavy)", envVar: "BROWSERBASE_API_KEY", url: "https://www.browserbase.com/settings", priority: "P1" },
  { category: "🌐 Web", name: "Jina Reader", unlocks: "URL → Markdown propre (gratuit jusqu'à 1M tok)", envVar: "JINA_API_KEY", url: "https://jina.ai/reader", priority: "P2" },

  // --- Documents ---
  { category: "📄 Docs", name: "LlamaParse", unlocks: "PDF/DOCX → markdown structuré (tables, images)", envVar: "LLAMA_CLOUD_API_KEY", url: "https://cloud.llamaindex.ai/api-key", priority: "P1" },

  // --- Code execution ---
  { category: "🔧 Sandbox", name: "E2B", unlocks: "Sandbox isolée pour exécuter le code généré", envVar: "E2B_API_KEY", url: "https://e2b.dev/dashboard?tab=keys", priority: "P1" },

  // --- Mémoire ---
  { category: "🧠 Mémoire", name: "Mem0", unlocks: "Mémoire long-terme cross-session pour Elena", envVar: "MEM0_API_KEY", url: "https://app.mem0.ai/dashboard/api-keys", priority: "P2" },

  // --- Déploiement ---
  { category: "🚀 Deploy", name: "Vercel", unlocks: "Déploiement projet → URL prod en 1 clic", envVar: "VERCEL_API_TOKEN", url: "https://vercel.com/account/tokens", priority: "P1" },
  { category: "🚀 Deploy", name: "Netlify", unlocks: "Alternative Vercel pour static/JAMstack", envVar: "NETLIFY_API_TOKEN", url: "https://app.netlify.com/user/applications#personal-access-tokens", priority: "P2" },

  // --- Git ---
  { category: "🐙 Git", name: "GitHub", unlocks: "Commit/PR auto depuis Elena (Personal Access Token)", envVar: "GITHUB_API_TOKEN", url: "https://github.com/settings/tokens?type=beta", priority: "P1" },

  // --- Background jobs ---
  { category: "⏱️ Jobs", name: "Trigger.dev", unlocks: "Tâches longues async (vidéo, scraping, batch)", envVar: "TRIGGER_API_KEY", url: "https://cloud.trigger.dev/", priority: "P2" },

  // --- LOT E : Collab & autonomie avancée ---
  { category: "👥 Collab", name: "Liveblocks", unlocks: "Édition collaborative temps réel (curseurs, presence, Yjs)", envVar: "LIVEBLOCKS_SECRET_KEY", url: "https://liveblocks.io/dashboard/apikeys", priority: "P1" },
  { category: "🤖 LLM", name: "Anthropic Claude", unlocks: "Claude 3.5 Sonnet + Computer Use (autonomie navigateur)", envVar: "ANTHROPIC_API_KEY", url: "https://console.anthropic.com/settings/keys", priority: "P0" },
  { category: "💳 Paiement", name: "Stripe", unlocks: "Stripe Atlas (création société auto) + paiements", envVar: "STRIPE_SECRET_KEY", url: "https://dashboard.stripe.com/apikeys", priority: "P1" },
];

type ExtKeyRow = { service: string; is_active: boolean; last_used_at: string | null };

function ExternalServicesChecklist() {
  const { user } = useAuth();
  const [keys, setKeys] = useState<Record<string, ExtKeyRow | undefined>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const grouped = EXTERNAL_SERVICES.reduce<Record<string, ExternalService[]>>((acc, s) => {
    (acc[s.category] = acc[s.category] || []).push(s);
    return acc;
  }, {});

  const serviceKeyOf = (s: ExternalService) => s.envVar.toLowerCase();

  const refresh = async () => {
    if (!user) return;
    const { data } = await (supabase.from as any)("external_keys")
      .select("service, is_active, last_used_at")
      .eq("owner_id", user.id);
    const map: Record<string, ExtKeyRow> = {};
    (data ?? []).forEach((k: ExtKeyRow) => { map[k.service] = k; });
    setKeys(map);
  };

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    refresh().finally(() => setLoading(false));
  }, [user]);

  const saveKey = async (s: ExternalService) => {
    const key = drafts[s.envVar]?.trim();
    if (!key || key.length < 8) { toast.error("Clé invalide (trop courte)"); return; }
    setBusy(s.envVar);
    const { error } = await (supabase.rpc as any)("set_external_key", {
      _service: serviceKeyOf(s),
      _key: key,
      _label: s.name,
    });
    setBusy(null);
    if (error) { toast.error(`Erreur : ${error.message}`); return; }
    setDrafts((d) => ({ ...d, [s.envVar]: "" }));
    await refresh();
    toast.success(`✅ Clé ${s.name} enregistrée (chiffrée)`);
  };

  const removeKey = async (s: ExternalService) => {
    if (!user) return;
    if (!confirm(`Supprimer ta clé ${s.name} ?`)) return;
    setBusy(s.envVar);
    await (supabase.from as any)("external_keys")
      .delete()
      .eq("owner_id", user.id)
      .eq("service", serviceKeyOf(s));
    setBusy(null);
    await refresh();
    toast.success(`Clé ${s.name} supprimée`);
  };

  const toggleActive = async (s: ExternalService, checked: boolean) => {
    if (!user || !keys[serviceKeyOf(s)]) return;
    setBusy(s.envVar);
    await (supabase.from as any)("external_keys")
      .update({ is_active: checked })
      .eq("owner_id", user.id)
      .eq("service", serviceKeyOf(s));
    setBusy(null);
    await refresh();
  };

  const totalConfigured = Object.values(keys).filter(Boolean).length;

  return (
    <Card className="mt-6 border-glow-blue/30 bg-glow-blue/5 p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-foreground">🔌 Services externes (BYOK)</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Colle tes clés directement ici — elles sont <strong>chiffrées dans ta propre base</strong> (jamais
            envoyées au navigateur après save). Aucune dépendance à un fournisseur cloud externe.
          </p>
        </div>
        <span className="rounded-md border border-glow-blue/40 bg-glow-blue/10 px-2 py-1 text-[10px] font-medium text-glow-blue">
          {totalConfigured} / {EXTERNAL_SERVICES.length} configurées
        </span>
      </div>

      <div className="space-y-4">
        {Object.entries(grouped).map(([cat, items]) => (
          <div key={cat}>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{cat}</p>
            <div className="space-y-2">
              {items.map((s) => {
                const row = keys[serviceKeyOf(s)];
                const hasKey = !!row;
                const isActive = row?.is_active ?? false;
                const isBusy = busy === s.envVar;
                return (
                  <Card key={s.envVar} className="border-border/40 bg-card/40 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <span
                          className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border ${
                            hasKey && isActive
                              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                              : "border-border/40 bg-card/50 text-muted-foreground"
                          }`}
                        >
                          {hasKey && isActive ? <Check className="h-4 w-4" /> : <KeyRound className="h-4 w-4" />}
                        </span>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium">{s.name}</p>
                            <span
                              className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${
                                s.priority === "P0"
                                  ? "bg-red-500/15 text-red-400"
                                  : s.priority === "P1"
                                    ? "bg-amber-500/15 text-amber-400"
                                    : "bg-muted/40 text-muted-foreground"
                              }`}
                            >
                              {s.priority}
                            </span>
                          </div>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {s.unlocks} ·{" "}
                            <a href={s.url} target="_blank" rel="noreferrer" className="underline hover:text-foreground">
                              obtenir une clé →
                            </a>
                          </p>
                          {hasKey && row?.last_used_at && (
                            <p className="mt-0.5 text-[10px] text-muted-foreground">
                              Dernière utilisation : {new Date(row.last_used_at).toLocaleString()}
                            </p>
                          )}
                        </div>
                      </div>
                      {hasKey && (
                        <Switch
                          checked={isActive}
                          onCheckedChange={(v) => toggleActive(s, v)}
                          disabled={isBusy}
                        />
                      )}
                    </div>

                    <div className="mt-3 flex gap-2">
                      <Input
                        type="password"
                        placeholder={hasKey ? "•••••••• (clé enregistrée — colle pour remplacer)" : "Colle ta clé ici"}
                        value={drafts[s.envVar] ?? ""}
                        onChange={(e) => setDrafts((d) => ({ ...d, [s.envVar]: e.target.value }))}
                        className="font-mono text-xs"
                      />
                      <Button
                        onClick={() => saveKey(s)}
                        disabled={isBusy || !(drafts[s.envVar]?.trim())}
                        size="sm"
                      >
                        {isBusy ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                        {hasKey ? "Remplacer" : "Enregistrer"}
                      </Button>
                      {hasKey && (
                        <Button variant="ghost" size="sm" onClick={() => removeKey(s)} disabled={isBusy}>
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <p className="mt-4 rounded-md border border-amber-500/30 bg-amber-500/5 p-2 text-[11px] text-amber-200/90">
        💡 Tes clés sont chiffrées avec <code className="font-mono">pgp_sym_encrypt</code> et ne quittent jamais
        le serveur. Tes utilisateurs Nexyra auront la même expérience BYOK pour leurs propres clés.
        {loading && " — Chargement..."}
      </p>
    </Card>
  );
}

// =================== STOCKAGE / MÉMOIRE ===================
export function StorageSection() {
  const { user } = useAuth();
  const { settings, loading, update } = useElenaSettings();
  const [stats, setStats] = useState({ projects: 0, conversations: 0, messages: 0 });
  const [autoSummarize, setAutoSummarize] = useState(20);
  const [maxContext, setMaxContext] = useState(30);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (settings) {
      setAutoSummarize(settings.auto_summarize_after);
      setMaxContext(settings.max_context_messages);
    }
  }, [settings]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [{ count: p }, { count: c }, { count: m }] = await Promise.all([
        supabase.from("projects").select("*", { count: "exact", head: true }).eq("owner_id", user.id),
        supabase.from("conversations").select("*", { count: "exact", head: true }).eq("owner_id", user.id),
        supabase.from("messages").select("*", { count: "exact", head: true }).eq("owner_id", user.id),
      ]);
      setStats({ projects: p ?? 0, conversations: c ?? 0, messages: m ?? 0 });
    })();
  }, [user]);

  if (!user) return <SectionShell title="Stockage & Mémoire" description="Mémoire d'Elena."><NotConnected /></SectionShell>;
  if (loading || !settings) return <SectionShell title="Stockage & Mémoire" description="Chargement..."><div /></SectionShell>;

  const save = async () => {
    setSaving(true);
    const res = await update({ auto_summarize_after: autoSummarize, max_context_messages: maxContext });
    setSaving(false);
    if (res?.error) toast.error("Erreur");
    else toast.success("Réglages mémoire sauvegardés");
  };

  const purge = async () => {
    if (!confirm("Supprimer toutes les conversations ? (les projets sont conservés)")) return;
    await supabase.from("conversations").delete().eq("owner_id", user.id);
    setStats((s) => ({ ...s, conversations: 0, messages: 0 }));
    toast.success("Mémoire purgée");
  };

  return (
    <SectionShell
      title="Stockage & Mémoire"
      description="Mémoire long-terme d'Elena et règles d'économie de tokens."
    >
      <div className="grid gap-3 md:grid-cols-3">
        <StatCard label="Projets" value={stats.projects} />
        <StatCard label="Conversations" value={stats.conversations} />
        <StatCard label="Messages" value={stats.messages} />
      </div>

      <Card className="mt-5 border-border/40 bg-card/40 p-5">
        <h3 className="mb-3 text-sm font-medium">Économie de tokens</h3>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label className="mb-1 block text-xs text-muted-foreground">Résumer après N messages</Label>
            <Input type="number" min={5} max={100} value={autoSummarize} onChange={(e) => setAutoSummarize(Number(e.target.value))} />
            <p className="mt-1 text-[11px] text-muted-foreground">Compresse les vieux échanges en résumé.</p>
          </div>
          <div>
            <Label className="mb-1 block text-xs text-muted-foreground">Max messages dans le contexte</Label>
            <Input type="number" min={5} max={200} value={maxContext} onChange={(e) => setMaxContext(Number(e.target.value))} />
            <p className="mt-1 text-[11px] text-muted-foreground">Plus c'est bas, moins ça coûte par appel.</p>
          </div>
        </div>
        <Button onClick={save} disabled={saving} className="mt-4">
          <Save className="h-4 w-4" />
          {saving ? "..." : "Sauvegarder"}
        </Button>
      </Card>

      <Card className="mt-4 border-destructive/30 bg-destructive/5 p-5">
        <h3 className="text-sm font-medium">Zone dangereuse</h3>
        <p className="mt-1 text-xs text-muted-foreground">Supprime toutes les conversations et messages d'Elena. Irréversible.</p>
        <Button variant="destructive" size="sm" onClick={purge} className="mt-3">
          <X className="h-4 w-4" />
          Purger la mémoire
        </Button>
      </Card>
    </SectionShell>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card className="border-border/40 bg-card/40 p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold gradient-text">{value}</p>
    </Card>
  );
}

// =================== TOOLS (placeholder) ===================
export function ToolsSection() {
  return (
    <SectionShell title="Outils" description="Capacités utilisables par Elena (à venir).">
      <Card className="border-dashed border-border/50 bg-card/30 p-10 text-center">
        <Wrench className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">MCP, scraping, exécution de code — Sprint 2</p>
      </Card>
    </SectionShell>
  );
}

// =================== APPEARANCE (placeholder) ===================
export function AppearanceSection() {
  return (
    <SectionShell title="Apparence" description="Thème et préférences visuelles.">
      <Card className="border-dashed border-border/50 bg-card/30 p-10 text-center">
        <Palette className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Mode sombre Nexyra (par défaut). Plus d'options à venir.</p>
      </Card>
    </SectionShell>
  );
}
