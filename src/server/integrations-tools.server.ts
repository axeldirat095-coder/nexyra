/**
 * Integrations tools — pont entre /integrations (UI) et external_keys (storage).
 * Permet à Elena de lister + enregistrer des intégrations sans gaspiller de crédit.
 *
 *  - integration_list     : retourne le catalogue + statut connecté/non
 *  - integration_register : enregistre une clé via set_external_key
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { ToolName, ToolResult } from "./agent-tools.server";

const INTEGRATIONS_TOOLS: ReadonlySet<string> = new Set<string>([
  "integration_list",
  "integration_register",
]);

export function isIntegrationsTool(name: string): boolean {
  return INTEGRATIONS_TOOLS.has(name);
}

function ok(payload: unknown): ToolResult {
  return { ok: true, output: JSON.stringify(payload) };
}
function err(message: string): ToolResult {
  return { ok: false, output: message };
}

export async function executeIntegrationsTool(
  name: string,
  args: Record<string, unknown>,
  supabase: SupabaseClient<Database>,
  _userId: string,
): Promise<ToolResult | null> {
  if (!isIntegrationsTool(name)) return null;

  if (name === "integration_list") {
    const { data, error } = await supabase.rpc("list_user_integrations_unified");
    if (error) return err(`integration_list failed: ${error.message}`);
    const list = (Array.isArray(data) ? data : []) as Array<Record<string, unknown>>;
    const filter = typeof args.filter === "string" ? args.filter.toLowerCase() : "";
    const onlyMissing = args.only_missing === true;
    let result = list;
    if (filter) {
      result = result.filter(
        (it) =>
          String(it.slug ?? "").toLowerCase().includes(filter) ||
          String(it.name ?? "").toLowerCase().includes(filter) ||
          String(it.category ?? "").toLowerCase().includes(filter),
      );
    }
    if (onlyMissing) result = result.filter((it) => it.connected !== true);
    return ok({
      total: result.length,
      integrations: result.slice(0, 80),
      hint: "Utilise integration_register pour ajouter une clé manquante.",
    });
  }

  if (name === "integration_register") {
    const service = String(args.service ?? "").trim().toLowerCase();
    const key = String(args.key ?? "").trim();
    const label = typeof args.label === "string" ? args.label : undefined;
    if (!service || service.length < 2) return err("`service` requis (ex: openai_api_key).");
    if (!key || key.length < 8) return err("`key` invalide (min 8 caractères).");

    const { data, error } = await supabase.rpc("set_external_key", {
      _service: service,
      _key: key,
      _label: label,
    });
    if (error) return err(`integration_register failed: ${error.message}`);
    return ok({
      id: data,
      service,
      label,
      message: `Clé ${service} enregistrée. Les outils qui en dépendent sont maintenant utilisables.`,
    });
  }

  return null;
}

export const INTEGRATIONS_TOOL_SCHEMAS = [
  {
    type: "function",
    function: {
      name: "integration_list",
      description:
        "Liste toutes les intégrations disponibles dans le catalogue Nexyra (Stripe, OpenAI, Mailchimp, Pinecone, Shopify, etc.) avec leur statut (connectée ou non) pour l'utilisateur courant. Utilise ça AVANT de proposer une intégration : ne demande jamais de clé sans avoir vérifié que le service existe au catalogue.",
      parameters: {
        type: "object",
        properties: {
          filter: {
            type: "string",
            description: "Filtre optionnel sur slug/nom/catégorie (ex: 'email', 'shopify').",
          },
          only_missing: {
            type: "boolean",
            description: "Si true, retourne uniquement les intégrations NON connectées.",
          },
        },
        required: [],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "integration_register",
      description:
        "Enregistre une clé API externe pour l'utilisateur (chiffrée côté serveur). À appeler quand l'user te donne une clé pour activer un outil. Le `service` doit être le nom de secret attendu par les outils (ex: 'openai_api_key', 'mailchimp_api_key', 'shopify_admin_token'). Une fois enregistrée, l'outil correspondant peut être appelé immédiatement.",
      parameters: {
        type: "object",
        properties: {
          service: {
            type: "string",
            description:
              "Nom canonique du secret (lowercase, snake_case). Exemples : openai_api_key, mailchimp_api_key, shopify_admin_token, pinecone_api_key.",
          },
          key: {
            type: "string",
            description: "La valeur de la clé API que l'utilisateur a fournie.",
          },
          label: {
            type: "string",
            description: "Label optionnel pour reconnaître la clé (ex: 'Mon compte prod').",
          },
        },
        required: ["service", "key"],
        additionalProperties: false,
      },
    },
  },
] as const;
