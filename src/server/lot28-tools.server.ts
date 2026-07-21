/**
 * LOT 28 — Outillage agent (parité Lovable)
 *
 *  - lint_fix         : analyse les fichiers UI (.ts/.tsx/.js/.jsx) déjà dans le vfs
 *                       et corrige automatiquement les anti-patterns courants :
 *                       imports dupliqués, `import React` inutile (JSX modern),
 *                       classes Tailwind hardcodées (text-white/bg-black/text-gray-*),
 *                       trailing whitespace. Émet des FsMutation `update`.
 *  - dependency_scan  : interroge l'API publique npm advisories pour les deps
 *                       déclarées dans `package.json` (vfs). Aucune clé requise.
 *                       Retourne un résumé des CVE high/critical.
 *  - secrets_request  : émet une demande à l'utilisateur d'ajouter un secret
 *                       (clé API / token) au vault Lovable Cloud. La réponse
 *                       contient le nom + raison. Le frontend affiche un CTA
 *                       qui ouvre le settings → secrets.
 */
import type { ToolResult, FsMutation } from "./agent-tools.server";

export const LOT28_TOOL_SCHEMAS = [
  {
    type: "function",
    function: {
      name: "lint_fix",
      description:
        "Auto-fix lint sur les fichiers UI (.ts/.tsx/.js/.jsx) du vfs. Corrige : imports dupliqués, `import React from 'react'` inutile (JSX runtime moderne), classes Tailwind hardcodées interdites (`text-white`, `bg-black`, `text-gray-*` → flag), trailing whitespace. Retourne la liste des fichiers modifiés + warnings non auto-fixables. À appeler APRÈS write_file/line_replace, AVANT build_check.",
      parameters: {
        type: "object",
        properties: {
          files: {
            type: "array",
            items: { type: "string" },
            description:
              "Optionnel : liste de chemins à scanner. Si vide, scanne tous les .ts/.tsx/.js/.jsx du vfs.",
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "dependency_scan",
      description:
        "Scanne les dépendances de `package.json` (du vfs) pour vulnérabilités npm (API publique npm registry advisories). Retourne les CVE high/critical avec versions affectées + fix recommandé. Aucune clé API requise. À appeler avant publish ou si l'utilisateur demande un audit sécurité.",
      parameters: {
        type: "object",
        properties: {
          severity: {
            type: "string",
            enum: ["all", "high", "critical"],
            description: "Filtre par sévérité (défaut: high).",
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "secrets_request",
      description:
        "Demande à l'utilisateur d'ajouter un secret (clé API, token) au vault Lovable Cloud. À appeler quand une fonctionnalité nécessite une clé externe que tu ne peux pas obtenir autrement (ex: SENDGRID_API_KEY pour envoi mail, OPENAI_API_KEY pour modèle BYOK). Le frontend affiche un CTA d'ajout. NE PAS utiliser pour les clés déjà gérées par les intégrations (Stripe, Supabase…).",
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "Nom du secret en SCREAMING_SNAKE_CASE (ex: SENDGRID_API_KEY).",
          },
          reason: {
            type: "string",
            description: "Pourquoi ce secret est nécessaire (1 phrase claire pour l'utilisateur).",
          },
          docs_url: {
            type: "string",
            description: "Optionnel : URL où obtenir la clé.",
          },
        },
        required: ["name", "reason"],
        additionalProperties: false,
      },
    },
  },
] as const;

// ---------- lint_fix ----------

const HARDCODED_COLOR_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\b(?:text|bg|border|ring)-white\b/g, label: "text-white/bg-white (utilise tokens sémantiques)" },
  { pattern: /\b(?:text|bg|border|ring)-black\b/g, label: "text-black/bg-black (utilise tokens sémantiques)" },
  { pattern: /\b(?:text|bg|border|ring)-gray-\d+\b/g, label: "text-gray-* (utilise muted/foreground tokens)" },
  { pattern: /\b(?:text|bg|border|ring)-slate-\d+\b/g, label: "slate-* (utilise tokens sémantiques)" },
];

function fixFileContent(path: string, src: string): { content: string; changed: boolean; warnings: string[] } {
  const warnings: string[] = [];
  let out = src;

  // 1) Imports dupliqués (même module importé deux fois consécutivement).
  const lines = out.split("\n");
  const seenImports = new Set<string>();
  const filtered: string[] = [];
  for (const line of lines) {
    const m = line.match(/^\s*import\s+.+?\s+from\s+["']([^"']+)["'];?\s*$/);
    if (m) {
      const key = line.trim();
      if (seenImports.has(key)) continue;
      seenImports.add(key);
    }
    filtered.push(line);
  }
  out = filtered.join("\n");

  // 2) `import React from "react"` inutile en JSX runtime moderne (sauf si React.* utilisé).
  if (/^\s*import\s+React\s+from\s+["']react["'];?\s*$/m.test(out)) {
    const usesReactNs = /\bReact\.[A-Za-z]/.test(out);
    if (!usesReactNs) {
      out = out.replace(/^\s*import\s+React\s+from\s+["']react["'];?\s*\n/m, "");
    }
  }

  // 3) Trailing whitespace.
  out = out.replace(/[ \t]+$/gm, "");

  // 4) Hardcoded colors → warning seulement (auto-fix risqué, on n'écrase pas).
  for (const { pattern, label } of HARDCODED_COLOR_PATTERNS) {
    const hits = out.match(pattern);
    if (hits && hits.length > 0) {
      warnings.push(`${path}: ${hits.length}× ${label}`);
    }
  }

  return { content: out, changed: out !== src, warnings };
}

interface LintFixArgs {
  files?: string[];
}

async function runLintFix(
  args: LintFixArgs,
  vfs: Map<string, string>,
  mutations: FsMutation[],
): Promise<ToolResult> {
  if (!vfs || vfs.size === 0) return { ok: false, output: "lint_fix: vfs vide." };
  const requested = Array.isArray(args.files) ? args.files.filter((f): f is string => typeof f === "string") : [];
  const targets: string[] = [];
  if (requested.length > 0) {
    for (const f of requested) if (vfs.has(f) && /\.(tsx?|jsx?)$/.test(f)) targets.push(f);
  } else {
    for (const path of vfs.keys()) if (/\.(tsx?|jsx?)$/.test(path)) targets.push(path);
  }
  if (targets.length === 0) return { ok: true, output: "lint_fix: aucun fichier .ts/.tsx/.js/.jsx à scanner." };

  let fixedCount = 0;
  const allWarnings: string[] = [];
  const fixedFiles: string[] = [];
  for (const path of targets) {
    const src = vfs.get(path) ?? "";
    const { content, changed, warnings } = fixFileContent(path, src);
    if (warnings.length > 0) allWarnings.push(...warnings);
    if (changed) {
      vfs.set(path, content);
      mutations.push({ op: "write", path, content });
      fixedFiles.push(path);
      fixedCount++;
    }
  }

  const lines: string[] = [
    `🧹 lint_fix : ${targets.length} fichier(s) scanné(s), ${fixedCount} corrigé(s) automatiquement.`,
  ];
  if (fixedFiles.length > 0) lines.push(`Corrigés : ${fixedFiles.slice(0, 20).join(", ")}`);
  if (allWarnings.length > 0) {
    lines.push(`⚠️ Warnings non auto-fixables (à traiter manuellement) :`);
    lines.push(...allWarnings.slice(0, 15).map((w) => `  - ${w}`));
    if (allWarnings.length > 15) lines.push(`  … et ${allWarnings.length - 15} autres`);
  }
  return { ok: true, output: lines.join("\n") };
}

// ---------- dependency_scan ----------

interface DependencyScanArgs {
  severity?: "all" | "high" | "critical";
}

interface NpmAdvisory {
  severity?: string;
  title?: string;
  vulnerable_versions?: string;
  patched_versions?: string;
  url?: string;
}

async function runDependencyScan(
  args: DependencyScanArgs,
  vfs: Map<string, string>,
): Promise<ToolResult> {
  if (!vfs) return { ok: false, output: "dependency_scan: vfs requis." };
  const pkgRaw = vfs.get("package.json");
  if (!pkgRaw) return { ok: false, output: "dependency_scan: package.json absent du vfs." };
  let pkg: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
  try {
    pkg = JSON.parse(pkgRaw);
  } catch {
    return { ok: false, output: "dependency_scan: package.json invalide." };
  }
  const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
  const names = Object.keys(deps);
  if (names.length === 0) return { ok: true, output: "dependency_scan: aucune dépendance déclarée." };

  // npm advisories bulk endpoint accepte un body { name: [versions] }
  const payload: Record<string, string[]> = {};
  for (const name of names) {
    const ver = deps[name].replace(/^[\^~>=<\s]+/, "");
    payload[name] = [ver || "0.0.0"];
  }

  let advisories: Record<string, NpmAdvisory[]> = {};
  try {
    const res = await fetch("https://registry.npmjs.org/-/npm/v1/security/advisories/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      return { ok: false, output: `dependency_scan: npm registry HTTP ${res.status}` };
    }
    advisories = (await res.json()) as Record<string, NpmAdvisory[]>;
  } catch (e) {
    return { ok: false, output: `dependency_scan: ${e instanceof Error ? e.message : "réseau"}` };
  }

  const severityFilter = args.severity ?? "high";
  const allowed =
    severityFilter === "critical"
      ? new Set(["critical"])
      : severityFilter === "high"
        ? new Set(["critical", "high"])
        : new Set(["critical", "high", "moderate", "low", "info"]);

  const findings: string[] = [];
  let totalCount = 0;
  for (const [pkgName, advs] of Object.entries(advisories)) {
    if (!Array.isArray(advs)) continue;
    for (const a of advs) {
      if (!allowed.has((a.severity ?? "").toLowerCase())) continue;
      totalCount++;
      findings.push(
        `  - [${a.severity}] ${pkgName} (${deps[pkgName]}) — ${a.title ?? "?"}\n` +
          `      vulnérable: ${a.vulnerable_versions ?? "?"} | fix: ${a.patched_versions ?? "?"}`,
      );
    }
  }

  if (totalCount === 0) {
    return {
      ok: true,
      output: `🛡️ dependency_scan : ${names.length} dep(s) scannées, aucune CVE ${severityFilter}+ trouvée.`,
    };
  }
  return {
    ok: true,
    output:
      `🛡️ dependency_scan : ${totalCount} CVE ${severityFilter}+ trouvée(s) sur ${names.length} dep(s).\n` +
      findings.slice(0, 20).join("\n") +
      (findings.length > 20 ? `\n  … et ${findings.length - 20} autres` : ""),
  };
}

// ---------- secrets_request ----------

interface SecretsRequestArgs {
  name?: string;
  reason?: string;
  docs_url?: string;
}

function runSecretsRequest(args: SecretsRequestArgs): ToolResult {
  const name = String(args.name ?? "").trim();
  const reason = String(args.reason ?? "").trim();
  const docsUrl = args.docs_url ? String(args.docs_url).trim() : "";

  if (!/^[A-Z][A-Z0-9_]{2,63}$/.test(name)) {
    return {
      ok: false,
      output: "secrets_request: 'name' doit être en SCREAMING_SNAKE_CASE (ex: SENDGRID_API_KEY).",
    };
  }
  if (reason.length < 10) {
    return { ok: false, output: "secrets_request: 'reason' doit expliquer pourquoi en au moins 10 caractères." };
  }

  // Le frontend lit ce payload via le tool_end et affiche un CTA "Ajouter SECRET_X".
  const payload = {
    type: "secret_request" as const,
    name,
    reason,
    docs_url: docsUrl || null,
  };
  return {
    ok: true,
    output:
      `🔑 Demande de secret envoyée à l'utilisateur : ${name}\n` +
      `Raison : ${reason}\n` +
      (docsUrl ? `Doc : ${docsUrl}\n` : "") +
      `\nL'utilisateur doit ajouter ce secret dans Réglages → Secrets.\n` +
      `__SECRET_REQUEST_PAYLOAD__=${JSON.stringify(payload)}`,
  };
}

// ---------- entrypoint ----------

export async function executeLot28Tool(
  name: string,
  rawArgs: Record<string, unknown>,
  vfs: Map<string, string>,
  mutations: FsMutation[],
): Promise<ToolResult | null> {
  if (name === "lint_fix") return runLintFix(rawArgs as LintFixArgs, vfs, mutations);
  if (name === "dependency_scan") return runDependencyScan(rawArgs as DependencyScanArgs, vfs);
  if (name === "secrets_request") return runSecretsRequest(rawArgs as SecretsRequestArgs);
  return null;
}
