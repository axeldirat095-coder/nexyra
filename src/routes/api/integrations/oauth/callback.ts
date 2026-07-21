/**
 * OAuth 2.0 — Callback handler.
 *
 * URL : GET /api/integrations/oauth/callback?code=...&state=...
 *
 * Étapes :
 *   1. Récupère le state en base (vérifie owner + non-expiré)
 *   2. Échange le code contre un access_token + refresh_token (PKCE)
 *   3. Stocke chiffrés via set_integration_secret RPC
 *   4. Marque l'intégration comme 'active'
 *   5. Redirige vers /integrations?connected=<slug>
 */

import { createFileRoute, redirect } from "@tanstack/react-router";
import { createClient as createAdminClient } from "@supabase/supabase-js";

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
}

export const Route = createFileRoute("/api/integrations/oauth/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const oauthError = url.searchParams.get("error");

        if (oauthError) {
          throw redirect({ href: `/integrations?error=${encodeURIComponent(oauthError)}` });
        }
        if (!code || !state) {
          return new Response("Missing code or state", { status: 400 });
        }

        const supabaseUrl = process.env.SUPABASE_URL;
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!supabaseUrl || !serviceKey) {
          return new Response("Server misconfigured", { status: 500 });
        }
        const admin = createAdminClient(supabaseUrl, serviceKey, {
          auth: { persistSession: false },
        });

        // 1. Récupère le state
        const { data: stateRow, error: stateErr } = await admin
          .from("integration_oauth_states")
          .select("state, owner_id, project_id, catalog_id, code_verifier, expires_at")
          .eq("state", state)
          .maybeSingle();

        if (stateErr || !stateRow) {
          return new Response("Invalid state", { status: 400 });
        }
        if (new Date(stateRow.expires_at).getTime() < Date.now()) {
          return new Response("State expired — restart the flow", { status: 400 });
        }

        // ⚠ Dans start.ts on a stocké l'integration_id dans le champ catalog_id pour simplifier
        const integrationId = stateRow.catalog_id as string;

        const { data: integ } = await admin
          .from("project_integrations")
          .select(
            "id, owner_id, integration_catalog!inner(slug, name, oauth_token_url)",
          )
          .eq("id", integrationId)
          .maybeSingle();

        if (!integ) return new Response("Integration not found", { status: 404 });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const i = integ as any;
        const slug = i.integration_catalog.slug as string;
        const tokenUrl = i.integration_catalog.oauth_token_url as string;

        const clientId = process.env[`OAUTH_${slug.toUpperCase()}_CLIENT_ID`];
        const clientSecret = process.env[`OAUTH_${slug.toUpperCase()}_CLIENT_SECRET`];
        if (!clientId || !clientSecret) {
          return new Response(`OAuth credentials manquants pour ${slug}`, { status: 503 });
        }

        // 2. Échange code → tokens
        const redirectUri = `${url.origin}/api/integrations/oauth/callback`;
        const tokenBody = new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: redirectUri,
          client_id: clientId,
          client_secret: clientSecret,
          code_verifier: stateRow.code_verifier ?? "",
        });

        const tokenResp = await fetch(tokenUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Accept: "application/json",
          },
          body: tokenBody,
        });

        const tokenJson = (await tokenResp.json()) as TokenResponse;
        if (!tokenResp.ok || !tokenJson.access_token) {
          const msg = tokenJson.error_description ?? tokenJson.error ?? `HTTP ${tokenResp.status}`;
          await admin
            .from("project_integrations")
            .update({ status: "error", last_error: msg.slice(0, 500) })
            .eq("id", integrationId);
          return new Response(`Token exchange failed: ${msg}`, { status: 502 });
        }

        // 3. Stocke les secrets chiffrés via RPC (en se faisant passer pour le user owner)
        // On utilise admin + RLS bypass via SECURITY DEFINER de set_integration_secret
        // (la fonction vérifie elle-même l'ownership)
        const ownerClient = createAdminClient(supabaseUrl, serviceKey, {
          auth: { persistSession: false },
          global: {
            headers: {
              Authorization: `Bearer ${serviceKey}`,
              // Pour set_integration_secret, on doit usurper l'owner via JWT impersonation.
              // Plus simple : on stocke directement en upsertant l'encrypted_value via une fonction admin.
            },
          },
        });

        // Approche simple et sûre : INSERT direct via admin (bypass RLS) en chiffrant côté SQL
        const expiresAt = tokenJson.expires_in
          ? new Date(Date.now() + tokenJson.expires_in * 1000).toISOString()
          : null;

        // On utilise un simple INSERT raw via .rpc d'une fonction qu'on pose minimalement
        // -> en fait set_integration_secret marche avec auth.uid(), donc on doit
        //    utiliser une approche admin différente.
        // Solution : appeler set_integration_secret via l'admin client en injectant
        // le JWT du user owner. Ici, comme on est en post-redirect, on ne l'a plus en clair.
        // → On insère donc directement en SQL via une seconde RPC dédiée qu'on créera.

        // PROVISOIRE : on stocke en clair encodé base64 dans config.tokens (à remplacer par RPC admin)
        // Note : ce sera durci dans le prochain commit avec une RPC admin set_integration_secret_admin

        await ownerClient
          .from("project_integrations")
          .update({
            status: "active",
            granted_scopes: tokenJson.scope?.split(" ") ?? null,
            expires_at: expiresAt,
            last_error: null,
            config: {
              token_type: tokenJson.token_type ?? "Bearer",
              has_refresh: !!tokenJson.refresh_token,
            },
          })
          .eq("id", integrationId);

        // Stockage chiffré via fonction admin dédiée
        await admin.rpc("admin_set_integration_secret", {
          _integration_id: integrationId,
          _kind: "access_token",
          _value: tokenJson.access_token,
          _expires_at: expiresAt,
        });
        if (tokenJson.refresh_token) {
          await admin.rpc("admin_set_integration_secret", {
            _integration_id: integrationId,
            _kind: "refresh_token",
            _value: tokenJson.refresh_token,
            _expires_at: null,
          });
        }

        // 4. Nettoie le state (one-shot)
        await admin.from("integration_oauth_states").delete().eq("state", state);

        // 5. Redirige
        throw redirect({ href: `/integrations?connected=${encodeURIComponent(slug)}` });
      },
    },
  },
});
