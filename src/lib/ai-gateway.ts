/**
 * Lovable AI Gateway — provider helper pour le Vercel AI SDK v5.
 * Source de vérité : knowledge://ai-sdk-lovable-gateway.
 *
 * 🔒 Server-only : ne jamais importer ce module depuis du code client.
 *    La clé `LOVABLE_API_KEY` ne doit JAMAIS fuiter dans le bundle navigateur.
 */
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

export const createLovableAiGatewayProvider = (lovableApiKey: string) =>
  createOpenAICompatible({
    name: "lovable",
    baseURL: "https://ai.gateway.lovable.dev/v1",
    headers: {
      "Lovable-API-Key": lovableApiKey,
      "X-Lovable-AIG-SDK": "vercel-ai-sdk",
    },
  });

export type LovableAiProvider = ReturnType<typeof createLovableAiGatewayProvider>;
