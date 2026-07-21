import { supabase } from "@/integrations/supabase/client";

/**
 * Audit log : trace une action sensible (création/modif/suppression critique).
 * Échec silencieux : un log raté ne doit jamais bloquer l'action métier.
 */
export async function logAudit(input: {
  action: string;
  resource_type?: string;
  resource_id?: string;
  org_id?: string | null;
  details?: Record<string, unknown>;
}) {
  try {
    const { data: auth } = await supabase.auth.getUser();
    const user_id = auth?.user?.id;
    if (!user_id) return;
    await supabase.rpc("log_audit_event", {
      _action: input.action.slice(0, 120),
      _resource_type: input.resource_type ?? undefined,
      _resource_id: input.resource_id ?? undefined,
      _org_id: input.org_id ?? undefined,
      _details: (input.details ?? {}) as never,
      _user_agent:
        typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 500) : undefined,
    });

  } catch {
    /* noop */
  }
}


/**
 * Capture une erreur (client par défaut). Sans dépendance externe (pas de Sentry).
 */
export async function captureError(
  err: unknown,
  ctx?: {
    level?: "debug" | "info" | "warn" | "error" | "fatal";
    source?: "client" | "server" | "edge" | "worker";
    route?: string;
    context?: Record<string, unknown>;
  },
) {
  try {
    const message =
      err instanceof Error ? err.message : typeof err === "string" ? err : JSON.stringify(err);
    const stack = err instanceof Error ? err.stack ?? null : null;
    const { data: auth } = await supabase.auth.getUser().catch(() => ({ data: null as never }));
    await supabase.from("error_events").insert([
      {
        level: ctx?.level ?? "error",
        source: ctx?.source ?? "client",
        message: (message ?? "Unknown error").slice(0, 4000),
        stack: stack ? stack.slice(0, 16000) : null,
        route:
          ctx?.route ??
          (typeof window !== "undefined" ? window.location.pathname.slice(0, 500) : null),
        user_agent:
          typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 500) : null,
        user_id: auth?.user?.id ?? null,
        context: (ctx?.context ?? {}) as never,
      },
    ]);
  } catch {
    /* noop */
  }
}

/**
 * Branche les listeners globaux (window.error + unhandledrejection).
 * À appeler une seule fois côté client.
 */
let installed = false;
export function installGlobalErrorCapture() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener("error", (e) => {
    captureError(e.error ?? e.message, { level: "error", source: "client" });
  });
  window.addEventListener("unhandledrejection", (e) => {
    captureError(e.reason ?? "unhandledrejection", { level: "error", source: "client" });
  });
}
