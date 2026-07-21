/**
 * Workspace tools — bus client qui expose les opérations FS / process du
 * WebContainer à l'agent Elena V3.
 *
 * Le `WorkspaceProvider` enregistre un handle (registerWorkspaceHandle) que
 * ce module utilise pour exécuter les tool-calls remontés par l'agent serveur.
 *
 * Schémas Zod partagés avec le serveur (cf. /api/elena-workspace).
 */
import { z } from "zod";
import { capturePixelSnapshot, capturePixelScreenshot } from "./preview-bridge";
import { supabase } from "@/integrations/supabase/client";

export const workspaceToolSchemas = {
  read_file: z.object({
    path: z.string().describe("Chemin relatif au projet, ex: 'src/App.tsx'"),
    start_line: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe("Numéro de ligne de début (1-indexé) pour lecture partielle."),
    end_line: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe("Numéro de ligne de fin (inclusif). Combine avec start_line."),
  }),
  write_file: z.object({
    path: z.string(),
    contents: z.string().describe("Contenu complet du fichier (UTF-8)."),
  }),
  edit_file: z.object({
    path: z.string(),
    search: z.string().describe("Bloc exact à remplacer (search-replace, pas de regex)."),
    replace: z.string().describe("Bloc de remplacement."),
  }),
  delete_file: z.object({
    path: z.string().describe("Chemin du fichier à supprimer."),
  }),
  rename_file: z.object({
    path: z.string().describe("Chemin source."),
    new_path: z.string().describe("Nouveau chemin (incluant nom de fichier)."),
  }),
  mkdir: z.object({
    path: z.string().describe("Dossier à créer (récursif)."),
  }),
  add_dependency: z.object({
    name: z.string().describe("Nom du package npm, ex: 'zod'."),
    version: z.string().optional().describe("Version semver (par défaut: latest)."),
    dev: z.boolean().default(false).describe("true = devDependencies."),
  }),
  ls: z.object({
    path: z.string().default(".").describe("Dossier à lister, ex: 'src'"),
    detailed: z
      .boolean()
      .default(false)
      .describe("Si true, retourne {name,type} (file/dir) au lieu de noms bruts."),
  }),
  run_command: z.object({
    cmd: z.enum(["npm", "npx", "node", "ls", "cat"]),
    args: z.array(z.string()).default([]),
    capture: z
      .boolean()
      .default(true)
      .describe("Si true, capture stdout/stderr (recommandé pour debug)."),
  }),
  read_logs: z.object({
    tail: z.number().int().min(1).max(500).default(100),
  }),
  build_check: z.object({
    /** Si true, lance `npm run build` (vérif TS+Vite). Sinon relit juste les logs HMR. */
    full: z.boolean().default(false),
  }),
  capture_pixel: z.object({
    timeout_ms: z.number().int().min(500).max(8000).default(3000),
  }),
  screenshot_raw: z.object({
    timeout_ms: z.number().int().min(500).max(15000).default(5000),
    max_width: z.number().int().min(320).max(1600).default(1024),
  }),
  qa_visual_pixel: z.object({
    design_brief: z
      .string()
      .min(3)
      .describe("Brief design d'origine (ce que l'user veut, ambiance, contraintes)."),
    context: z
      .string()
      .optional()
      .describe("Contexte court (page concernée, contraintes secteur). Optionnel."),
    timeout_ms: z.number().int().min(2000).max(15000).default(8000),
    max_width: z.number().int().min(640).max(1600).default(1024),
  }),
} as const;

export type WorkspaceToolName = keyof typeof workspaceToolSchemas;

export type WorkspaceHandle = {
  readFile: (path: string) => Promise<string>;
  writeFile: (path: string, contents: string) => Promise<void>;
  deleteFile: (path: string) => Promise<void>;
  ls: (path: string) => Promise<string[]>;
  lsDetailed: (path: string) => Promise<{ name: string; type: "file" | "dir" }[]>;
  mkdir: (path: string) => Promise<void>;
  renameFile: (from: string, to: string) => Promise<void>;
  run: (cmd: string, args: string[]) => Promise<{ exit: number }>;
  runCapture: (
    cmd: string,
    args: string[],
    maxBytes?: number,
  ) => Promise<{ exit: number; stdout: string; truncated: boolean }>;
  getLogs: () => { kind: string; line: string }[];
};

let handle: WorkspaceHandle | null = null;
export function registerWorkspaceHandle(h: WorkspaceHandle | null) {
  handle = h;
}

function need(): WorkspaceHandle {
  if (!handle) throw new Error("Workspace not ready (WebContainer not booted yet)");
  return handle;
}

/** Execute a tool call coming from the server agent. Returns serializable result. */
export async function executeWorkspaceTool(
  name: WorkspaceToolName,
  rawArgs: unknown,
): Promise<unknown> {
  const h = need();
  const schema = workspaceToolSchemas[name];
  const args = schema.parse(rawArgs ?? {}) as Record<string, unknown>;

  // ─── Garde-fous index.css (Tailwind v4 + tokens shadcn) ───────────────────
  // Cause connue de "rendu HTML brut" : Elena casse @import "tailwindcss" ou
  // un token critique en éditant src/index.css en search-replace. On refuse
  // toute édition partielle, et on valide les write complets.
  const CRITICAL_CSS = "src/index.css";
  const REQUIRED_TOKENS = [
    "--color-background",
    "--color-foreground",
    "--color-primary",
    "--color-accent",
    "--color-border",
    "--color-card",
    "--color-muted",
    "--color-ring",
  ];
  if (name === "edit_file" && (args.path as string) === CRITICAL_CSS) {
    return {
      ok: false,
      error:
        "edit_file interdit sur src/index.css (risque de casser Tailwind). Utilise write_file avec le fichier COMPLET incluant `@import \"tailwindcss\";` + tous les tokens shadcn (background, foreground, primary, accent, border, card, muted, ring).",
    };
  }
  if (name === "write_file" && (args.path as string) === CRITICAL_CSS) {
    const c = String(args.contents ?? "");
    if (!/@import\s+["']tailwindcss["']/.test(c)) {
      return {
        ok: false,
        error: "src/index.css doit commencer par `@import \"tailwindcss\";` (sinon Tailwind ne charge plus, rendu HTML brut).",
      };
    }
    const missing = REQUIRED_TOKENS.filter((t) => !c.includes(t));
    if (missing.length > 0) {
      return {
        ok: false,
        error: `src/index.css doit définir tous les tokens shadcn dans @theme. Manquants: ${missing.join(", ")}.`,
      };
    }
  }

  switch (name) {
    case "read_file": {
      const path = args.path as string;
      let content: string;
      try {
        content = await h.readFile(path);
      } catch (e) {
        return { ok: false, error: `read_file: fichier introuvable — ${path} (${e instanceof Error ? e.message : String(e)})` };
      }
      const startLine = args.start_line as number | undefined;
      const endLine = args.end_line as number | undefined;
      if (startLine || endLine) {
        const lines = content.split("\n");
        const s = Math.max(0, (startLine ?? 1) - 1);
        const e = Math.min(lines.length, endLine ?? lines.length);
        const slice = lines.slice(s, e).join("\n");
        return { ok: true, path, content: slice, range: { start: s + 1, end: e, total: lines.length } };
      }
      return { ok: true, path, content };
    }
    case "write_file": {
      await h.writeFile(args.path as string, args.contents as string);
      return { ok: true, path: args.path, bytes: (args.contents as string).length };
    }
    case "edit_file": {
      const path = args.path as string;
      const search = args.search as string;
      const replace = args.replace as string;
      let current: string;
      try {
        current = await h.readFile(path);
      } catch (e) {
        return { ok: false, error: `edit_file: fichier introuvable — ${path} (${e instanceof Error ? e.message : String(e)})` };
      }
      const idx = current.indexOf(search);
      if (idx === -1) {
        return {
          ok: false,
          error: `search bloc introuvable dans ${path}. Lis le fichier avant d'éditer.`,
        };
      }
      if (current.indexOf(search, idx + 1) !== -1) {
        return {
          ok: false,
          error: `search bloc ambigu (plusieurs occurrences) dans ${path}. Étends le contexte.`,
        };
      }
      const next = current.slice(0, idx) + replace + current.slice(idx + search.length);
      await h.writeFile(path, next);
      return { ok: true, path, replaced: search.length, with: replace.length };
    }
    case "delete_file": {
      const path = args.path as string;
      await h.deleteFile(path);
      return { ok: true, path, deleted: true };
    }
    case "rename_file": {
      const from = args.path as string;
      const to = args.new_path as string;
      try {
        await h.renameFile(from, to);
        return { ok: true, from, to };
      } catch (e) {
        return { ok: false, error: `rename_file: ${e instanceof Error ? e.message : String(e)}` };
      }
    }
    case "mkdir": {
      const path = args.path as string;
      try {
        await h.mkdir(path);
        return { ok: true, path };
      } catch (e) {
        return { ok: false, error: `mkdir: ${e instanceof Error ? e.message : String(e)}` };
      }
    }
    case "add_dependency": {
      const depName = args.name as string;
      const depVersion = (args.version as string | undefined) ?? "latest";
      const isDev = (args.dev as boolean | undefined) ?? false;
      try {
        const pkgRaw = await h.readFile("package.json");
        const pkg = JSON.parse(pkgRaw) as {
          dependencies?: Record<string, string>;
          devDependencies?: Record<string, string>;
        };
        const key = isDev ? "devDependencies" : "dependencies";
        pkg[key] = { ...(pkg[key] ?? {}), [depName]: depVersion };
        await h.writeFile("package.json", JSON.stringify(pkg, null, 2) + "\n");
        // Install immédiat pour que la prochaine commande voie le module
        const installRes = await h.runCapture("npm", ["install", "--no-audit", "--no-fund"], 8000);
        return {
          ok: installRes.exit === 0,
          name: depName,
          version: depVersion,
          dev: isDev,
          install_exit: installRes.exit,
          install_stdout_tail: installRes.stdout.slice(-2000),
        };
      } catch (e) {
        return { ok: false, error: `add_dependency: ${e instanceof Error ? e.message : String(e)}` };
      }
    }
    case "ls": {
      const path = (args.path as string) ?? ".";
      const detailed = (args.detailed as boolean | undefined) ?? false;
      if (detailed) {
        const entries = await h.lsDetailed(path);
        return { ok: true, path, entries };
      }
      const entries = await h.ls(path);
      return { ok: true, path, entries };
    }
    case "run_command": {
      const cmd = args.cmd as string;
      const cmdArgs = (args.args as string[]) ?? [];
      const capture = (args.capture as boolean | undefined) ?? true;
      if (capture) {
        const { exit, stdout, truncated } = await h.runCapture(cmd, cmdArgs);
        return {
          ok: exit === 0,
          cmd,
          args: cmdArgs,
          exit,
          stdout: stdout.slice(-8000),
          stdout_truncated: truncated,
        };
      }
      const { exit } = await h.run(cmd, cmdArgs);
      return { ok: exit === 0, cmd, args: cmdArgs, exit };
    }
    case "read_logs": {
      const tail = (args.tail as number) ?? 100;
      const all = h.getLogs();
      return { ok: true, lines: all.slice(-tail) };
    }
    case "build_check": {
      const full = (args.full as boolean) ?? false;
      if (full) {
        const { exit } = await h.run("npm", ["run", "build"]);
        const all = h.getLogs();
        const errors = all
          .filter((l) => l.kind === "err" || /error/i.test(l.line))
          .slice(-30);
        return { ok: exit === 0, exit, errors };
      }
      // Lecture rapide HMR : isole les lignes contenant "error"
      const all = h.getLogs();
      const errors = all.filter((l) => l.kind === "err" || /error/i.test(l.line)).slice(-30);
      return { ok: errors.length === 0, errors };
    }
    case "capture_pixel": {
      const timeout = (args.timeout_ms as number) ?? 3000;
      try {
        const snap = await capturePixelSnapshot(timeout);
        return { ok: true, snapshot: snap };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    }
    case "screenshot_raw": {
      const timeout = (args.timeout_ms as number) ?? 5000;
      const maxWidth = (args.max_width as number) ?? 1024;
      try {
        const { screenshot, snapshot } = await capturePixelScreenshot(timeout, maxWidth);
        return {
          ok: true,
          width: screenshot.width,
          height: screenshot.height,
          mime: "image/jpeg",
          // dataUrl complet (image/jpeg;base64,...) — l'agent peut le passer à un model vision
          data_url: screenshot.dataUrl,
          snapshot_summary: {
            url: snapshot.url,
            title: snapshot.title,
            counts: snapshot.counts,
            console_errors: snapshot.consoleErrors.length,
          },
        };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    }
    case "qa_visual_pixel": {
      const designBrief = args.design_brief as string;
      const context = args.context as string | undefined;
      const timeout = (args.timeout_ms as number) ?? 8000;
      const maxWidth = (args.max_width as number) ?? 1024;
      try {
        const { screenshot, snapshot } = await capturePixelScreenshot(timeout, maxWidth);
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) {
          return { ok: false, error: "Session expirée — reconnecte-toi puis relance le QA visuel pixel." };
        }
        const res = await fetch("/api/elena-qa-visual-pixel", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            image_base64: screenshot.dataUrl,
            design_brief: designBrief,
            context,
          }),
        });
        if (!res.ok) {
          const body = await res.text().catch(() => "");
          return {
            ok: false,
            error: `qa_visual_pixel ${res.status}: ${body.slice(0, 240)}`,
          };
        }
        const json = (await res.json()) as {
          ok: boolean;
          verdict?: "OK" | "FIX" | "REFAIRE";
          critique?: string;
          model?: string;
          error?: string;
        };
        if (!json.ok) return { ok: false, error: json.error ?? "QA visuel pixel a échoué." };
        return {
          ok: true,
          verdict: json.verdict,
          critique: json.critique,
          model: json.model,
          screenshot: { width: screenshot.width, height: screenshot.height },
          snapshot_summary: {
            url: snapshot.url,
            title: snapshot.title,
            counts: snapshot.counts,
            viewport: snapshot.viewport,
            console_errors: snapshot.consoleErrors.length,
          },
        };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    }
  }
}
