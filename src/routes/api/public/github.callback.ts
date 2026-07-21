/**
 * OAuth callback GitHub.
 *
 * GitHub redirige le navigateur ici après autorisation avec ?code=...&state=...
 * On valide le state (anti-CSRF, lié à l'utilisateur), on échange le code
 * contre un token, on stocke la connexion, puis on renvoie l'utilisateur
 * vers /dev.
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/github/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const errorParam = url.searchParams.get("error");

        const back = (params: Record<string, string>) => {
          const target = new URL("/dev", url.origin);
          for (const [k, v] of Object.entries(params)) {
            target.searchParams.set(k, v);
          }
          return Response.redirect(target.toString(), 302);
        };

        if (errorParam) {
          return back({ github: "error", reason: errorParam.slice(0, 100) });
        }
        if (!code || !state) {
          return back({ github: "error", reason: "missing_params" });
        }

        try {
          const {
            consumeOAuthState,
            exchangeCodeForToken,
            getGithubUser,
            upsertConnection,
          } = await import("@/server/github.server");

          const userId = await consumeOAuthState(state);
          if (!userId) {
            return back({ github: "error", reason: "invalid_state" });
          }

          const redirectUri = `${url.origin}/api/public/github/callback`;
          const { access_token, scope } = await exchangeCodeForToken(code, redirectUri);
          const profile = await getGithubUser(access_token);
          await upsertConnection({
            userId,
            profile,
            accessToken: access_token,
            scope,
          });

          return back({ github: "connected", user: profile.login });
        } catch (err) {
          const msg = err instanceof Error ? err.message : "unknown";
          return back({ github: "error", reason: msg.slice(0, 120) });
        }
      },
    },
  },
});
