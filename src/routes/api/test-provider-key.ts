import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type Provider = "openai" | "anthropic" | "google" | "huggingface" | "replicate" | "codex" | "xai" | "mistral";

function jsonError(error: string, status: number) {
  return new Response(JSON.stringify({ ok: false, error }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function ok(payload: Record<string, unknown>) {
  return new Response(JSON.stringify({ ok: true, ...payload }), {
    headers: { "Content-Type": "application/json" },
  });
}

async function pingOpenAI(key: string) {
  const res = await fetch("https://api.openai.com/v1/models", {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}`);
  const json = await res.json();
  const count = Array.isArray(json?.data) ? json.data.length : 0;
  return { models: count };
}

async function pingAnthropic(key: string) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-3-5-haiku-20241022",
      max_tokens: 1,
      messages: [{ role: "user", content: "ok" }],
    }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Anthropic ${res.status}: ${txt.slice(0, 120)}`);
  }
  return { ok: true };
}

async function pingGoogle(key: string) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`
  );
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Google ${res.status}: ${txt.slice(0, 160)}`);
  }
  const json = await res.json();
  const count = Array.isArray(json?.models) ? json.models.length : 0;
  return { models: count };
}

async function pingHuggingFace(key: string) {
  const res = await fetch("https://huggingface.co/api/whoami-v2", {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!res.ok) throw new Error(`HuggingFace ${res.status}`);
  const json = await res.json();
  return { user: json?.name ?? "ok" };
}

async function pingReplicate(key: string) {
  const res = await fetch("https://api.replicate.com/v1/account", {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!res.ok) throw new Error(`Replicate ${res.status}`);
  const json = await res.json();
  return { user: json?.username ?? "ok" };
}

async function pingXAI(key: string) {
  const res = await fetch("https://api.x.ai/v1/models", {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!res.ok) throw new Error(`xAI ${res.status}`);
  const json = await res.json();
  const count = Array.isArray(json?.data) ? json.data.length : 0;
  return { models: count };
}

async function pingMistral(key: string) {
  const res = await fetch("https://api.mistral.ai/v1/models", {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!res.ok) throw new Error(`Mistral ${res.status}`);
  const json = await res.json();
  const count = Array.isArray(json?.data) ? json.data.length : 0;
  return { models: count };
}

async function pingProvider(provider: Provider, key: string) {
  switch (provider) {
    case "openai":
    case "codex":
      return pingOpenAI(key);
    case "anthropic":
      return pingAnthropic(key);
    case "google":
      return pingGoogle(key);
    case "huggingface":
      return pingHuggingFace(key);
    case "replicate":
      return pingReplicate(key);
    case "xai":
      return pingXAI(key);
    case "mistral":
      return pingMistral(key);
    default:
      throw new Error("Provider inconnu");
  }
}

export const Route = createFileRoute("/api/test-provider-key")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          // ── Auth required for ALL code paths (prevents anonymous key-validation oracle)
          const SUPABASE_URL = process.env.SUPABASE_URL;
          const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
          const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
          if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
            return jsonError("Server misconfigured", 500);
          }

          const authHeader = request.headers.get("authorization");
          if (!authHeader?.startsWith("Bearer ")) {
            return jsonError("Connecte-toi pour tester une clé", 401);
          }
          const token = authHeader.slice(7);

          const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
            global: { headers: { Authorization: `Bearer ${token}` } },
            auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
          });
          const { data: claims, error: claimsErr } = await supabase.auth.getClaims(token);
          if (claimsErr || !claims?.claims?.sub) {
            return jsonError("Session invalide", 401);
          }
          const userId = claims.claims.sub as string;

          const body = (await request.json()) as { provider: Provider; key?: string };
          const provider = body.provider;
          const draftKey = (body.key ?? "").trim();

          if (!provider) return jsonError("Missing provider", 400);

          let key = draftKey;
          let usedStored = false;

          // Si pas de draft → on teste la clé déjà enregistrée pour ce user
          if (!key) {
            const supabaseAdmin = createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
              auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
            });
            const { data, error } = await supabaseAdmin.rpc("get_api_key_decrypted", {
              _owner_id: userId,
              _provider: provider,
            });
            if (error) return jsonError(`Lecture clé: ${error.message}`, 200);
            if (!data) return jsonError("Aucune clé enregistrée pour ce provider", 200);
            key = String(data);
            usedStored = true;
          }

          if (key.length < 8) return jsonError("Clé trop courte", 400);

          const info = await pingProvider(provider, key);
          return ok({ provider, info, usedStored });
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Erreur inconnue";
          return jsonError(msg, 200);
        }
      },
    },
  },
});
