/**
 * sandbox-state.functions — persistance DB de l'état live de la sandbox.
 *
 * Remplace l'ancien système 100% localStorage (perdu si cache vidé / autre device).
 * Une ligne par projet dans `project_sandbox_state`, upsert à chaque save.
 *
 * ⚠️ AUTH INLINE (pas de middleware throw-Response) :
 * `createServerFn` côté client n'injecte pas automatiquement le JWT Supabase.
 * Si on utilise `requireSupabaseAuth` (qui throw `Response(401)`), le client reçoit
 * un rejet `[object Response]` qui remonte en RUNTIME_ERROR + écran blanc.
 * On résout proprement : on lit le header optionnel et on retourne `{ ok: false }`
 * silencieusement si l'auth manque — le caller sait déjà gérer ce cas.
 */
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";

const FileSchema = z.object({
  path: z.string().min(1).max(500),
  content: z.string(),
});

const SaveSchema = z.object({
  project_id: z.string().uuid(),
  mode: z.string().min(1).max(32),
  files: z.array(FileSchema).max(2000),
  open_tabs: z.array(z.string()).max(50),
  active_path: z.string().nullable().optional(),
});

type AuthCtx =
  | { ok: true; supabase: ReturnType<typeof createClient<Database>>; userId: string }
  | { ok: false; reason: string };

function getAuthFromRequest(): AuthCtx {
  try {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
    if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
      return { ok: false, reason: "missing-env" };
    }
    const authHeader = getRequestHeader("authorization") ?? getRequestHeader("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return { ok: false, reason: "no-auth" };
    }
    const token = authHeader.slice(7).trim();
    if (!token) return { ok: false, reason: "no-token" };

    const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    });
    return { ok: true, supabase, userId: "" }; // userId rempli après getClaims
  } catch (e) {
    console.warn("[sandbox-state] auth setup failed", e);
    return { ok: false, reason: "exception" };
  }
}

async function resolveAuth(): Promise<AuthCtx> {
  const ctx = getAuthFromRequest();
  if (!ctx.ok) return ctx;
  try {
    const authHeader =
      getRequestHeader("authorization") ?? getRequestHeader("Authorization") ?? "";
    const token = authHeader.slice(7).trim();
    const { data, error } = await ctx.supabase.auth.getClaims(token);
    if (error || !data?.claims?.sub) {
      return { ok: false, reason: "invalid-token" };
    }
    return { ok: true, supabase: ctx.supabase, userId: data.claims.sub };
  } catch (e) {
    console.warn("[sandbox-state] getClaims failed", e);
    return { ok: false, reason: "claims-exception" };
  }
}

export const saveSandboxState = createServerFn({ method: "POST" })
  .inputValidator((input) => SaveSchema.parse(input))
  .handler(async ({ data }) => {
    const auth = await resolveAuth();
    if (!auth.ok) return { ok: false, error: `unauth:${auth.reason}` };
    const { supabase, userId } = auth;

    const sizeBytes = data.files.reduce(
      (sum, f) => sum + f.path.length + (f.content?.length ?? 0),
      0,
    );
    if (sizeBytes > 4_000_000) {
      return { ok: false, error: "Sandbox trop volumineuse pour la sauvegarde live (>4MB)." };
    }
    const { error } = await supabase.from("project_sandbox_state").upsert(
      {
        project_id: data.project_id,
        owner_id: userId,
        mode: data.mode,
        files: data.files,
        open_tabs: data.open_tabs,
        active_path: data.active_path ?? null,
        file_count: data.files.length,
        size_bytes: sizeBytes,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "project_id" },
    );
    if (error) {
      console.error("[saveSandboxState]", error);
      return { ok: false, error: error.message };
    }
    return { ok: true, file_count: data.files.length, size_bytes: sizeBytes };
  });

export const loadSandboxState = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ project_id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const auth = await resolveAuth();
    if (!auth.ok) return { ok: false, state: null as null };
    const { supabase } = auth;

    const { data: row, error } = await supabase
      .from("project_sandbox_state")
      .select("mode, files, open_tabs, active_path, file_count, updated_at")
      .eq("project_id", data.project_id)
      .maybeSingle();
    if (error) {
      console.error("[loadSandboxState]", error);
      return { ok: false, state: null as null };
    }
    return { ok: true, state: row };
  });
