import { lazy, Suspense } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { RequireAuth } from "@/components/RequireAuth";

const Workspace = lazy(() =>
  import("@/components/workspace/Workspace").then((m) => ({ default: m.Workspace })),
);

export const Route = createFileRoute("/dev")({
  component: Dev2Page,
  head: () => ({
    meta: [
      { title: "Nexyra AI — Dev 2.0" },
      {
        name: "description",
        content:
          "Workspace Elena V2 : vrai projet Vite + React dans un WebContainer, avec build et preview en direct.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

function Dev2Page() {
  return (
    <RequireAuth>
      <Suspense
        fallback={
          <div className="flex min-h-screen items-center justify-center bg-slate-950">
            <Loader2 className="h-6 w-6 animate-spin text-blue-400" />
          </div>
        }
      >
        <Workspace />
      </Suspense>
    </RequireAuth>
  );
}
