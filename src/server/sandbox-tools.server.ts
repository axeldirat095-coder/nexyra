/**
 * LOT 6 — Sandbox / Browser / Long-term memory tools for Elena.
 *
 *  - code_execute     : exécution Python/Node arbitraire dans une sandbox E2B
 *                       (clé `e2b_api_key`). Idéal pour data analysis, scripts,
 *                       prototypes que l'agent veut "essayer" avant d'écrire du code.
 *  - browser_automate : Playwright managé via Browserbase (clés `browserbase_api_key`
 *                       + `browserbase_project_id`). Capture screenshot + extrait
 *                       texte / liens depuis une URL avec actions optionnelles.
 *  - memory_remember  : stocke un souvenir long-terme dans Mem0 (clé `mem0_api_key`)
 *                       attaché à l'utilisateur. Persiste entre sessions/projets.
 *  - memory_recall    : recherche sémantique dans Mem0 (top-k souvenirs pertinents).
 *
 *  100 % worker-safe : fetch + JSON, pas de binaires natifs ni filesystem.
 *  BYOK strict — aucune clé Lovable utilisée ici.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { ToolName, ToolResult } from "./agent-tools.server";

const SANDBOX_TOOLS: ReadonlySet<ToolName> = new Set<ToolName>([
  "code_execute",
  "browser_automate",
  "memory_remember",
  "memory_recall",
]);

export function isSandboxTool(name: string): boolean {
  return SANDBOX_TOOLS.has(name as ToolName);
}

async function fetchUserKey(
  supabase: SupabaseClient<Database>,
  userId: string,
  service: string,
): Promise<string | null> {
  const { data } = await supabase.rpc("get_external_key_decrypted", {
    _owner_id: userId,
    _service: service,
  });
  return typeof data === "string" && data.length > 0 ? data : null;
}

function markUsed(
  supabase: SupabaseClient<Database>,
  userId: string,
  service: string,
): void {
  void supabase
    .rpc("mark_external_key_used", { _owner_id: userId, _service: service })
    .then(() => undefined);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------- code_execute (E2B) ----------

interface CodeExecArgs {
  code: string;
  language?: "python" | "node" | "bash";
  timeout_ms?: number;
}

async function runCodeExecute(
  args: CodeExecArgs,
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<ToolResult> {
  const code = String(args.code ?? "").trim();
  if (!code) return { ok: false, output: "code_execute: 'code' requis." };
  if (code.length > 50_000) {
    return { ok: false, output: "code_execute: code trop long (>50k chars)." };
  }
  const lang = args.language ?? "python";
  const timeout = Math.min(Math.max(args.timeout_ms ?? 30_000, 1_000), 120_000);

  const apiKey = await fetchUserKey(supabase, userId, "e2b_api_key");
  if (!apiKey) {
    return {
      ok: false,
      output: "code_execute: clé `e2b_api_key` manquante (Réglages → Clés API).",
    };
  }

  // E2B Code Interpreter REST endpoint (template `code-interpreter-v1`).
  // Spec : https://e2b.dev/docs/api-reference/sandboxes
  try {
    // 1) Crée la sandbox
    const createRes = await fetch("https://api.e2b.dev/sandboxes", {
      method: "POST",
      headers: {
        "X-API-Key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        templateID: "code-interpreter-v1",
        timeout: Math.ceil(timeout / 1000) + 30,
      }),
    });
    if (!createRes.ok) {
      const t = await createRes.text();
      return { ok: false, output: `code_execute: échec création sandbox E2B (${createRes.status}) ${t.slice(0, 300)}` };
    }
    const sandbox = (await createRes.json()) as { sandboxID: string };
    const sandboxId = sandbox.sandboxID;

    // 2) Exécute le code via le Jupyter kernel
    const execRes = await fetch(
      `https://${sandboxId}-49999.e2b.dev/execute`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          language: lang === "node" ? "javascript" : lang,
        }),
        signal: AbortSignal.timeout(timeout),
      },
    ).catch((e: unknown) => {
      throw new Error(`exec timeout / network: ${e instanceof Error ? e.message : String(e)}`);
    });

    let outputText = "";
    if (execRes.ok) {
      const result = (await execRes.json()) as {
        stdout?: string;
        stderr?: string;
        error?: { name?: string; value?: string; traceback?: string };
        results?: Array<{ text?: string }>;
      };
      const stdout = result.stdout ?? "";
      const stderr = result.stderr ?? "";
      const resultsText = (result.results ?? []).map((r) => r.text ?? "").filter(Boolean).join("\n");
      const errText = result.error
        ? `\n[ERROR ${result.error.name ?? ""}] ${result.error.value ?? ""}\n${result.error.traceback ?? ""}`
        : "";
      outputText = [stdout, resultsText, stderr, errText].filter(Boolean).join("\n").slice(0, 8_000);
    } else {
      outputText = `Exec HTTP ${execRes.status}: ${(await execRes.text()).slice(0, 500)}`;
    }

    // 3) Tue la sandbox (best effort)
    void fetch(`https://api.e2b.dev/sandboxes/${sandboxId}`, {
      method: "DELETE",
      headers: { "X-API-Key": apiKey },
    }).catch(() => undefined);

    markUsed(supabase, userId, "e2b_api_key");
    return {
      ok: true,
      output: outputText || "(aucune sortie)",
    };
  } catch (e) {
    return { ok: false, output: `code_execute: ${e instanceof Error ? e.message : "erreur"}` };
  }
}

// ---------- browser_automate (Browserbase) ----------

interface BrowserArgs {
  url: string;
  actions?: Array<
    | { type: "click"; selector: string }
    | { type: "type"; selector: string; text: string }
    | { type: "wait"; ms: number }
    | { type: "scroll"; y: number }
  >;
  extract?: "text" | "links" | "html";
  screenshot?: boolean;
}

async function runBrowserAutomate(
  args: BrowserArgs,
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<ToolResult> {
  const url = String(args.url ?? "").trim();
  if (!/^https?:\/\//i.test(url)) {
    return { ok: false, output: "browser_automate: URL http(s) requise." };
  }

  const apiKey = await fetchUserKey(supabase, userId, "browserbase_api_key");
  const projectId = await fetchUserKey(supabase, userId, "browserbase_project_id");
  if (!apiKey || !projectId) {
    return {
      ok: false,
      output: "browser_automate: clés `browserbase_api_key` et `browserbase_project_id` requises.",
    };
  }

  try {
    // 1) Crée une session Browserbase
    const sessionRes = await fetch("https://api.browserbase.com/v1/sessions", {
      method: "POST",
      headers: {
        "X-BB-API-Key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ projectId, keepAlive: false }),
    });
    if (!sessionRes.ok) {
      const t = await sessionRes.text();
      return { ok: false, output: `browser_automate: création session échouée (${sessionRes.status}) ${t.slice(0, 300)}` };
    }
    const session = (await sessionRes.json()) as { id: string; connectUrl?: string };
    const sessionId = session.id;

    // 2) Drive le navigateur via l'API Browserbase Sessions Recording / Live API.
    //    On utilise l'API "Goto + Extract" haut-niveau v1.
    //    Si Browserbase rejette nos actions, on fait un simple goto + capture.
    const driveRes = await fetch(
      `https://api.browserbase.com/v1/sessions/${sessionId}/contexts/default/scripts/run`,
      {
        method: "POST",
        headers: {
          "X-BB-API-Key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          script: buildPlaywrightScript(url, args.actions ?? [], args.extract ?? "text", args.screenshot ?? false),
        }),
        signal: AbortSignal.timeout(60_000),
      },
    ).catch(() => null);

    let scriptOutput = "";
    let screenshotUrl: string | null = null;

    if (driveRes && driveRes.ok) {
      const result = (await driveRes.json()) as {
        output?: string;
        screenshot_url?: string;
      };
      scriptOutput = (result.output ?? "").slice(0, 6_000);
      screenshotUrl = result.screenshot_url ?? null;
    } else {
      // Fallback minimal : on retourne juste l'URL et le sessionId
      scriptOutput = `(Script API non disponible — session ${sessionId} créée, navigation manuelle requise)`;
    }

    // 3) Termine la session (best effort)
    void fetch(`https://api.browserbase.com/v1/sessions/${sessionId}`, {
      method: "POST",
      headers: { "X-BB-API-Key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ status: "REQUEST_RELEASE" }),
    }).catch(() => undefined);

    markUsed(supabase, userId, "browserbase_api_key");
    let out = `🌐 ${url}\n\n${scriptOutput}`;
    if (screenshotUrl) out += `\n\n📸 Screenshot: ${screenshotUrl}`;
    return { ok: true, output: out };
  } catch (e) {
    return { ok: false, output: `browser_automate: ${e instanceof Error ? e.message : "erreur"}` };
  }
}

function buildPlaywrightScript(
  url: string,
  actions: NonNullable<BrowserArgs["actions"]>,
  extract: "text" | "links" | "html",
  screenshot: boolean,
): string {
  const lines: string[] = [
    `await page.goto(${JSON.stringify(url)}, { waitUntil: 'networkidle', timeout: 30000 });`,
  ];
  for (const a of actions.slice(0, 10)) {
    if (a.type === "click") lines.push(`await page.click(${JSON.stringify(a.selector)}, { timeout: 10000 });`);
    else if (a.type === "type") lines.push(`await page.fill(${JSON.stringify(a.selector)}, ${JSON.stringify(a.text)});`);
    else if (a.type === "wait") lines.push(`await page.waitForTimeout(${Math.min(Math.max(a.ms, 100), 10000)});`);
    else if (a.type === "scroll") lines.push(`await page.evaluate(y => window.scrollBy(0, y), ${Number(a.y) || 500});`);
  }
  if (extract === "text") {
    lines.push(`const _out = (await page.evaluate(() => document.body.innerText)).slice(0, 5000);`);
  } else if (extract === "links") {
    lines.push(`const _out = await page.evaluate(() => Array.from(document.querySelectorAll('a[href]')).slice(0, 50).map(a => a.href + ' — ' + (a.textContent||'').trim().slice(0,80)).join('\\n'));`);
  } else {
    lines.push(`const _out = (await page.content()).slice(0, 5000);`);
  }
  if (screenshot) {
    lines.push(`const _shot = await page.screenshot({ type: 'png', fullPage: false });`);
    lines.push(`return { output: _out, screenshot: _shot.toString('base64') };`);
  } else {
    lines.push(`return { output: _out };`);
  }
  return lines.join("\n");
}

// ---------- memory_remember & memory_recall (Mem0) ----------

interface MemRememberArgs {
  content: string;
  metadata?: Record<string, unknown>;
  category?: string;
}

interface MemRecallArgs {
  query: string;
  limit?: number;
}

async function runMemoryRemember(
  args: MemRememberArgs,
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<ToolResult> {
  const content = String(args.content ?? "").trim();
  if (!content) return { ok: false, output: "memory_remember: 'content' requis." };
  if (content.length > 5_000) return { ok: false, output: "memory_remember: contenu trop long (>5000)." };

  const apiKey = await fetchUserKey(supabase, userId, "mem0_api_key");
  if (!apiKey) {
    return { ok: false, output: "memory_remember: clé `mem0_api_key` manquante." };
  }

  try {
    const res = await fetch("https://api.mem0.ai/v1/memories/", {
      method: "POST",
      headers: {
        Authorization: `Token ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: [{ role: "user", content }],
        user_id: userId,
        metadata: {
          ...(args.metadata ?? {}),
          category: args.category ?? "elena_chat",
          source: "elena_agent",
        },
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      const t = await res.text();
      return { ok: false, output: `memory_remember: HTTP ${res.status} ${t.slice(0, 300)}` };
    }
    const json = (await res.json()) as { results?: Array<{ id?: string; memory?: string }> };
    const memId = json.results?.[0]?.id ?? "(no id)";
    markUsed(supabase, userId, "mem0_api_key");
    return { ok: true, output: `🧠 Souvenir enregistré (${memId}) : ${content.slice(0, 120)}…` };
  } catch (e) {
    return { ok: false, output: `memory_remember: ${e instanceof Error ? e.message : "erreur"}` };
  }
}

async function runMemoryRecall(
  args: MemRecallArgs,
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<ToolResult> {
  const query = String(args.query ?? "").trim();
  if (!query) return { ok: false, output: "memory_recall: 'query' requis." };
  const limit = Math.min(Math.max(args.limit ?? 5, 1), 20);

  const apiKey = await fetchUserKey(supabase, userId, "mem0_api_key");
  if (!apiKey) return { ok: false, output: "memory_recall: clé `mem0_api_key` manquante." };

  try {
    const res = await fetch("https://api.mem0.ai/v1/memories/search/", {
      method: "POST",
      headers: {
        Authorization: `Token ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, user_id: userId, limit }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      const t = await res.text();
      return { ok: false, output: `memory_recall: HTTP ${res.status} ${t.slice(0, 300)}` };
    }
    const json = (await res.json()) as Array<{ memory?: string; score?: number }>;
    if (!Array.isArray(json) || json.length === 0) {
      return { ok: true, output: "(aucun souvenir pertinent trouvé)" };
    }
    const formatted = json
      .slice(0, limit)
      .map((m, i) => `${i + 1}. [${(m.score ?? 0).toFixed(2)}] ${m.memory ?? ""}`)
      .join("\n");
    markUsed(supabase, userId, "mem0_api_key");
    return { ok: true, output: `🔍 ${json.length} souvenir(s) :\n${formatted}` };
  } catch (e) {
    return { ok: false, output: `memory_recall: ${e instanceof Error ? e.message : "erreur"}` };
  }
}

// ---------- entrypoint ----------

export async function executeSandboxTool(
  name: ToolName,
  rawArgs: Record<string, unknown>,
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<ToolResult | null> {
  if (!isSandboxTool(name)) return null;
  try {
    if (name === "code_execute")
      return await runCodeExecute(rawArgs as unknown as CodeExecArgs, supabase, userId);
    if (name === "browser_automate")
      return await runBrowserAutomate(rawArgs as unknown as BrowserArgs, supabase, userId);
    if (name === "memory_remember")
      return await runMemoryRemember(rawArgs as unknown as MemRememberArgs, supabase, userId);
    if (name === "memory_recall")
      return await runMemoryRecall(rawArgs as unknown as MemRecallArgs, supabase, userId);
  } catch (e) {
    return { ok: false, output: `${name}: ${e instanceof Error ? e.message : "erreur"}` };
  }
  return null;
}
