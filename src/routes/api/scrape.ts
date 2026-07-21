/**
 * Server route: proxy Firecrawl v2 API.
 * Wraps the 4 main methods (scrape, search, map, crawl) behind a single endpoint.
 * Auth: requires logged-in user (uses Authorization Bearer Supabase JWT).
 *
 * Body: { action: "scrape" | "search" | "map" | "crawl", payload: {...} }
 * - scrape  : { url, formats?, onlyMainContent?, waitFor? }
 * - search  : { query, limit?, tbs?, scrapeOptions? }
 * - map     : { url, search?, limit?, includeSubdomains? }
 * - crawl   : { url, limit?, maxDepth?, includePaths?, excludePaths? }
 */

import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const FIRECRAWL_BASE = "https://api.firecrawl.dev/v2";

type Action = "scrape" | "search" | "map" | "crawl";

interface ScrapePayload {
  url?: string;
  query?: string;
  formats?: unknown;
  onlyMainContent?: boolean;
  waitFor?: number;
  limit?: number;
  tbs?: string;
  scrapeOptions?: unknown;
  search?: string;
  includeSubdomains?: boolean;
  maxDepth?: number;
  includePaths?: string[];
  excludePaths?: string[];
}

async function callFirecrawl(action: Action, payload: ScrapePayload, apiKey: string) {
  let path: string;
  let body: Record<string, unknown>;

  switch (action) {
    case "scrape":
      if (!payload.url) throw new Error("url required");
      path = "/scrape";
      body = {
        url: payload.url,
        formats: payload.formats ?? ["markdown"],
        onlyMainContent: payload.onlyMainContent ?? true,
        waitFor: payload.waitFor,
      };
      break;
    case "search":
      if (!payload.query) throw new Error("query required");
      path = "/search";
      body = {
        query: payload.query,
        limit: payload.limit ?? 5,
        tbs: payload.tbs,
        scrapeOptions: payload.scrapeOptions,
      };
      break;
    case "map":
      if (!payload.url) throw new Error("url required");
      path = "/map";
      body = {
        url: payload.url,
        search: payload.search,
        limit: payload.limit ?? 100,
        includeSubdomains: payload.includeSubdomains ?? false,
      };
      break;
    case "crawl":
      if (!payload.url) throw new Error("url required");
      path = "/crawl";
      body = {
        url: payload.url,
        limit: payload.limit ?? 10,
        maxDepth: payload.maxDepth,
        includePaths: payload.includePaths,
        excludePaths: payload.excludePaths,
        scrapeOptions: { formats: ["markdown"] },
      };
      break;
  }

  // Strip undefined
  Object.keys(body).forEach((k) => body[k] === undefined && delete body[k]);

  const res = await fetch(`${FIRECRAWL_BASE}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

export const Route = createFileRoute("/api/scrape")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = process.env.FIRECRAWL_API_KEY;
        if (!apiKey) {
          return Response.json(
            { error: "FIRECRAWL_API_KEY not configured. Connect Firecrawl in Connectors." },
            { status: 500 },
          );
        }

        // Auth (light: just require valid bearer)
        const authHeader = request.headers.get("authorization") ?? "";
        const token = authHeader.replace(/^Bearer\s+/i, "");
        if (!token) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
        const anonKey = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
        if (!supabaseUrl || !anonKey) {
          return Response.json({ error: "Supabase env missing" }, { status: 500 });
        }
        const sb = createClient<Database>(supabaseUrl, anonKey, {
          global: { headers: { Authorization: `Bearer ${token}` } },
        });
        const { data: userData } = await sb.auth.getUser();
        if (!userData.user) return Response.json({ error: "Unauthorized" }, { status: 401 });

        let body: { action?: Action; payload?: ScrapePayload };
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "Invalid JSON" }, { status: 400 });
        }

        const action = body.action;
        if (!action || !["scrape", "search", "map", "crawl"].includes(action)) {
          return Response.json({ error: "Invalid action" }, { status: 400 });
        }

        try {
          const result = await callFirecrawl(action, body.payload ?? {}, apiKey);
          return Response.json(result, { status: result.ok ? 200 : result.status });
        } catch (e) {
          const msg = e instanceof Error ? e.message : "unknown";
          return Response.json({ error: msg }, { status: 400 });
        }
      },
    },
  },
});
