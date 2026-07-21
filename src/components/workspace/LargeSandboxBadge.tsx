import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Loader2, Server } from "lucide-react";
import { e2bLargeSandboxStatus } from "@/lib/sandbox-status.functions";

type Status = { ready: boolean; checkedAt: string } | null;

export function LargeSandboxBadge() {
  const check = useServerFn(e2bLargeSandboxStatus);
  const [status, setStatus] = useState<Status>(null);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const res = await check();
        if (alive) setStatus(res);
      } catch {
        /* ignore */
      }
    };
    tick();
    const id = setInterval(tick, 30_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [check]);

  if (!status) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-slate-700/30 px-2 py-1 text-slate-400 ring-1 ring-slate-600/40">
        <Server className="h-3 w-3" /> Sandbox…
      </span>
    );
  }

  if (status.ready) {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-1 text-emerald-300 ring-1 ring-emerald-500/30"
        title="La grosse sandbox (4 CPU / 4 Go RAM) est prête — les gros projets démarrent normalement."
      >
        <CheckCircle2 className="h-3 w-3" /> Sandbox XL prête
      </span>
    );
  }

  return (
    <span
      className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-2 py-1 text-amber-300 ring-1 ring-amber-500/30"
      title="La grosse sandbox est en cours de construction (5–10 min la 1ère fois). Les gros projets retombent sur la petite sandbox en attendant."
    >
      <Loader2 className="h-3 w-3 animate-spin" /> Sandbox XL en construction
    </span>
  );
}
