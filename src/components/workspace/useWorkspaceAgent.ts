/**
 * useWorkspaceAgent — wrapper React (subscription) au-dessus de `agentStore`.
 *
 * La vraie boucle agent vit dans `workspaceAgentStore.ts` au niveau module,
 * donc elle continue de tourner même si l'utilisateur navigue entre les pages
 * de Nexyra (le composant peut se démonter sans interrompre Elena). Ce hook
 * n'est qu'une subscription qui re-render quand le state du projet actif
 * change.
 *
 * Limite : un refresh dur (F5) recharge le module ET le WebContainer → la
 * boucle ne survit pas. La persistance cross-refresh demanderait de déplacer
 * l'exécution des tools côté serveur.
 */
import { useCallback, useEffect, useState } from "react";
import { agentStore, getActiveProjectId } from "./workspaceAgentStore";

export type ToolDiff = {
  path: string;
  before: string;
  after: string;
  op: "write" | "edit" | "delete";
};

export type ChatToolCall = {
  id: string;
  name: string;
  args: unknown;
  result?: unknown;
  error?: string;
  status: "pending" | "running" | "awaiting_approval" | "done" | "error";
  diff?: ToolDiff;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "tool" | "system";
  content: string;
  images?: string[];
  toolCalls?: ChatToolCall[];
  toolCallId?: string;
  toolName?: string;
  createdAt: number;
};

const ACTIVE_PROJECT_KEY = "nexyra:dev2:active-project";

export function useWorkspaceAgent() {
  const [pid, setPid] = useState<string>(() => getActiveProjectId());
  const [state, setState] = useState(() => agentStore.getState(pid));

  // Re-subscribe à chaque changement de projet actif + tente une reprise
  // automatique si une boucle agent était en cours avant un refresh/fermeture.
  useEffect(() => {
    setState(agentStore.getState(pid));
    const unsub = agentStore.subscribe(pid, setState);
    // Charge depuis la DB Supabase (source de vérité — survit refresh,
    // cross-device, cross-browser). Le state local affiche déjà le cache
    // localStorage en attendant. Puis tente une reprise auto.
    void agentStore.loadFromDb(pid).then(() => {
      agentStore.tryResume(pid);
    });
    return () => {
      unsub();
    };
  }, [pid]);

  // Détecte le changement de projet actif (depuis useActiveProject).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onChange = () => {
      const next = getActiveProjectId();
      setPid(next);
      // Recharge depuis localStorage au cas où un autre onglet a écrit
      agentStore.reloadFromStorage(next);
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === ACTIVE_PROJECT_KEY) onChange();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("nexyra:active-project-changed", onChange);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("nexyra:active-project-changed", onChange);
    };
  }, []);

  const send = useCallback(
    (prompt: string, images?: string[]) => agentStore.send(pid, prompt, images),
    [pid],
  );
  const cancel = useCallback(() => agentStore.cancel(pid), [pid]);
  const reset = useCallback(() => agentStore.reset(pid), [pid]);
  const setSafeMode = useCallback((v: boolean) => agentStore.setSafeMode(pid, v), [pid]);
  const approveToolCall = useCallback(
    (id: string) => agentStore.approveToolCall(pid, id),
    [pid],
  );
  const rejectToolCall = useCallback(
    (id: string) => agentStore.rejectToolCall(pid, id),
    [pid],
  );

  return {
    messages: state.messages,
    busy: state.busy,
    error: state.error,
    safeMode: state.safeMode,
    lastTiming: state.lastTiming ?? null,
    send,
    cancel,
    reset,
    setSafeMode,
    approveToolCall,
    rejectToolCall,
  };
}

