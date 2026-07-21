import { useEffect, useState } from "react";
import { Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface ProjectCostBadgeProps {
  projectId: string;
  className?: string;
}

interface Row {
  total_cost_eur: number;
  ai_cost_usd: number;
  image_count: number;
}

export function ProjectCostBadge({ projectId, className = "" }: ProjectCostBadgeProps) {
  const [row, setRow] = useState<Row | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from("project_cost_estimates")
        .select("total_cost_eur, ai_cost_usd, image_count")
        .eq("project_id", projectId)
        .maybeSingle();
      if (!cancelled) setRow(data ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const eur = Number(row?.total_cost_eur ?? 0);

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border border-border/50 bg-card/40 px-2 py-0.5 text-[11px] text-muted-foreground backdrop-blur-md ${className}`}
      title={`IA : $${Number(row?.ai_cost_usd ?? 0).toFixed(3)} · ${row?.image_count ?? 0} images`}
    >
      <Wallet className="h-3 w-3" />
      ≈ {eur.toFixed(eur < 1 ? 3 : 2)} €
    </span>
  );
}
