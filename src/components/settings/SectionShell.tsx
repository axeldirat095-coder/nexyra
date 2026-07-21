import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";

interface SectionShellProps {
  title: string;
  description: string;
  children?: ReactNode;
}

export function SectionShell({ title, description, children }: SectionShellProps) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      {children ?? (
        <Card className="border-dashed border-border/50 bg-card/30 p-10 text-center">
          <p className="text-sm text-muted-foreground">
            Squelette UI — la logique sera branchée dans un prochain chantier.
          </p>
        </Card>
      )}
    </div>
  );
}
