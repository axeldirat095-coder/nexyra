/**
 * Universal Connector Layer — outils Elena pour les intégrations tierces.
 *
 * 3 tools exposés au modèle :
 *   - integration_browse : liste les services du catalogue (filtres catégorie / VIP / recherche)
 *   - integration_setup  : prépare une intégration → renvoie l'URL OAuth ou demande l'API key
 *   - integration_call   : exécute une action HTTP authentifiée sur un service connecté
 *
 * Architecture :
 *   - Le catalogue (integration_catalog) est public en lecture
 *   - Chaque instance utilisateur (project_integrations) référence le catalogue
 *   - Les credentials chiffrés vivent dans integration_secrets (jamais retournés au modèle)
 *
 * Sécurité : aucun secret n'est envoyé au LLM. Les valeurs sensibles transitent
 * uniquement entre cette couche et l'API tierce.
 */

import type { ToolResult } from "./agent-tools.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// =====================================================
// SCHÉMAS OPENAI (function-calling)
// =====================================================

export const INTEGRATION_TOOLS = [
  {
    type: "function",
    function: {
      name: "integration_browse",
      description:
        "Liste les services tiers connectables disponibles dans le catalogue Nexyra (Gmail, Stripe, Notion, Slack, LinkedIn, etc.). À utiliser quand l'utilisateur veut connecter un service externe ou demande 'quels outils tu peux brancher'. Retourne nom, slug, catégorie et type d'auth pour chaque service.",
      parameters: {
        type: "object",
        properties: {
          category: {
            type: "string",
            description:
              "Filtrer par catégorie : communication, productivity, crm, payment, marketing, social, storage, analytics, calendar, email. Optionnel.",
          },
          search: {
            type: "string",
            description: "Recherche libre dans le nom ou la description (ex: 'email', 'google'). Optionnel.",
          },
          vip_only: {
            type: "boolean",
            description: "Si true, ne retourne que les 30 intégrations VIP (les plus demandées). Défaut: false.",
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "integration_setup",
      description:
        "Démarre la connexion d'une intégration tierce sur le projet courant. Pour les services OAuth (Gmail, Slack, Notion, LinkedIn…), retourne une URL d'autorisation que l'utilisateur doit ouvrir. Pour les services à clé API (Stripe, Resend, Airtable…), liste les secrets nécessaires et l'endroit où les obtenir. À utiliser dès que l'utilisateur dit 'connecte mon Gmail', 'branche Stripe', etc.",
      parameters: {
        type: "object",
        properties: {
          slug: {
            type: "string",
            description: "Identifiant unique du service dans le catalogue (ex: 'gmail', 'stripe', 'notion').",
          },
          account_label: {
            type: "string",
            description:
              "Libellé court pour distinguer plusieurs comptes du même service (ex: 'pro', 'perso'). Optionnel.",
          },
        },
        required: ["slug"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "integration_call",
      description:
        "Exécute un appel HTTP authentifié sur un service tiers déjà connecté à ce projet. Elena utilise les tokens chiffrés stockés en base — jamais besoin de demander les credentials à l'utilisateur. À utiliser pour réellement faire l'action (envoyer email, créer stripe checkout, poster sur LinkedIn…). Retourne la réponse brute du service.",
      parameters: {
        type: "object",
        properties: {
          slug: { type: "string", description: "Slug du service (ex: 'stripe', 'gmail')." },
          method: {
            type: "string",
            enum: ["GET", "POST", "PUT", "PATCH", "DELETE"],
            description: "Verbe HTTP.",
          },
          path: {
            type: "string",
            description: "Chemin relatif à api_base_url du service (ex: '/v1/customers', '/users/me/messages/send').",
          },
          body: {
            type: "object",
            description: "Corps JSON de la requête. Optionnel pour GET.",
            additionalProperties: true,
          },
          headers: {
            type: "object",
            description: "Headers additionnels (Content-Type est auto). Optionnel.",
            additionalProperties: true,
          },
        },
        required: ["slug", "method", "path"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "integration_catalog_add",
      description:
        "Ajoute un nouveau service au catalogue Nexyra (table integration_catalog). À utiliser quand l'utilisateur demande 'ajoute Calendly au catalogue', 'rajoute Typeform comme intégration possible', ou quand tu remplis le catalogue en batch. RÈGLE OBLIGATOIRE : icon_url DOIT être au format https://logo.clearbit.com/{domaine}.com et brand_color DOIT être un hex (#RRGGBB) tiré de l'identité visuelle officielle. Pas de duplicata : vérifie d'abord avec integration_browse(search:'...').",
      parameters: {
        type: "object",
        properties: {
          slug: {
            type: "string",
            description: "Identifiant unique kebab-case (ex: 'calendly', 'typeform', 'pipedrive'). Lowercase, ASCII, pas d'espaces.",
          },
          name: { type: "string", description: "Nom officiel du service (ex: 'Calendly', 'Typeform')." },
          description: {
            type: "string",
            description: "Description courte FR (1 phrase, max 200 chars) expliquant à quoi sert le service.",
          },
          category: {
            type: "string",
            enum: [
              "communication", "productivity", "crm", "payment", "marketing",
              "social", "storage", "analytics", "calendar", "email", "other",
            ],
            description: "Catégorie principale du service.",
          },
          auth_type: {
            type: "string",
            enum: ["oauth2", "api_key", "bearer", "basic"],
            description: "Type d'authentification.",
          },
          api_base_url: {
            type: "string",
            description: "URL de base de l'API REST (ex: 'https://api.calendly.com'). Sans slash final.",
          },
          oauth_authorize_url: {
            type: "string",
            description: "URL d'autorisation OAuth (requis si auth_type='oauth2').",
          },
          oauth_token_url: {
            type: "string",
            description: "URL d'échange code→token OAuth (requis si auth_type='oauth2').",
          },
          oauth_default_scopes: {
            type: "array",
            items: { type: "string" },
            description: "Liste des scopes OAuth par défaut (ex: ['user.read', 'event.read']).",
          },
          required_secrets: {
            type: "array",
            items: { type: "string" },
            description: "Noms des secrets requis (ex: ['api_key'] pour Stripe, ['client_id','client_secret'] pour OAuth).",
          },
          docs_url: { type: "string", description: "URL de la documentation officielle de l'API." },
          homepage_url: { type: "string", description: "URL de la page d'accueil du service (ex: 'https://calendly.com')." },
          icon_url: {
            type: "string",
            description: "OBLIGATOIRE — Logo via Clearbit : 'https://logo.clearbit.com/{domaine}'. Ex: 'https://logo.clearbit.com/calendly.com'.",
          },
          brand_color: {
            type: "string",
            description: "OBLIGATOIRE — Couleur de marque hex (#RRGGBB). Ex: '#006BFF' pour Calendly.",
          },
          common_actions: {
            type: "array",
            items: {
              type: "object",
              properties: {
                action: { type: "string" },
                desc: { type: "string" },
              },
              required: ["action"],
            },
            description: "2-5 actions courantes (ex: [{action:'list_events',desc:'Liste les RDV'}]).",
          },
          usage_example: {
            type: "string",
            description: "Exemple court d'usage en langage naturel (ex: 'Crée un lien de réservation pour un appel découverte').",
          },
          is_vip: {
            type: "boolean",
            description: "Marque comme intégration VIP (top 30 les plus demandées). Défaut false.",
          },
        },
        required: [
          "slug", "name", "description", "category", "auth_type",
          "icon_url", "brand_color", "required_secrets",
        ],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "call_external_api",
      description:
        "Appel HTTP universel vers N'IMPORTE QUELLE API REST publique ou privée — sans avoir besoin que le service soit dans le catalogue Nexyra. À utiliser quand : (a) le service n'est pas catalogué, (b) tu veux tester rapidement un endpoint d'une doc OpenAPI/Swagger lue avec read_url, (c) l'API est publique sans auth (RestCountries, OpenWeather sans clé, etc.). Si l'API requiert un Bearer token déjà connecté via integration_setup, passe `auth_from_slug` pour réutiliser le credential. Pour une clé inline 1-shot (test), passe `bearer_token` directement (jamais persisté). Limite : 25s, 64KB body, 256KB réponse retournée tronquée à 8KB.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "URL absolue (https://...)." },
          method: {
            type: "string",
            enum: ["GET", "POST", "PUT", "PATCH", "DELETE"],
            description: "Verbe HTTP. Défaut GET.",
          },
          body: { type: "object", description: "Corps JSON. Optionnel.", additionalProperties: true },
          headers: {
            type: "object",
            description: "Headers additionnels (NE PAS y mettre Authorization si tu utilises auth_from_slug ou bearer_token).",
            additionalProperties: true,
          },
          auth_from_slug: {
            type: "string",
            description: "Slug d'une intégration déjà connectée à ce projet — son token sera injecté en `Authorization: Bearer ...`. Optionnel.",
          },
          bearer_token: {
            type: "string",
            description: "Token Bearer inline (mode test). Évite si possible — préfère auth_from_slug pour la persistance. Optionnel.",
          },
        },
        required: ["url"],
        additionalProperties: false,
      },
    },
  },
] as const;

// =====================================================
// EXECUTOR
// =====================================================

// Le client Supabase a une API fluent complexe ; on garde un type souple côté agent
// (RLS et validations sont déjà appliquées en base).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = any;

interface CatalogRow {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: string;
  auth_type: string;
  api_base_url: string | null;
  oauth_default_scopes: string[] | null;
  required_secrets: string[];
  usage_example: string | null;
  common_actions: Array<{ action: string; desc?: string }>;
  is_vip: boolean;
  docs_url: string | null;
}

interface ProjectIntegrationRow {
  id: string;
  status: string;
  account_label: string | null;
  catalog_id: string;
  granted_scopes: string[] | null;
}

interface UISignal {
  kind: string;
  payload: Record<string, unknown>;
}

/**
 * Tronque un texte pour économiser des tokens dans la réponse au LLM.
 */
function truncate(text: string, max = 4000): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + `\n\n[…tronqué — ${text.length - max} chars supplémentaires]`;
}

export async function executeIntegrationTool(
  name: string,
  rawArgs: Record<string, unknown>,
  supabaseClient: unknown,
  projectId: string | null,
  uiSignals: UISignal[],
  origin: string,
): Promise<ToolResult | null> {
  const sb = supabaseClient as SupabaseLike;

  try {
    // -------------------------------------------------
    // integration_browse — lecture publique du catalogue
    // -------------------------------------------------
    if (name === "integration_browse") {
      const category = String(rawArgs.category ?? "").trim() || null;
      const search = String(rawArgs.search ?? "").trim() || null;
      const vipOnly = rawArgs.vip_only === true;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q = (sb.from("integration_catalog") as any).select(
        "slug, name, description, category, auth_type, is_vip, docs_url",
      );
      if (category) q = q.eq("category", category);
      if (vipOnly) q = q.eq("is_vip", true);
      if (search) q = q.ilike("name", `%${search}%`);
      q = q.order("popularity", { ascending: false }).limit(40);

      const { data, error } = (await q) as { data: CatalogRow[] | null; error: Error | null };
      if (error) return { ok: false, output: `browse: ${error.message}` };
      if (!data || data.length === 0) return { ok: true, output: "Aucune intégration trouvée." };

      const lines = data.map(
        (r) =>
          `• ${r.is_vip ? "⭐ " : ""}${r.name} (\`${r.slug}\`) — ${r.category} / ${r.auth_type} — ${r.description}`,
      );
      return {
        ok: true,
        output: `${data.length} intégration${data.length > 1 ? "s" : ""} disponible${data.length > 1 ? "s" : ""} :\n${lines.join("\n")}`,
      };
    }

    // -------------------------------------------------
    // integration_setup — prépare la connexion
    // -------------------------------------------------
    if (name === "integration_setup") {
      if (!projectId) return { ok: false, output: "integration_setup : project_id requis (ouvre un projet d'abord)." };

      const slug = String(rawArgs.slug ?? "").trim().toLowerCase();
      const accountLabel = String(rawArgs.account_label ?? "default").trim().slice(0, 60) || "default";
      if (!slug) return { ok: false, output: "Missing slug" };

      // 1. Récupère le catalogue
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: catalog, error: catErr } = await (sb.from("integration_catalog") as any)
        .select(
          "id, slug, name, description, category, auth_type, api_base_url, oauth_default_scopes, required_secrets, usage_example, common_actions, is_vip, docs_url",
        )
        .eq("slug", slug)
        .eq("is_active", true)
        .maybeSingle();

      if (catErr) return { ok: false, output: `setup: ${catErr.message}` };
      if (!catalog)
        return {
          ok: false,
          output: `Service '${slug}' introuvable dans le catalogue. Utilise integration_browse pour voir les services disponibles.`,
        };
      const cat = catalog as CatalogRow;

      // 2. Crée ou récupère l'instance project_integration
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const existing = await (sb.from("project_integrations") as any)
        .select("id, status, account_label")
        .eq("project_id", projectId)
        .eq("catalog_id", cat.id)
        .maybeSingle();

      let integrationId: string;
      if (existing.data) {
        integrationId = (existing.data as ProjectIntegrationRow).id;
      } else {
        // Récupère org_id du projet
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: proj } = await (sb.from("projects") as any)
          .select("org_id, owner_id")
          .eq("id", projectId)
          .maybeSingle();
        if (!proj) return { ok: false, output: "Projet introuvable" };
        const p = proj as { org_id: string; owner_id: string };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: created, error: insErr } = await (sb.from("project_integrations") as any)
          .insert({
            project_id: projectId,
            catalog_id: cat.id,
            owner_id: p.owner_id,
            org_id: p.org_id,
            account_label: accountLabel,
            status: "pending",
          })
          .select("id")
          .single();
        if (insErr) return { ok: false, output: `setup insert: ${insErr.message}` };
        integrationId = (created as { id: string }).id;
      }

      // 3. Selon le type d'auth, prépare la suite
      if (cat.auth_type === "oauth2") {
        const startUrl = `${origin}/api/integrations/oauth/start?integration_id=${integrationId}`;
        uiSignals.push({
          kind: "integration_setup",
          payload: {
            slug: cat.slug,
            name: cat.name,
            integration_id: integrationId,
            auth_type: "oauth2",
            authorize_url: startUrl,
            scopes: cat.oauth_default_scopes ?? [],
          },
        });
        return {
          ok: true,
          output: `🔐 ${cat.name} utilise OAuth 2.0. J'ai ouvert le flow d'autorisation pour toi.\n\nDis à l'utilisateur de cliquer sur le bouton "Connecter ${cat.name}" qui apparaît dans l'interface (URL: ${startUrl}). Une fois autorisé, l'intégration passera en statut 'active' et tu pourras appeler integration_call('${cat.slug}', ...).`,
        };
      }

      if (cat.auth_type === "api_key" || cat.auth_type === "bearer" || cat.auth_type === "basic") {
        uiSignals.push({
          kind: "integration_setup",
          payload: {
            slug: cat.slug,
            name: cat.name,
            integration_id: integrationId,
            auth_type: cat.auth_type,
            required_secrets: cat.required_secrets,
            docs_url: cat.docs_url,
          },
        });
        const secretsList = cat.required_secrets.map((s) => `\`${s}\``).join(", ");
        return {
          ok: true,
          output: `🔑 ${cat.name} utilise ${cat.auth_type}. L'utilisateur doit fournir : ${secretsList}.\n\nDoc officielle : ${cat.docs_url ?? "—"}\nUn formulaire de saisie sécurisé apparaît dans l'interface (intégration #${integrationId}). Une fois rempli, tu pourras appeler integration_call('${cat.slug}', ...).`,
        };
      }

      return {
        ok: false,
        output: `Type d'auth '${cat.auth_type}' pas encore supporté pour ${cat.name}. À implémenter dans LOT INT-2.`,
      };
    }

    // -------------------------------------------------
    // integration_call — exécution HTTP authentifiée
    // -------------------------------------------------
    if (name === "integration_call") {
      if (!projectId) return { ok: false, output: "integration_call : project_id requis." };

      const slug = String(rawArgs.slug ?? "").trim().toLowerCase();
      const method = String(rawArgs.method ?? "GET").toUpperCase();
      const path = String(rawArgs.path ?? "").trim();
      const body = rawArgs.body as Record<string, unknown> | undefined;
      const extraHeaders = (rawArgs.headers as Record<string, string> | undefined) ?? {};

      if (!slug) return { ok: false, output: "Missing slug" };
      if (!path) return { ok: false, output: "Missing path" };
      if (!["GET", "POST", "PUT", "PATCH", "DELETE"].includes(method))
        return { ok: false, output: `Invalid method: ${method}` };

      // 1. Cherche l'intégration active
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: joined, error: joinErr } = await (sb.from("project_integrations") as any)
        .select(
          "id, status, integration_catalog!inner(slug, name, api_base_url, auth_type)",
        )
        .eq("project_id", projectId)
        .eq("integration_catalog.slug", slug)
        .maybeSingle();

      if (joinErr) return { ok: false, output: `call lookup: ${joinErr.message}` };
      if (!joined)
        return {
          ok: false,
          output: `Aucune intégration '${slug}' connectée à ce projet. Appelle d'abord integration_setup('${slug}').`,
        };

      const integ = joined as {
        id: string;
        status: string;
        integration_catalog: {
          slug: string;
          name: string;
          api_base_url: string | null;
          auth_type: string;
        };
      };

      if (integ.status !== "active") {
        return {
          ok: false,
          output: `Intégration '${slug}' en statut '${integ.status}' (pas 'active'). L'utilisateur doit terminer la connexion.`,
        };
      }
      if (!integ.integration_catalog.api_base_url) {
        return { ok: false, output: `'${slug}' n'a pas d'api_base_url configurée dans le catalogue.` };
      }

      // 2. Récupère le credential déchiffré (via fonction RPC)
      const tokenKind =
        integ.integration_catalog.auth_type === "oauth2" ? "access_token" : "api_key";
      const { data: tokenData, error: tokenErr } = await sb.rpc("get_integration_secret_decrypted", {
        _integration_id: integ.id,
        _kind: tokenKind,
      });
      if (tokenErr) return { ok: false, output: `secret lookup: ${tokenErr.message}` };
      const token = tokenData as string | null;
      if (!token) {
        return {
          ok: false,
          output: `Pas de credential valide pour '${slug}' (token expiré ou absent). L'utilisateur doit refaire integration_setup.`,
        };
      }

      // 3. Construit la requête
      const url = integ.integration_catalog.api_base_url.replace(/\/$/, "") + (path.startsWith("/") ? path : `/${path}`);
      const headers: Record<string, string> = {
        Accept: "application/json",
        "User-Agent": "Nexyra-Elena/1.0",
        ...extraHeaders,
      };

      if (integ.integration_catalog.auth_type === "oauth2" || integ.integration_catalog.auth_type === "bearer") {
        headers.Authorization = `Bearer ${token}`;
      } else if (integ.integration_catalog.auth_type === "api_key") {
        // Convention par défaut : Bearer (Stripe, Resend, Linear, Airtable, PostHog…)
        headers.Authorization = `Bearer ${token}`;
      } else if (integ.integration_catalog.auth_type === "basic") {
        // token attendu sous forme "user:pass"
        headers.Authorization = `Basic ${Buffer.from(token).toString("base64")}`;
      }

      let bodyStr: string | undefined;
      if (body && method !== "GET" && method !== "DELETE") {
        headers["Content-Type"] = "application/json";
        bodyStr = JSON.stringify(body);
      }

      // 4. Exécute avec timeout
      const ctrl = new AbortController();
      const timeoutId = setTimeout(() => ctrl.abort(), 20_000);
      let resp: Response;
      try {
        resp = await fetch(url, { method, headers, body: bodyStr, signal: ctrl.signal });
      } catch (e) {
        clearTimeout(timeoutId);
        const errMsg = e instanceof Error ? e.message : String(e);
        // Marque l'erreur sur l'intégration
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (sb.from("project_integrations") as any)
          .update({ last_error: errMsg.slice(0, 500), status: "error" })
          .eq("id", integ.id);
        return { ok: false, output: `Network error: ${errMsg}` };
      }
      clearTimeout(timeoutId);

      const respText = await resp.text();
      const truncated = truncate(respText, 4000);

      // 5. Met à jour les compteurs
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (sb.from("project_integrations") as any)
        .update({
          last_used_at: new Date().toISOString(),
          last_error: resp.ok ? null : `HTTP ${resp.status}: ${truncated.slice(0, 200)}`,
        })
        .eq("id", integ.id);

      if (!resp.ok) {
        return {
          ok: false,
          output: `❌ ${integ.integration_catalog.name} HTTP ${resp.status} ${resp.statusText}\n\n${truncated}`,
        };
      }

      uiSignals.push({
        kind: "integration_call",
        payload: { slug, method, path, status: resp.status },
      });

      return {
        ok: true,
        output: `✅ ${integ.integration_catalog.name} ${method} ${path} → ${resp.status}\n\n${truncated}`,
      };
    }

    // -------------------------------------------------
    // integration_catalog_add — Elena enrichit le catalogue
    // -------------------------------------------------
    if (name === "integration_catalog_add") {
      const slug = String(rawArgs.slug ?? "").trim().toLowerCase();
      const nameStr = String(rawArgs.name ?? "").trim();
      const description = String(rawArgs.description ?? "").trim();
      const category = String(rawArgs.category ?? "other").trim();
      const authType = String(rawArgs.auth_type ?? "").trim();
      const iconUrl = String(rawArgs.icon_url ?? "").trim();
      const brandColor = String(rawArgs.brand_color ?? "").trim();
      const requiredSecrets = Array.isArray(rawArgs.required_secrets)
        ? (rawArgs.required_secrets as unknown[]).map((x) => String(x))
        : [];

      // Validations dures (règle mémoire)
      if (!/^[a-z0-9][a-z0-9_-]{1,40}$/.test(slug)) {
        return { ok: false, output: "slug invalide (kebab-case, 2-40 chars, [a-z0-9_-])" };
      }
      if (!nameStr || nameStr.length > 80) return { ok: false, output: "name manquant ou >80 chars" };
      if (!description || description.length > 240) return { ok: false, output: "description manquante ou >240 chars" };
      if (!["oauth2", "api_key", "bearer", "basic"].includes(authType))
        return { ok: false, output: `auth_type invalide: ${authType}` };
      if (!/^https:\/\/logo\.clearbit\.com\/[a-z0-9.-]+$/i.test(iconUrl))
        return { ok: false, output: "icon_url DOIT être https://logo.clearbit.com/{domaine} (règle Nexyra)" };
      if (!/^#[0-9a-fA-F]{6}$/.test(brandColor))
        return { ok: false, output: "brand_color DOIT être un hex #RRGGBB" };

      // Anti-doublon
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: existing } = await (sb.from("integration_catalog") as any)
        .select("slug")
        .eq("slug", slug)
        .maybeSingle();
      if (existing) {
        return { ok: false, output: `Service '${slug}' existe déjà dans le catalogue.` };
      }

      // Insert via admin (RLS = admin only sur INSERT)
      const row = {
        slug,
        name: nameStr,
        description,
        category,
        auth_type: authType,
        api_base_url: rawArgs.api_base_url ? String(rawArgs.api_base_url).replace(/\/$/, "") : null,
        oauth_authorize_url: rawArgs.oauth_authorize_url ? String(rawArgs.oauth_authorize_url) : null,
        oauth_token_url: rawArgs.oauth_token_url ? String(rawArgs.oauth_token_url) : null,
        oauth_default_scopes: Array.isArray(rawArgs.oauth_default_scopes)
          ? (rawArgs.oauth_default_scopes as unknown[]).map(String)
          : null,
        required_secrets: requiredSecrets,
        docs_url: rawArgs.docs_url ? String(rawArgs.docs_url) : null,
        homepage_url: rawArgs.homepage_url ? String(rawArgs.homepage_url) : null,
        icon_url: iconUrl,
        brand_color: brandColor,
        common_actions: Array.isArray(rawArgs.common_actions) ? rawArgs.common_actions : [],
        usage_example: rawArgs.usage_example ? String(rawArgs.usage_example) : null,
        is_vip: rawArgs.is_vip === true,
        is_active: true,
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: insErr } = await (supabaseAdmin.from("integration_catalog") as any).insert(row);
      if (insErr) {
        return { ok: false, output: `catalog_add: ${insErr.message}` };
      }

      uiSignals.push({
        kind: "integration_catalog_added",
        payload: { slug, name: nameStr, category, auth_type: authType },
      });

      return {
        ok: true,
        output: `✅ '${nameStr}' (\`${slug}\`) ajouté au catalogue Nexyra — ${category} / ${authType}. Visible immédiatement dans /integrations.`,
      };
    }

    // -------------------------------------------------
    // call_external_api — tool universel HTTP (LOT INT-2)
    // -------------------------------------------------
    if (name === "call_external_api") {
      const url = String(rawArgs.url ?? "").trim();
      const method = String(rawArgs.method ?? "GET").toUpperCase();
      const body = rawArgs.body as Record<string, unknown> | undefined;
      const extraHeaders = (rawArgs.headers as Record<string, string> | undefined) ?? {};
      const authFromSlug = rawArgs.auth_from_slug ? String(rawArgs.auth_from_slug).trim().toLowerCase() : null;
      const bearerInline = rawArgs.bearer_token ? String(rawArgs.bearer_token) : null;

      if (!/^https?:\/\//i.test(url)) return { ok: false, output: "url doit commencer par https:// (ou http://)." };
      if (!["GET", "POST", "PUT", "PATCH", "DELETE"].includes(method))
        return { ok: false, output: `Méthode invalide: ${method}` };

      // Anti-SSRF basique
      try {
        const parsed = new URL(url);
        const host = parsed.hostname.toLowerCase();
        if (
          host === "localhost" || host === "0.0.0.0" ||
          host.startsWith("127.") || host.startsWith("10.") ||
          host.startsWith("192.168.") || host.startsWith("169.254.") ||
          /^172\.(1[6-9]|2\d|3[0-1])\./.test(host) ||
          host.endsWith(".internal") || host.endsWith(".local")
        ) {
          return { ok: false, output: `Host bloqué (réseau privé): ${host}` };
        }
      } catch {
        return { ok: false, output: "URL invalide." };
      }

      const headers: Record<string, string> = {
        Accept: "application/json",
        "User-Agent": "Nexyra-Elena/1.0",
        ...extraHeaders,
      };

      if (authFromSlug && projectId) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: joined } = await (sb.from("project_integrations") as any)
          .select("id, status, integration_catalog!inner(slug, auth_type)")
          .eq("project_id", projectId)
          .eq("integration_catalog.slug", authFromSlug)
          .maybeSingle();
        if (!joined) return { ok: false, output: `auth_from_slug='${authFromSlug}' : non connecté. Lance integration_setup.` };
        const j = joined as { id: string; status: string; integration_catalog: { auth_type: string } };
        if (j.status !== "active") return { ok: false, output: `Intégration '${authFromSlug}' statut '${j.status}'.` };
        const tokenKind = j.integration_catalog.auth_type === "oauth2" ? "access_token" : "api_key";
        const { data: tk } = await sb.rpc("get_integration_secret_decrypted", {
          _integration_id: j.id,
          _kind: tokenKind,
        });
        if (!tk) return { ok: false, output: `Pas de credential valide pour '${authFromSlug}'.` };
        headers.Authorization = `Bearer ${tk}`;
      } else if (bearerInline) {
        headers.Authorization = `Bearer ${bearerInline}`;
      }

      let bodyStr: string | undefined;
      if (body && method !== "GET" && method !== "DELETE") {
        headers["Content-Type"] = headers["Content-Type"] ?? "application/json";
        bodyStr = JSON.stringify(body);
        if (bodyStr.length > 64_000) return { ok: false, output: "Body trop gros (>64KB)." };
      }

      const ctrl = new AbortController();
      const timeoutId = setTimeout(() => ctrl.abort(), 25_000);
      let resp: Response;
      try {
        resp = await fetch(url, { method, headers, body: bodyStr, signal: ctrl.signal });
      } catch (e) {
        clearTimeout(timeoutId);
        return { ok: false, output: `Network error: ${e instanceof Error ? e.message : String(e)}` };
      }
      clearTimeout(timeoutId);

      const respText = (await resp.text()).slice(0, 256_000);
      const truncated = truncate(respText, 8000);

      uiSignals.push({
        kind: "external_api_call",
        payload: { url, method, status: resp.status, ok: resp.ok },
      });

      const ctype = resp.headers.get("content-type") ?? "";
      return {
        ok: resp.ok,
        output: `${resp.ok ? "✅" : "❌"} ${method} ${url} → ${resp.status} ${resp.statusText} (${ctype})\n\n${truncated}`,
      };
    }

    return null;
  } catch (e) {
    return { ok: false, output: e instanceof Error ? e.message : "integration tool error" };
  }
}
