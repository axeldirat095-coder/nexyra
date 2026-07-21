/**
 * WorkspaceChatE2B — wrapper de Dev3Chat scopé au projet actif de /dev2.
 * Notifie WorkspacePreview de recharger l'iframe à chaque mutation fichier
 * via l'event "nexyra:e2b-file-mutated".
 */
import { useEffect, useState } from "react";
import { Dev3Chat } from "@/components/dev3/Dev3Chat";

const ACTIVE_PROJECT_KEY = "nexyra:dev2:active-project";

function getActiveProjectId(): string {
  if (typeof window === "undefined") return "dev2-default";
  return localStorage.getItem(ACTIVE_PROJECT_KEY) ?? "dev2-default";
}

export function WorkspaceChatE2B() {
  const [projectId, setProjectId] = useState<string>(() => getActiveProjectId());

  useEffect(() => {
    const onChange = (ev: Event) => {
      const detail = (ev as CustomEvent<{ projectId: string | null }>).detail;
      setProjectId(detail?.projectId ?? "dev2-default");
    };
    window.addEventListener("nexyra:active-project-changed", onChange);
    return () => window.removeEventListener("nexyra:active-project-changed", onChange);
  }, []);

  return (
    <Dev3Chat
      key={projectId}
      projectId={projectId}
      onFileMutated={(path) => {
        window.dispatchEvent(
          new CustomEvent("nexyra:e2b-file-mutated", { detail: { path } }),
        );
      }}
    />
  );
}
