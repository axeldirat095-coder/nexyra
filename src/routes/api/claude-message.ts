/**
 * Proxy Anthropic Claude Messages API (BYOK).
 * Réponse JSON brute Anthropic ou { ok:false, error }.
 *
 * Utilisé par Elena v2 (tool claude_reasoning) pour offload long contexte
 * et planning lourd (Claude 3.5 Sonnet par défaut).
 */
import "@tanstack/react-start";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";

const bodySchema = z.object({
  model: z.string().default("claude-3-5-sonnet-20241022"),
  system: z.string().max(20_000).optional(),
  prompt: z.string().min(1).max(80_000),
  max_tokens: z.number().int().min(1).max(8192).default(2048),
  temperature: z.number().min(0).max(1).default(0.4),
});

export const Route = createFileRoute("/api/claude-message")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = request.headers.get("authorization") ?? "";
        if (!auth.startsWith("Bearer ")) return new Response("Unauthorized", { status: 401 });
        const token = auth.slice(7);

        const url = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
        const anon =
          process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
          process.env.SUPABASE_PUBLISHABLE_KEY ??
          process.env.SUPABASE_ANON_KEY;
        const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!url || !anon || !service) return new Response("Server misconfig", { status: 500 });

        const sbUser = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } } });
        const { data: claims, error } = await sbUser.auth.getClaims(token);
        if (error || !claims?.claims?.sub) return new Response("Unauthorized", { status: 401 });
        const userId = claims.claims.sub as string;

        let body: z.infer<typeof bodySchema>;
        try {
          body = bodySchema.parse(await request.json());
        } catch (e) {
          return new Response(`Bad request: ${e instanceof Error ? e.message : "invalid"}`, { status: 400 });
        }

        const sbAdmin = createClient(url, service);
        const { data: keyData } = await sbAdmin.rpc("get_external_key_decrypted", {
          _owner_id: userId,
          _service: "anthropic",
        });
        const apiKey = (keyData as string | null) || process.env.ANTHROPIC_API_KEY || null;
        if (!apiKey) {
          return Response.json(
            { ok: false, error: "ANTHROPIC_API_KEY manquante : ajoute ta clé Anthropic dans Réglages → Intégrations." },
            { status: 400 },
          );
        }

        const r = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: body.model,
            max_tokens: body.max_tokens,
            temperature: body.temperature,
            ...(body.system ? { system: body.system } : {}),
            messages: [{ role: "user", content: body.prompt }],
          }),
        });
        if (!r.ok) {
          const errText = await r.text().catch(() => "");
          return Response.json({ ok: false, error: `Anthropic ${r.status}: ${errText.slice(0, 300)}` }, { status: 502 });
        }
        const json = (await r.json()) as {
          content?: Array<{ type: string; text?: string }>;
          usage?: { input_tokens: number; output_tokens: number };
          model?: string;
        };
        const text = (json.content ?? [])
          .filter((b) => b.type === "text")
          .map((b) => b.text ?? "")
          .join("\n")
          .trim();
        if (keyData) await sbAdmin.rpc("mark_external_key_used", { _owner_id: userId, _service: "anthropic" });
        return Response.json({
          ok: true,
          text,
          model: json.model ?? body.model,
          usage: json.usage ?? null,
        });
      },
    },
  },
});
