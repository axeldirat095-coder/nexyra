/**
 * WorkspaceCodeView — minimal read/write file browser for /dev2.
 * Lists files under src/ and edits them via WorkspaceContext.writeFile.
 * Lightweight (no Monaco) — tracks open file + textarea editor.
 */
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { FileText, FolderOpen, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { e2bListFiles, e2bReadFile, e2bWriteFile } from "@/lib/e2b.functions";
import { cn } from "@/lib/utils";

const ACTIVE_PROJECT_KEY = "nexyra:dev2:active-project";

function getActiveProjectId(): string {
  if (typeof window === "undefined") return "dev2-default";
  return localStorage.getItem(ACTIVE_PROJECT_KEY) ?? "dev2-default";
}

export function WorkspaceCodeView() {
  const listFiles = useServerFn(e2bListFiles);
  const readFile = useServerFn(e2bReadFile);
  const writeFile = useServerFn(e2bWriteFile);
  const [projectId, setProjectId] = useState<string>(() => getActiveProjectId());
  const [tree, setTree] = useState<string[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const onChange = (ev: Event) => {
      const detail = (ev as CustomEvent<{ projectId: string | null }>).detail;
      const next = detail?.projectId ?? "dev2-default";
      setProjectId(next);
      setActive(null);
      setContent("");
      setDirty(false);
      setTree([]);
    };
    window.addEventListener("nexyra:active-project-changed", onChange);
    return () => window.removeEventListener("nexyra:active-project-changed", onChange);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setReady(false);
    try {
      const res = await listFiles({ data: { projectId } });
      setTree(res.files.sort());
      setReady(true);
    } catch (e) {
      toast.error(`Liste des fichiers échouée: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  }, [listFiles, projectId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const open = async (path: string) => {
    if (dirty && !window.confirm("Modifications non sauvegardées. Changer de fichier ?")) return;
    try {
      const res = await readFile({ data: { projectId, path } });
      setActive(path);
      setContent(res.contents);
      setDirty(false);
    } catch (e) {
      toast.error(`Lecture échouée: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const save = async () => {
    if (!active) return;
    setSaving(true);
    try {
      await writeFile({ data: { projectId, path: active, contents: content } });
      setDirty(false);
      window.dispatchEvent(new CustomEvent("nexyra:e2b-file-mutated"));
      toast.success(`${active} sauvegardé`);
    } catch (e) {
      toast.error(`Échec: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
    }
  };

  if (!ready && loading) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-slate-500">
        <Loader2 className="mr-2 h-3 w-3 animate-spin" />
        Chargement des fichiers du projet…
      </div>
    );
  }

  return (
    <div className="flex h-full">
      <div className="flex w-56 shrink-0 flex-col border-r border-slate-800 bg-slate-950/50">
        <div className="flex items-center justify-between border-b border-slate-800 px-2.5 py-1.5">
          <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            <FolderOpen className="h-3 w-3" /> Fichiers
          </span>
          <button onClick={refresh} className="text-[10px] text-slate-500 hover:text-slate-200" title="Rafraîchir">
            ↻
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-1 py-1">
          {loading && <div className="px-2 py-2 text-[11px] text-slate-500">Chargement…</div>}
          {tree.map((p) => (
            <button
              key={p}
              onClick={() => open(p)}
              className={cn(
                "flex w-full items-center gap-1.5 rounded px-2 py-1 text-left font-mono text-[11px]",
                active === p
                  ? "bg-violet-500/10 text-violet-200"
                  : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-100",
              )}
            >
              <FileText className="h-3 w-3 shrink-0" />
              <span className="truncate">{p}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-1 flex-col">
        <div className="flex items-center justify-between border-b border-slate-800 px-3 py-1.5">
          <span className="font-mono text-[11px] text-slate-400">
            {active ?? "Sélectionne un fichier"}
            {dirty && <span className="ml-1 text-amber-400">●</span>}
          </span>
          <button
            onClick={save}
            disabled={!active || !dirty || saving}
            className="flex items-center gap-1.5 rounded border border-slate-700 px-2 py-0.5 text-[11px] text-slate-200 hover:bg-slate-800 disabled:opacity-40"
          >
            <Save className="h-3 w-3" />
            {saving ? "…" : "Sauver"}
          </button>
        </div>
        {active ? (
          <textarea
            value={content}
            onChange={(e) => {
              setContent(e.target.value);
              setDirty(true);
            }}
            spellCheck={false}
            className="flex-1 resize-none bg-transparent p-3 font-mono text-[12px] leading-[1.55] text-slate-200 focus:outline-none"
            style={{ tabSize: 2 }}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center text-xs text-slate-500">
            Choisis un fichier dans l'arbre pour l'éditer
          </div>
        )}
      </div>
    </div>
  );
}
