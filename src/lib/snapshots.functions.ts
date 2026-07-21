import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const CreateSchema = z.object({
  projectId: z.string().uuid(),
  label: z.string().min(1).max(120).default("Snapshot"),
  summary: z.string().max(2000).optional(),
});

/**
 * Crée un snapshot versionné d'un projet :
 * - dump JSON { project, conversations, messages }
 * - upload dans le bucket privé `project-snapshots`
 * - insère une ligne dans `project_snapshots`
 */
export const createProjectSnapshot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CreateSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // 1) Charge le projet (RLS garantit la propriété)
    const { data: project, error: pErr } = await supabase
      .from("projects")
      .select("*")
      .eq("id", data.projectId)
      .maybeSingle();
    if (pErr) throw new Error(`projects: ${pErr.message}`);
    if (!project) throw new Error("Projet introuvable ou accès refusé.");

    // 2) Conversations + messages liés
    const { data: conversations = [] } = await supabase
      .from("conversations")
      .select("*")
      .eq("project_id", data.projectId);

    const convIds = (conversations ?? []).map((c) => c.id);
    let messages: any[] = [];
    if (convIds.length > 0) {
      const { data: msgs = [] } = await supabase
        .from("messages")
        .select("*")
        .in("conversation_id", convIds);
      messages = msgs ?? [];
    }

    // 3) Numéro de version (max + 1)
    const { data: last } = await supabase
      .from("project_snapshots")
      .select("version")
      .eq("project_id", data.projectId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextVersion = (last?.version ?? 0) + 1;

    // 4) Payload + upload Storage (chemin: <userId>/<projectId>/v<n>-<ts>.json)
    const payload = {
      version: nextVersion,
      created_at: new Date().toISOString(),
      project,
      conversations,
      messages,
    };
    const json = JSON.stringify(payload);
    const bytes = new TextEncoder().encode(json);
    const path = `${userId}/${data.projectId}/v${nextVersion}-${Date.now()}.json`;

    const { error: upErr } = await supabase.storage
      .from("project-snapshots")
      .upload(path, bytes, {
        contentType: "application/json",
        upsert: false,
      });
    if (upErr) throw new Error(`storage upload: ${upErr.message}`);

    // 5) Index DB
    const { data: row, error: insErr } = await supabase
      .from("project_snapshots")
      .insert({
        owner_id: userId,
        project_id: data.projectId,
        label: data.label,
        version: nextVersion,
        summary: data.summary ?? null,
        storage_path: path,
        size_bytes: bytes.byteLength,
        messages_count: messages.length,
      })
      .select()
      .single();
    if (insErr) throw new Error(`db insert: ${insErr.message}`);

    return { snapshot: row };
  });

/**
 * Restaure un snapshot : recharge le payload JSON depuis Storage,
 * écrase le projet (nom/description/metadata) et recrée les conversations + messages.
 * ⚠️ Destructif sur le projet courant : crée d'abord un snapshot "pre-restore" automatique.
 */
export const restoreProjectSnapshot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ snapshotId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: snap, error: sErr } = await supabase
      .from("project_snapshots")
      .select("*")
      .eq("id", data.snapshotId)
      .maybeSingle();
    if (sErr || !snap) throw new Error("Snapshot introuvable");

    const { data: file, error: dErr } = await supabase.storage
      .from("project-snapshots")
      .download(snap.storage_path);
    if (dErr || !file) throw new Error(`download: ${dErr?.message}`);

    const text = await file.text();
    const payload = JSON.parse(text) as {
      project: any;
      conversations: any[];
      messages: any[];
    };

    // Snapshot de sécurité avant écrasement
    const { data: lastV } = await supabase
      .from("project_snapshots")
      .select("version")
      .eq("project_id", snap.project_id)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    const safeVersion = (lastV?.version ?? 0) + 1;
    const safePath = `${userId}/${snap.project_id}/v${safeVersion}-pre-restore-${Date.now()}.json`;

    const { data: curProject } = await supabase
      .from("projects").select("*").eq("id", snap.project_id).maybeSingle();
    const { data: curConvs = [] } = await supabase
      .from("conversations").select("*").eq("project_id", snap.project_id);
    const curConvIds = (curConvs ?? []).map((c: any) => c.id);
    let curMsgs: any[] = [];
    if (curConvIds.length > 0) {
      const { data: m = [] } = await supabase
        .from("messages").select("*").in("conversation_id", curConvIds);
      curMsgs = m ?? [];
    }
    const safeJson = JSON.stringify({
      version: safeVersion,
      created_at: new Date().toISOString(),
      project: curProject,
      conversations: curConvs,
      messages: curMsgs,
    });
    const safeBytes = new TextEncoder().encode(safeJson);
    await supabase.storage
      .from("project-snapshots")
      .upload(safePath, safeBytes, { contentType: "application/json", upsert: false });
    await supabase.from("project_snapshots").insert({
      owner_id: userId,
      project_id: snap.project_id,
      label: `Auto pre-restore v${snap.version}`,
      version: safeVersion,
      storage_path: safePath,
      size_bytes: safeBytes.byteLength,
      messages_count: curMsgs.length,
    });

    // Restore : update project + remplace conversations/messages
    await supabase
      .from("projects")
      .update({
        name: payload.project.name,
        description: payload.project.description,
        metadata: payload.project.metadata,
        type: payload.project.type,
        status: payload.project.status,
      })
      .eq("id", snap.project_id);

    if (curConvIds.length > 0) {
      await supabase.from("messages").delete().in("conversation_id", curConvIds);
      await supabase.from("conversations").delete().in("id", curConvIds);
    }

    if (payload.conversations?.length) {
      await supabase.from("conversations").insert(payload.conversations);
    }
    if (payload.messages?.length) {
      // chunk par 500 pour éviter les payloads massifs
      const chunkSize = 500;
      for (let i = 0; i < payload.messages.length; i += chunkSize) {
        await supabase.from("messages").insert(payload.messages.slice(i, i + chunkSize));
      }
    }

    return { ok: true, restored_version: snap.version, safety_version: safeVersion };
  });

export const listProjectSnapshots = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ projectId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("project_snapshots")
      .select("*")
      .eq("project_id", data.projectId)
      .order("version", { ascending: false });
    if (error) throw new Error(error.message);
    return { snapshots: rows ?? [] };
  });
