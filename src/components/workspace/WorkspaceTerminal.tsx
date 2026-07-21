import { useEffect, useRef } from "react";
import { useWorkspace } from "./WorkspaceContext";
import { cn } from "@/lib/utils";

export function WorkspaceTerminal() {
  const { logs, status, error } = useWorkspace();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [logs]);

  return (
    <div className="flex h-full flex-col bg-slate-950 font-mono text-xs text-slate-300">
      <div className="flex items-center justify-between border-b border-slate-800 px-3 py-2">
        <span className="text-slate-500">Terminal</span>
        <span
          className={cn(
            "rounded px-2 py-0.5 text-[10px] uppercase tracking-wider",
            status === "ready" && "bg-emerald-500/15 text-emerald-300",
            status === "error" && "bg-red-500/15 text-red-300",
            status !== "ready" && status !== "error" && "bg-slate-700/50 text-slate-300",
          )}
        >
          {status}
        </span>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-auto px-3 py-2">
        {logs.map((l) => (
          <div
            key={l.id}
            className={cn(
              "whitespace-pre-wrap leading-relaxed",
              l.kind === "info" && "text-blue-300",
              l.kind === "err" && "text-red-300",
              l.kind === "out" && "text-slate-300",
            )}
          >
            {l.line}
          </div>
        ))}
        {error && <div className="mt-2 text-red-400">⚠ {error}</div>}
      </div>
    </div>
  );
}
