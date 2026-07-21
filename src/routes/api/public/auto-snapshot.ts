import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Endpoint cron : crée un snapshot pour chaque projet "actif" modifié récemment.
 * Appelé par pg_cron via pg_net (toutes les 30 min).
 * Sécurité : header `x-cron-secret` doit matcher AUTO_SNAPSHOT_SECRET.
 */
export const Route = createFileRoute("/api/public/auto-snapshot")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = request.headers.get("x-cron-secret");
        const expected = process.env.AUTO_SNAPSHOT_SECRET;
        if (!expected || secret !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }

        // Projets actifs avec activité dans les 30 dernières minutes
        const cutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();
        const { data: projects, error } = await supabaseAdmin
          .from("projects")
          .select("id, owner_id, updated_at")
          .eq("status", "active")
          .gte("updated_at", cutoff);

        if (error) {
          return Response.json({ error: error.message }, { status: 500 });
        }

        let created = 0;
        let skipped = 0;
        for (const p of projects ?? []) {
          // Skip si un snapshot existe déjà dans la dernière demi-heure
          const { data: recent } = await supabaseAdmin
            .from("project_snapshots")
            .select("id")
            .eq("project_id", p.id)
            .gte("created_at", cutoff)
            .limit(1)
            .maybeSingle();
          if (recent) {
            skipped++;
            continue;
          }

          const { data: convs = [] } = await supabaseAdmin
            .from("conversations").select("*").eq("project_id", p.id);
          const convIds = (convs ?? []).map((c: any) => c.id);
          let msgs: any[] = [];
          if (convIds.length) {
            const { data: m = [] } = await supabaseAdmin
              .from("messages").select("*").in("conversation_id", convIds);
            msgs = m ?? [];
          }
          const { data: project } = await supabaseAdmin
            .from("projects").select("*").eq("id", p.id).maybeSingle();

          const { data: last } = await supabaseAdmin
            .from("project_snapshots")
            .select("version")
            .eq("project_id", p.id)
            .order("version", { ascending: false })
            .limit(1)
            .maybeSingle();
          const v = (last?.version ?? 0) + 1;

          const json = JSON.stringify({
            version: v,
            created_at: new Date().toISOString(),
            project, conversations: convs, messages: msgs,
          });
          const bytes = new TextEncoder().encode(json);
          const path = `${p.owner_id}/${p.id}/v${v}-auto-${Date.now()}.json`;

          const { error: upErr } = await supabaseAdmin.storage
            .from("project-snapshots")
            .upload(path, bytes, { contentType: "application/json", upsert: false });
          if (upErr) continue;

          await supabaseAdmin.from("project_snapshots").insert({
            owner_id: p.owner_id,
            project_id: p.id,
            label: "Auto-backup",
            version: v,
            storage_path: path,
            size_bytes: bytes.byteLength,
            messages_count: msgs.length,
          });
          created++;
        }

        return Response.json({ ok: true, created, skipped, total: projects?.length ?? 0 });
      },
    },
  },
});
