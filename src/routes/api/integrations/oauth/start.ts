/**
 * OAuth 2.0 — Authorization Code Flow (avec PKCE) — kick-off.
 *
 * URL : GET /api/integrations/oauth/start?integration_id=<uuid>
 *
 * Étapes :
 *   1. Vérifie que l'utilisateur est authentifié et propriétaire de l'intégration
 *   2. Récupère le catalogue (URL d'autorisation, scopes, client_id)
 *   3. Génère state + code_verifier (PKCE)
 *   4. Stocke le state en base (TTL 10 min)
 *   5. Redirige vers le provider
 *
 * Le client_id et client_secret OAuth sont lus depuis les variables d'environnement
 * (préfixe LOVABLE_OAUTH_<SLUG>_CLIENT_ID / _CLIENT_SECRET) — l'utilisateur peut
 * aussi enregistrer son propre client via la page /integrations.
 */

import { createFileRoute, redirect } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";

function pkceVerifier(): string {
  return crypto.randomBytes(32).toString("base64url");
}
function pkceChallenge(verifier: string): string {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

export const Route = createFileRoute("/api/integrations/oauth/start")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const integrationId = url.searchParams.get("integration_id");
        if (!integrationId) {
          return new Response("Missing integration_id", { status: 400 });
        }

        // Auth via Bearer token (cookie ou header)
        const authHeader = request.headers.get("Authorization");
        const accessToken = authHeader?.replace(/^Bearer\s+/i, "") ?? "";
        if (!accessToken) {
          return new Response("Unauthorized", { status: 401 });
        }

        const supabaseUrl = process.env.SUPABASE_URL;
        const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
        if (!supabaseUrl || !publishableKey) {
          return new Response("Server misconfigured", { status: 500 });
        }

        const supabase = createClient(supabaseUrl, publishableKey, {
          global: { headers: { Authorization: `Bearer ${accessToken}` } },
          auth: { persistSession: false },
        });

        const { data: userData } = await supabase.auth.getUser();
        const userId = userData?.user?.id;
        if (!userId) return new Response("Unauthorized", { status: 401 });

        // 1. Récupère l'intégration + catalogue
        const { data: integ, error } = await supabase
          .from("project_integrations")
          .select(
            "id, project_id, owner_id, integration_catalog!inner(slug, name, oauth_authorize_url, oauth_default_scopes, auth_type)",
          )
          .eq("id", integrationId)
          .maybeSingle();

        if (error || !integ) {
          return new Response("Integration not found", { status: 404 });
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const i = integ as any;
        if (i.owner_id !== userId) return new Response("Forbidden", { status: 403 });
        if (i.integration_catalog.auth_type !== "oauth2") {
          return new Response("Not an OAuth integration", { status: 400 });
        }

        const slug = i.integration_catalog.slug as string;
        const clientId = process.env[`OAUTH_${slug.toUpperCase()}_CLIENT_ID`];
        if (!clientId) {
          return new Response(
            `OAuth client_id manquant pour ${slug}. L'admin doit configurer le secret OAUTH_${slug.toUpperCase()}_CLIENT_ID.`,
            { status: 503 },
          );
        }

        // 2. Génère state + PKCE
        const state = crypto.randomBytes(24).toString("base64url");
        const verifier = pkceVerifier();
        const challenge = pkceChallenge(verifier);

        const { error: stateErr } = await supabase.from("integration_oauth_states").insert({
          state,
          owner_id: userId,
          project_id: i.project_id,
          catalog_id: integrationId, // on stocke l'integration_id ici pour simplifier le callback
          code_verifier: verifier,
        });
        if (stateErr) {
          return new Response(`State init failed: ${stateErr.message}`, { status: 500 });
        }

        // 3. Construit l'URL d'autorisation
        const redirectUri = `${url.origin}/api/integrations/oauth/callback`;
        const scopes = (i.integration_catalog.oauth_default_scopes ?? []).join(" ");
        const authorizeUrl = new URL(i.integration_catalog.oauth_authorize_url as string);
        authorizeUrl.searchParams.set("client_id", clientId);
        authorizeUrl.searchParams.set("redirect_uri", redirectUri);
        authorizeUrl.searchParams.set("response_type", "code");
        authorizeUrl.searchParams.set("state", state);
        authorizeUrl.searchParams.set("code_challenge", challenge);
        authorizeUrl.searchParams.set("code_challenge_method", "S256");
        authorizeUrl.searchParams.set("access_type", "offline"); // Google
        authorizeUrl.searchParams.set("prompt", "consent");
        if (scopes) authorizeUrl.searchParams.set("scope", scopes);

        throw redirect({ href: authorizeUrl.toString() });
      },
    },
  },
});
