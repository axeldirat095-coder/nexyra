/**
 * LOT 25 — Tools scaffolding & TTS premium
 *
 *  - auth_configure       : scaffold complet Supabase Auth (Google OAuth + magic link)
 *                           dans le projet user (route /auth, hook useAuth, ProtectedRoute).
 *  - edge_function_deploy : génère un squelette d'edge function Supabase dans VFS
 *                           (supabase/functions/<name>/index.ts + config.toml).
 *  - cartesia_tts         : TTS premium Cartesia Sonic (BYOK `cartesia_api_key`),
 *                           voix ultra-naturelle ~75ms latence.
 */
import type { ToolResult, FsMutation } from "./agent-tools.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = any;

export const LOT25_TOOL_SCHEMAS = [
  {
    type: "function",
    function: {
      name: "auth_configure",
      description:
        "Scaffold complet authentification Supabase : page /auth avec Google OAuth + magic link, hook useAuth, composant ProtectedRoute. Idempotent (skip fichiers existants). Préfère ce tool plutôt que de coder l'auth from scratch.",
      parameters: {
        type: "object",
        properties: {
          enable_google: { type: "boolean", description: "Active bouton Google OAuth (défaut true)." },
          enable_magic_link: { type: "boolean", description: "Active magic link email (défaut true)." },
          redirect_path: { type: "string", description: "Chemin post-login (défaut '/')." },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "edge_function_deploy",
      description:
        "Génère un squelette d'edge function Supabase Deno dans VFS : `supabase/functions/<name>/index.ts` + ajoute le bloc verify_jwt dans `supabase/config.toml`. Le déploiement réel se fait automatiquement par la plateforme Lovable Cloud.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Nom de la fonction (kebab-case, ex: 'send-email')." },
          verify_jwt: { type: "boolean", description: "Exiger JWT auth (défaut true). Mettre false pour webhooks publics." },
          purpose: { type: "string", description: "Phrase courte décrivant le rôle (insérée en commentaire)." },
        },
        required: ["name"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "cartesia_tts",
      description:
        "Synthèse vocale premium Cartesia Sonic — voix ultra-naturelle ~75ms latence (BYOK `cartesia_api_key`). Retourne audio mp3 dataUrl. Idéal pour assistants vocaux temps-réel, narration premium.",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string", description: "Texte à synthétiser (max ~2000 chars)." },
          voice_id: {
            type: "string",
            description: "ID voix Cartesia. Défaut 'a0e99841-438c-4a64-b679-ae501e7d6091' (français naturel).",
          },
          language: { type: "string", description: "Code langue ISO (fr, en, es, …). Défaut 'fr'." },
          target_path: { type: "string", description: "Chemin VFS (ex: src/assets/voice.mp3.ts)." },
        },
        required: ["text"],
        additionalProperties: false,
      },
    },
  },
] as const;

async function fetchUserKey(sb: SupabaseLike, userId: string, service: string): Promise<string | null> {
  const { data } = await sb.rpc("get_external_key_decrypted", { _owner_id: userId, _service: service });
  return typeof data === "string" && data.length > 0 ? data : null;
}

function markUsed(sb: SupabaseLike, userId: string, service: string): void {
  void sb.rpc("mark_external_key_used", { _owner_id: userId, _service: service }).then(() => undefined);
}

// ---------- auth_configure ----------

const AUTH_PAGE = (enableGoogle: boolean, enableMagic: boolean, redirect: string) => `import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "@tanstack/react-router";

export default function AuthPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const navigate = useNavigate();

  ${
    enableGoogle
      ? `const signInGoogle = async () => {
    setLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin + ${JSON.stringify(redirect)} },
    });
    if (error) setMsg(error.message);
    setLoading(false);
  };`
      : ""
  }

  ${
    enableMagic
      ? `const sendMagic = async () => {
    setLoading(true); setMsg(null);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin + ${JSON.stringify(redirect)} },
    });
    setMsg(error ? error.message : "Lien envoyé — vérifie ta boîte mail.");
    setLoading(false);
  };`
      : ""
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm space-y-4 rounded-2xl border border-border bg-card p-8 shadow-xl">
        <h1 className="text-2xl font-semibold text-foreground">Connexion</h1>
        ${
          enableGoogle
            ? `<button onClick={signInGoogle} disabled={loading} className="w-full rounded-xl bg-primary px-4 py-3 text-primary-foreground font-medium hover:opacity-90 disabled:opacity-50">Continuer avec Google</button>`
            : ""
        }
        ${
          enableMagic
            ? `<div className="space-y-2">
          <input type="email" placeholder="ton@email.com" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-xl border border-input bg-background px-4 py-3 text-foreground" />
          <button onClick={sendMagic} disabled={loading || !email} className="w-full rounded-xl border border-border px-4 py-3 text-foreground font-medium hover:bg-muted disabled:opacity-50">Recevoir un lien magique</button>
        </div>`
            : ""
        }
        {msg && <p className="text-sm text-muted-foreground">{msg}</p>}
      </div>
    </div>
  );
}
`;

const USE_AUTH_HOOK = `import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setUser(s?.user ?? null);
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const signOut = () => supabase.auth.signOut();
  return { session, user, loading, signOut };
}
`;

const PROTECTED_ROUTE = `import type { ReactNode } from "react";
import { Navigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/useAuth";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen grid place-items-center text-muted-foreground">Chargement…</div>;
  if (!user) return <Navigate to="/auth" />;
  return <>{children}</>;
}
`;

function runAuthConfigure(
  args: Record<string, unknown>,
  vfs: Map<string, string>,
  mutations: FsMutation[],
): ToolResult {
  const enableGoogle = args.enable_google !== false;
  const enableMagic = args.enable_magic_link !== false;
  const redirect = args.redirect_path ? String(args.redirect_path) : "/";

  const writes: Array<[string, string]> = [];
  const skipped: string[] = [];

  const targets: Array<[string, string]> = [
    ["src/routes/auth.tsx", `import { createFileRoute } from "@tanstack/react-router";\nimport AuthPage from "@/pages/AuthPage";\n\nexport const Route = createFileRoute("/auth")({ component: AuthPage });\n`],
    ["src/pages/AuthPage.tsx", AUTH_PAGE(enableGoogle, enableMagic, redirect)],
    ["src/hooks/useAuth.ts", USE_AUTH_HOOK],
    ["src/components/ProtectedRoute.tsx", PROTECTED_ROUTE],
  ];

  for (const [path, content] of targets) {
    if (vfs.has(path)) {
      skipped.push(path);
      continue;
    }
    vfs.set(path, content);
    mutations.push({ op: "write", path, content });
    writes.push([path, content]);
  }

  return {
    ok: true,
    output: `🔐 auth_configure : ${writes.length} fichier(s) créé(s)${writes.length ? "\n• " + writes.map(([p]) => p).join("\n• ") : ""}${skipped.length ? `\n⏭️ Skip (déjà présent) : ${skipped.join(", ")}` : ""}\n→ Active Google OAuth dans la console Lovable Cloud > Auth > Providers.`,
  };
}

// ---------- edge_function_deploy ----------

function runEdgeFunctionDeploy(
  args: Record<string, unknown>,
  vfs: Map<string, string>,
  mutations: FsMutation[],
): ToolResult {
  const rawName = String(args.name ?? "").trim();
  if (!/^[a-z][a-z0-9-]{0,40}$/.test(rawName)) {
    return { ok: false, output: "edge_function_deploy: 'name' invalide (kebab-case, lettres/chiffres/-, max 40)." };
  }
  const verifyJwt = args.verify_jwt !== false;
  const purpose = args.purpose ? String(args.purpose) : `Edge function ${rawName}`;

  const fnPath = `supabase/functions/${rawName}/index.ts`;
  if (vfs.has(fnPath)) {
    return { ok: true, output: `edge_function_deploy: ${fnPath} existe déjà (skip).` };
  }

  const fnSrc = `// ${purpose}
// Auto-généré par edge_function_deploy.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    // TODO: implémente ta logique ici
    return new Response(JSON.stringify({ ok: true, echo: body }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
`;
  vfs.set(fnPath, fnSrc);
  mutations.push({ op: "write", path: fnPath, content: fnSrc });

  // Patch supabase/config.toml — ajoute le bloc si verify_jwt diffère du défaut (true)
  const cfgPath = "supabase/config.toml";
  const cfg = vfs.get(cfgPath) ?? "";
  if (!verifyJwt) {
    const block = `\n[functions.${rawName}]\nverify_jwt = false\n`;
    if (!cfg.includes(`[functions.${rawName}]`)) {
      const next = (cfg.endsWith("\n") || !cfg ? cfg : cfg + "\n") + block;
      vfs.set(cfgPath, next);
      mutations.push({ op: "write", path: cfgPath, content: next });
    }
  }

  return {
    ok: true,
    output: `⚡ Edge function créée : ${fnPath} (verify_jwt=${verifyJwt}). Déployée automatiquement par Lovable Cloud.`,
  };
}

// ---------- cartesia_tts ----------

async function bufferToDataUrl(buf: ArrayBuffer, mime: string): Promise<string> {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return `data:${mime};base64,${btoa(binary)}`;
}

async function runCartesiaTts(
  args: Record<string, unknown>,
  vfs: Map<string, string>,
  mutations: FsMutation[],
  sb: SupabaseLike,
  userId: string,
): Promise<ToolResult> {
  const text = String(args.text ?? "").trim();
  if (!text) return { ok: false, output: "cartesia_tts: 'text' requis." };
  if (text.length > 2500) return { ok: false, output: "cartesia_tts: text trop long (>2500)." };

  const apiKey = await fetchUserKey(sb, userId, "cartesia_api_key");
  if (!apiKey) return { ok: false, output: "cartesia_tts: clé `cartesia_api_key` requise (https://cartesia.ai)." };

  const voice = args.voice_id ? String(args.voice_id) : "a0e99841-438c-4a64-b679-ae501e7d6091";
  const language = args.language ? String(args.language) : "fr";

  try {
    const res = await fetch("https://api.cartesia.ai/tts/bytes", {
      method: "POST",
      headers: {
        "X-API-Key": apiKey,
        "Cartesia-Version": "2024-06-10",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model_id: "sonic-2",
        transcript: text,
        voice: { mode: "id", id: voice },
        language,
        output_format: { container: "mp3", bit_rate: 128000, sample_rate: 44100 },
      }),
      signal: AbortSignal.timeout(45_000),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      return { ok: false, output: `cartesia_tts: HTTP ${res.status} — ${txt.slice(0, 160)}` };
    }
    const buf = await res.arrayBuffer();
    const dataUrl = await bufferToDataUrl(buf, "audio/mpeg");
    markUsed(sb, userId, "cartesia_api_key");

    const targetPath = args.target_path ? String(args.target_path) : null;
    if (targetPath) {
      const moduleSrc = `// Cartesia Sonic TTS — ne pas éditer.\nconst audio: string = ${JSON.stringify(dataUrl)};\nexport default audio;\n`;
      vfs.set(targetPath, moduleSrc);
      mutations.push({ op: "write", path: targetPath, content: moduleSrc });
    }
    return {
      ok: true,
      output: `🔊 Cartesia Sonic TTS (${(buf.byteLength / 1024).toFixed(1)} KB, ${language})${targetPath ? ` → ${targetPath}` : ""}\n${dataUrl.slice(0, 80)}…`,
    };
  } catch (e) {
    return { ok: false, output: `cartesia_tts: ${e instanceof Error ? e.message : "erreur"}` };
  }
}

export async function executeLot25Tool(
  name: string,
  rawArgs: Record<string, unknown>,
  vfs: Map<string, string>,
  mutations: FsMutation[],
  supabaseClient: unknown,
  userId: string,
): Promise<ToolResult | null> {
  if (name === "auth_configure") return runAuthConfigure(rawArgs, vfs, mutations);
  if (name === "edge_function_deploy") return runEdgeFunctionDeploy(rawArgs, vfs, mutations);
  if (name === "cartesia_tts") {
    if (!userId) return { ok: false, output: "cartesia_tts: auth requise" };
    return runCartesiaTts(rawArgs, vfs, mutations, supabaseClient, userId);
  }
  return null;
}
