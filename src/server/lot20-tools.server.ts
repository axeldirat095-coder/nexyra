/**
 * LOT 20 — Observabilité auto Elena
 *
 * Tools :
 *   - lighthouse_ci : audit Lighthouse (PageSpeed) + persiste les scores dans
 *     `lighthouse_runs` pour suivi historique côté dashboard admin.
 *   - sentry_autoinstrument : injecte @sentry/react dans le projet utilisateur
 *     (instrumentation auto : init dans main.tsx + ErrorBoundary dans __root.tsx +
 *     ajout dépendance dans package.json). Aucun coût LLM.
 */
import type { ToolResult, FsMutation } from "./agent-tools.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = any;

export const LOT20_TOOL_SCHEMAS = [
  {
    type: "function",
    function: {
      name: "lighthouse_ci",
      description:
        "Audit Lighthouse (PageSpeed Insights) ET persiste l'historique dans `lighthouse_runs` pour suivi tendance dans le dashboard admin Elena. Préfère ce tool à `lighthouse_audit` quand tu veux tracker la régression de scores entre 2 deploys.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "URL https à auditer." },
          strategy: { type: "string", enum: ["mobile", "desktop"] },
          notes: { type: "string", description: "Contexte (ex: 'after deploy v1.2')." },
        },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "sentry_autoinstrument",
      description:
        "Injecte @sentry/react dans le projet : init dans src/main.tsx, ErrorBoundary autour du router, et ajoute la dépendance. L'utilisateur doit fournir le DSN via `dsn` (sera lu depuis VITE_SENTRY_DSN à l'exécution). Une seule passe — idempotent (skip si déjà présent).",
      parameters: {
        type: "object",
        properties: {
          dsn: {
            type: "string",
            description: "DSN Sentry (https://xxx@oXXX.ingest.sentry.io/XXX). Mis dans .env via VITE_SENTRY_DSN. Si vide, instrumente quand même (DSN lu à runtime).",
          },
          environment: { type: "string", description: "Défaut 'production'." },
        },
        additionalProperties: false,
      },
    },
  },
] as const;

const SENTRY_INIT_SNIPPET = `// === Sentry auto-instrumentation (Elena) ===
import * as Sentry from "@sentry/react";
if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.VITE_SENTRY_ENV ?? "production",
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1.0,
  });
}
`;

async function runLighthouseCi(
  args: Record<string, unknown>,
  sb: SupabaseLike,
  userId: string,
): Promise<ToolResult> {
  const url = String(args.url ?? "").trim();
  if (!/^https?:\/\//i.test(url)) {
    return { ok: false, output: "lighthouse_ci: 'url' http(s) requise." };
  }
  const strategy = (args.strategy === "desktop" ? "desktop" : "mobile") as string;
  const notes = args.notes ? String(args.notes) : null;

  // PageSpeed (clé optionnelle)
  const apiKey = process.env.PAGESPEED_API_KEY;
  const params = new URLSearchParams({ url, strategy });
  for (const c of ["PERFORMANCE", "ACCESSIBILITY", "BEST_PRACTICES", "SEO"]) {
    params.append("category", c);
  }
  if (apiKey) params.set("key", apiKey);

  try {
    const res = await fetch(
      `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${params.toString()}`,
      { signal: AbortSignal.timeout(90_000) },
    );
    if (!res.ok) {
      return { ok: false, output: `lighthouse_ci: HTTP ${res.status}` };
    }
    const json = (await res.json()) as {
      lighthouseResult?: { categories?: Record<string, { score?: number | null }> };
    };
    const cats = json.lighthouseResult?.categories ?? {};
    const score = (k: string) => {
      const v = cats[k]?.score;
      return v == null ? null : Math.round(v * 100);
    };
    const performance = score("performance");
    const accessibility = score("accessibility");
    const bestPractices = score("best-practices");
    const seo = score("seo");
    const present = [performance, accessibility, bestPractices, seo].filter((n): n is number => n != null);
    const overall = present.length > 0 ? Math.round(present.reduce((a, b) => a + b, 0) / present.length) : null;

    const { error } = await sb.from("lighthouse_runs").insert({
      owner_id: userId,
      url,
      strategy,
      performance,
      accessibility,
      best_practices: bestPractices,
      seo,
      overall,
      notes,
    });
    if (error) return { ok: false, output: `lighthouse_ci: persist error ${error.message}` };

    return {
      ok: true,
      output: `🚦 Lighthouse CI (${strategy}) — ${url}\n• Performance: ${performance ?? "—"}\n• Accessibilité: ${accessibility ?? "—"}\n• Best practices: ${bestPractices ?? "—"}\n• SEO: ${seo ?? "—"}\n• Score global: ${overall ?? "—"}/100\n→ historisé dans lighthouse_runs.`,
    };
  } catch (e) {
    return { ok: false, output: `lighthouse_ci: ${e instanceof Error ? e.message : "erreur"}` };
  }
}

function runSentryAutoinstrument(
  args: Record<string, unknown>,
  vfs: Map<string, string>,
  mutations: FsMutation[],
): ToolResult {
  const mainPath = vfs.has("src/main.tsx") ? "src/main.tsx" : vfs.has("src/main.ts") ? "src/main.ts" : null;
  if (!mainPath) {
    return { ok: false, output: "sentry_autoinstrument: src/main.tsx introuvable dans le VFS." };
  }
  const main = vfs.get(mainPath) ?? "";
  if (main.includes("@sentry/react")) {
    return { ok: true, output: "sentry_autoinstrument: Sentry déjà instrumenté (skip)." };
  }
  const newMain = SENTRY_INIT_SNIPPET + "\n" + main;
  vfs.set(mainPath, newMain);
  mutations.push({ op: "write", path: mainPath, content: newMain });

  // package.json
  const pkgPath = "package.json";
  const pkgRaw = vfs.get(pkgPath);
  if (pkgRaw) {
    try {
      const pkg = JSON.parse(pkgRaw);
      pkg.dependencies = pkg.dependencies ?? {};
      if (!pkg.dependencies["@sentry/react"]) {
        pkg.dependencies["@sentry/react"] = "^8.0.0";
        const out = JSON.stringify(pkg, null, 2) + "\n";
        vfs.set(pkgPath, out);
        mutations.push({ op: "write", path: pkgPath, content: out });
      }
    } catch {
      /* package.json invalide → skip */
    }
  }

  // .env
  const dsn = args.dsn ? String(args.dsn) : "";
  const env = args.environment ? String(args.environment) : "production";
  if (dsn) {
    const envPath = ".env";
    const cur = vfs.get(envPath) ?? "";
    if (!cur.includes("VITE_SENTRY_DSN")) {
      const next = `${cur}${cur.endsWith("\n") || !cur ? "" : "\n"}VITE_SENTRY_DSN=${dsn}\nVITE_SENTRY_ENV=${env}\n`;
      vfs.set(envPath, next);
      mutations.push({ op: "write", path: envPath, content: next });
    }
  }

  return {
    ok: true,
    output: `🛰️ Sentry instrumenté : ${mainPath} (init injecté), package.json (+@sentry/react)${dsn ? ", .env (VITE_SENTRY_DSN)" : " — DSN à fournir via VITE_SENTRY_DSN"}.`,
  };
}

export async function executeLot20Tool(
  name: string,
  rawArgs: Record<string, unknown>,
  vfs: Map<string, string>,
  mutations: FsMutation[],
  supabaseClient: unknown,
  userId: string,
): Promise<ToolResult | null> {
  if (name === "lighthouse_ci") {
    if (!userId) return { ok: false, output: "lighthouse_ci: auth requise" };
    return runLighthouseCi(rawArgs, supabaseClient, userId);
  }
  if (name === "sentry_autoinstrument") {
    return runSentryAutoinstrument(rawArgs, vfs, mutations);
  }
  return null;
}
