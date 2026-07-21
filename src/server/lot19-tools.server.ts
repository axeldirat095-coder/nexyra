/**
 * LOT 19+20+21 — Test Suite Elena
 *
 * Tools exposés à Elena :
 *   - test_generate_playwright : génère des specs Playwright dans le VFS du projet
 *     (routes détectées → tests smoke/navigation). Pas d'exécution réelle (Worker
 *     runtime ne supporte pas spawn), mais les fichiers sont prêts à `npx playwright test`
 *     en local / CI.
 *   - test_golden_path : exécute un parcours synthétique sur la preview sandbox via
 *     les logs réseau capturés (LOT 18). Retourne PASS/FAIL par étape.
 */
import type { ToolResult, FsMutation } from "./agent-tools.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = any;

export const LOT19_TOOL_SCHEMAS = [
  {
    type: "function",
    function: {
      name: "test_generate_playwright",
      description:
        "Génère des specs Playwright (smoke tests + navigation) dans tests/e2e/ du projet à partir des routes détectées. Crée aussi playwright.config.ts si absent. N'exécute rien — fichiers prêts pour `npx playwright test`.",
      parameters: {
        type: "object",
        properties: {
          base_url: { type: "string", description: "URL de base à tester (défaut http://localhost:8080)." },
          routes: {
            type: "array",
            items: { type: "string" },
            description: "Liste de chemins à tester (ex ['/', '/about']). Si vide, auto-détecte depuis src/routes/.",
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "test_golden_path",
      description:
        "Vérifie un golden path 'créer une app from scratch' : analyse les logs réseau récents (LOT 18) pour valider que les routes critiques répondent 2xx/3xx, qu'aucune erreur JS bloquante n'apparaît, et que les requêtes Supabase ne sont pas en 401/403. Retourne un rapport PASS/FAIL par check.",
      parameters: {
        type: "object",
        properties: {
          project_id: { type: "string" },
          since_minutes: { type: "number", description: "Fenêtre d'analyse en minutes (défaut 10)." },
          required_paths: {
            type: "array",
            items: { type: "string" },
            description: "Sous-chaînes d'URL qui DOIVENT avoir été appelées avec succès (ex ['/', '/api/']).",
          },
        },
        additionalProperties: false,
      },
    },
  },
] as const;

function detectRoutes(vfs: Map<string, string>): string[] {
  const routes = new Set<string>(["/"]);
  for (const path of vfs.keys()) {
    const m = path.match(/^src\/routes\/(.+)\.tsx?$/);
    if (!m) continue;
    let r = m[1];
    if (r === "index" || r === "__root") continue;
    if (r.startsWith("api/")) continue;
    // flat dot-separated → slash
    r = r.replace(/\.index$/, "").replace(/\./g, "/");
    // dynamic params $id → :id (sera ignoré par smoke tests)
    if (r.includes("$")) continue;
    routes.add("/" + r);
  }
  return Array.from(routes).sort();
}

const PLAYWRIGHT_CONFIG = `import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  retries: 1,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:8080',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
`;

function smokeSpec(routes: string[]): string {
  const cases = routes
    .map((r) => `  test('GET ${r} renders without console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
    const resp = await page.goto('${r}');
    expect(resp?.status() ?? 0, 'http status').toBeLessThan(400);
    await expect(page.locator('body')).toBeVisible();
    expect(errors.filter(e => !e.includes('favicon')), 'console errors').toEqual([]);
  });`)
    .join("\n\n");
  return `import { test, expect } from '@playwright/test';

test.describe('Smoke — toutes les routes répondent', () => {
${cases}
});
`;
}

const GOLDEN_PATH_SPEC = `import { test, expect } from '@playwright/test';

test('Golden path — landing → navigation principale', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/.+/);
  // Vérifie qu'au moins un lien de navigation interne est cliquable
  const internalLinks = page.locator('a[href^="/"]');
  const count = await internalLinks.count();
  expect(count, 'liens internes présents').toBeGreaterThan(0);
});
`;

export async function executeLot19Tool(
  name: string,
  rawArgs: Record<string, unknown>,
  vfs: Map<string, string>,
  localMutations: FsMutation[],
  supabaseClient: unknown,
  userId: string,
): Promise<ToolResult | null> {
  if (name === "test_generate_playwright") {
    const explicit = Array.isArray(rawArgs.routes) ? (rawArgs.routes as string[]).filter(Boolean) : [];
    const routes = explicit.length > 0 ? explicit : detectRoutes(vfs);
    const writes: Array<[string, string]> = [];
    if (!vfs.has("playwright.config.ts")) writes.push(["playwright.config.ts", PLAYWRIGHT_CONFIG]);
    writes.push(["tests/e2e/smoke.spec.ts", smokeSpec(routes)]);
    writes.push(["tests/e2e/golden-path.spec.ts", GOLDEN_PATH_SPEC]);
    for (const [path, content] of writes) {
      vfs.set(path, content);
      localMutations.push({ op: "write", path, content });
    }
    return {
      ok: true,
      output: `${writes.length} fichier(s) Playwright générés (${routes.length} routes couvertes : ${routes.slice(0, 8).join(", ")}${routes.length > 8 ? "…" : ""}). Lance \`npx playwright install && npx playwright test\` localement.`,
    };
  }

  if (name === "test_golden_path") {
    if (!userId) return { ok: false, output: "test_golden_path: auth requise" };
    const sb = supabaseClient as SupabaseLike;
    const sinceMin = Math.max(1, Math.min(60, Number(rawArgs.since_minutes ?? 10)));
    const since = new Date(Date.now() - sinceMin * 60_000).toISOString();
    const required = Array.isArray(rawArgs.required_paths) ? (rawArgs.required_paths as string[]) : [];

    let q = sb
      .from("preview_network_logs")
      .select("method, url, status, error")
      .eq("owner_id", userId)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(500);
    if (rawArgs.project_id) q = q.eq("project_id", String(rawArgs.project_id));
    const { data, error } = await q;
    if (error) return { ok: false, output: `test_golden_path: ${error.message}` };

    const rows = (data ?? []) as Array<{ method: string; url: string; status: number | null; error: string | null }>;
    const total = rows.length;
    const errors = rows.filter((r) => (r.status ?? 0) >= 400 || r.error);
    const auth401 = rows.filter((r) => r.status === 401 || r.status === 403);

    const checks: Array<{ name: string; pass: boolean; detail: string }> = [];
    checks.push({ name: "Trafic capturé", pass: total > 0, detail: `${total} requête(s) sur ${sinceMin} min` });
    checks.push({ name: "Aucune erreur HTTP/JS", pass: errors.length === 0, detail: `${errors.length} erreur(s)` });
    checks.push({ name: "Pas de 401/403 Supabase", pass: auth401.length === 0, detail: `${auth401.length} unauthorized` });

    for (const path of required) {
      const hits = rows.filter((r) => r.url.includes(path));
      const ok = hits.length > 0 && hits.every((r) => (r.status ?? 0) < 400 && !r.error);
      checks.push({
        name: `Route requise « ${path} »`,
        pass: ok,
        detail: hits.length === 0 ? "jamais appelée" : `${hits.length} appel(s), ${hits.filter((h) => (h.status ?? 0) >= 400).length} en erreur`,
      });
    }

    const failed = checks.filter((c) => !c.pass);
    const lines = checks.map((c) => `${c.pass ? "✅" : "❌"} ${c.name} — ${c.detail}`);
    const verdict = failed.length === 0 ? "PASS" : `FAIL (${failed.length}/${checks.length})`;
    return {
      ok: failed.length === 0,
      output: `Golden path : ${verdict}\n${lines.join("\n")}${errors.length > 0 ? `\n\nTop erreurs :\n${errors.slice(0, 5).map((e) => `  • [${e.status ?? "ERR"}] ${e.method} ${e.url.slice(0, 100)}`).join("\n")}` : ""}`,
    };
  }

  return null;
}
