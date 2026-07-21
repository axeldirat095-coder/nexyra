/**
 * useActiveProject — minimal active-project tracker for /dev2.
 * Persists last selected project per user in localStorage and exposes
 * the matching org id (personal org). Lightweight version of the /dev
 * activeProject state, scoped to workspace tooling (memory, ideas,
 * snapshots, import…).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { Database } from "@/integrations/supabase/types";

export type ProjectType = Database["public"]["Enums"]["project_type"];
export type ActiveProject = { id: string; name: string; type: ProjectType; metadata?: Record<string, unknown> | null };

const STORAGE_KEY = "nexyra:dev2:active-project";

function readNewProjectHint(): string | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  return params.get("project") || sessionStorage.getItem("nexyra:dev2:new-project");
}

function clearNewProjectHint(projectId: string) {
  if (typeof window === "undefined") return;
  if (sessionStorage.getItem("nexyra:dev2:new-project") === projectId) {
    sessionStorage.removeItem("nexyra:dev2:new-project");
  }
  const url = new URL(window.location.href);
  if (url.searchParams.get("project") === projectId) {
    url.searchParams.delete("project");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }
}

export function useActiveProject() {
  const { user } = useAuth();
  const [active, setActive] = useState<ActiveProject | null>(null);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [projects, setProjects] = useState<ActiveProject[]>([]);
  const [loading, setLoading] = useState(false);
  const pendingCreatedProjectRef = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data: org } = await supabase
      .from("organizations")
      .select("id")
      .eq("owner_id", user.id)
      .eq("is_personal", true)
      .maybeSingle();
    if (org) setOrgId(org.id);
    const { data } = await supabase
      .from("projects")
      .select("id,name,type,metadata")
      .eq("owner_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(50);
    const list = (data ?? []) as ActiveProject[];
    setProjects(list);
    const newProjectHint = readNewProjectHint();
    const preferredId = pendingCreatedProjectRef.current ?? newProjectHint;
    const savedId = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    const restored =
      list.find((p) => p.id === preferredId) ??
      list.find((p) => p.id === savedId) ??
      list[0] ??
      null;
    pendingCreatedProjectRef.current = null;
    if (restored && restored.id === newProjectHint) clearNewProjectHint(restored.id);
    setActive(restored);
    // CRITIQUE : resync localStorage avec l'id réellement actif.
    // Sans ça, useWorkspaceAgent + WorkspaceContext lisent un id différent
    // (vide → "default", ou un id supprimé) et le chat / snapshot du projet
    // sont sauvegardés sous une clé fantôme, perdus au refresh.
    if (typeof window !== "undefined") {
      const prev = localStorage.getItem(STORAGE_KEY);
      if (restored) localStorage.setItem(STORAGE_KEY, restored.id);
      else localStorage.removeItem(STORAGE_KEY);
      const nextId = restored?.id ?? null;
      if (prev !== nextId) {
        window.dispatchEvent(new CustomEvent("nexyra:active-project-changed", { detail: { projectId: nextId } }));
      }
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const select = useCallback((p: ActiveProject | null) => {
    const prev = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    setActive(p);
    if (typeof window !== "undefined") {
      if (p) localStorage.setItem(STORAGE_KEY, p.id);
      else localStorage.removeItem(STORAGE_KEY);
      const nextId = p?.id ?? null;
      if (prev !== nextId) {
        // Different project → reboot workspace + reload chat scoped to new project.
        window.location.reload();
      }
    }
  }, []);

  const activateCreatedProject = useCallback((projectId: string) => {
    pendingCreatedProjectRef.current = projectId;
    if (typeof window !== "undefined") {
      sessionStorage.setItem("nexyra:dev2:new-project", projectId);
    }
  }, []);

  return { active, orgId, projects, loading, select, refresh, activateCreatedProject };
}
