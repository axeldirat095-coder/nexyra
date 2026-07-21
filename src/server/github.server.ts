/**
 * GitHub API helpers (server-only).
 *
 * Toutes les fonctions qui touchent à GitHub ou à la table
 * `github_connections` vivent ici. Importé uniquement depuis :
 *  - src/lib/github.functions.ts (server fns)
 *  - src/routes/api/public/github.callback.ts (OAuth callback)
 *
 * Ne JAMAIS importer ce fichier depuis du code client.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { randomBytes } from "crypto";

const GITHUB_API = "https://api.github.com";
const GITHUB_OAUTH = "https://github.com/login/oauth";
const SCOPES = "repo,user:email";

export type GithubConnection = {
  id: string;
  user_id: string;
  github_user_id: number;
  github_username: string;
  avatar_url: string | null;
  scope: string;
  access_token_encrypted: string;
};

function getOAuthCreds() {
  const clientId = process.env.GITHUB_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GITHUB_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(
      "GitHub OAuth non configuré (GITHUB_OAUTH_CLIENT_ID / GITHUB_OAUTH_CLIENT_SECRET manquants)",
    );
  }
  return { clientId, clientSecret };
}

export function buildAuthorizeUrl(opts: {
  state: string;
  redirectUri: string;
}): string {
  const { clientId } = getOAuthCreds();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: opts.redirectUri,
    scope: SCOPES,
    state: opts.state,
    allow_signup: "true",
  });
  return `${GITHUB_OAUTH}/authorize?${params.toString()}`;
}

export async function createOAuthState(userId: string): Promise<string> {
  const state = randomBytes(32).toString("hex");
  const { error } = await (supabaseAdmin as any)
    .from("github_oauth_states")
    .insert({ state, user_id: userId });
  if (error) throw new Error(`Impossible de créer l'état OAuth: ${error.message}`);
  return state;
}

export async function consumeOAuthState(state: string): Promise<string | null> {
  const { data } = await (supabaseAdmin as any)
    .from("github_oauth_states")
    .select("user_id, expires_at")
    .eq("state", state)
    .maybeSingle();
  if (!data) return null;
  await (supabaseAdmin as any).from("github_oauth_states").delete().eq("state", state);
  if (new Date(data.expires_at).getTime() < Date.now()) return null;
  return data.user_id as string;
}

export async function exchangeCodeForToken(
  code: string,
  redirectUri: string,
): Promise<{ access_token: string; scope: string }> {
  const { clientId, clientSecret } = getOAuthCreds();
  const res = await fetch(`${GITHUB_OAUTH}/access_token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    }),
  });
  if (!res.ok) {
    throw new Error(`Échange de code GitHub échoué: ${res.status}`);
  }
  const json = (await res.json()) as {
    access_token?: string;
    scope?: string;
    error?: string;
    error_description?: string;
  };
  if (!json.access_token) {
    throw new Error(
      `GitHub a refusé l'autorisation: ${json.error_description ?? json.error ?? "inconnu"}`,
    );
  }
  return { access_token: json.access_token, scope: json.scope ?? "" };
}

async function ghFetch<T>(
  token: string,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${GITHUB_API}${path}`, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "Nexyra-Import",
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`GitHub ${path} -> ${res.status}: ${text.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

export type GithubUserProfile = {
  id: number;
  login: string;
  avatar_url: string;
};

export async function getGithubUser(token: string): Promise<GithubUserProfile> {
  return ghFetch<GithubUserProfile>(token, "/user");
}

export type GithubRepoSummary = {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  default_branch: string;
  description: string | null;
  updated_at: string;
  pushed_at: string;
  clone_url: string;
  html_url: string;
  owner: { login: string; avatar_url: string };
};

export async function listUserRepos(token: string): Promise<GithubRepoSummary[]> {
  const out: GithubRepoSummary[] = [];
  for (let page = 1; page <= 5; page++) {
    const batch = await ghFetch<GithubRepoSummary[]>(
      token,
      `/user/repos?per_page=100&page=${page}&sort=pushed&affiliation=owner,collaborator,organization_member`,
    );
    out.push(...batch);
    if (batch.length < 100) break;
  }
  return out;
}

export type GithubBranch = { name: string; commit: { sha: string } };

export async function listRepoBranches(
  token: string,
  owner: string,
  repo: string,
): Promise<GithubBranch[]> {
  return ghFetch<GithubBranch[]>(token, `/repos/${owner}/${repo}/branches?per_page=100`);
}

export async function upsertConnection(opts: {
  userId: string;
  profile: GithubUserProfile;
  accessToken: string;
  scope: string;
}): Promise<void> {
  // Métadonnées non sensibles
  const { error: upErr } = await (supabaseAdmin as any)
    .from("github_connections")
    .upsert(
      {
        user_id: opts.userId,
        github_user_id: opts.profile.id,
        github_username: opts.profile.login,
        avatar_url: opts.profile.avatar_url,
        scope: opts.scope,
      },
      { onConflict: "user_id" },
    );
  if (upErr) throw new Error(`Sauvegarde connexion GitHub: ${upErr.message}`);

  // Token chiffré côté DB via pgp_sym_encrypt
  const { error: tokErr } = await (supabaseAdmin as any).rpc("set_github_token", {
    _user_id: opts.userId,
    _token: opts.accessToken,
    _github_user_id: opts.profile.id,
    _github_username: opts.profile.login,
    _scope: opts.scope,
  });
  if (tokErr) throw new Error(`Chiffrement token GitHub: ${tokErr.message}`);
}

export type GithubConnectionWithToken = Omit<GithubConnection, "access_token_encrypted"> & {
  access_token: string;
};

export async function getConnectionForUser(
  userId: string,
): Promise<GithubConnectionWithToken | null> {
  const { data: row } = await (supabaseAdmin as any)
    .from("github_connections")
    .select("id, user_id, github_user_id, github_username, avatar_url, scope")
    .eq("user_id", userId)
    .maybeSingle();
  if (!row) return null;

  const { data: tok, error: tokErr } = await (supabaseAdmin as any).rpc(
    "get_github_token",
    { _user_id: userId },
  );
  if (tokErr || !tok || tok.length === 0) return null;
  const decrypted = (tok[0] as { token: string }).token;

  return {
    ...(row as Omit<GithubConnection, "access_token_encrypted">),
    access_token: decrypted,
  };
}

export async function deleteConnectionForUser(userId: string): Promise<void> {
  await (supabaseAdmin as any).from("github_connections").delete().eq("user_id", userId);
}
