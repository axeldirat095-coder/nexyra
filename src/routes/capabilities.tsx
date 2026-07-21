import { createFileRoute } from "@tanstack/react-router";
import { DevCapabilities } from "@/components/DevCapabilities";

export const Route = createFileRoute("/capabilities")({
  component: CapabilitiesPage,
  head: () => ({
    meta: [
      { title: "Nexyra AI — Développement & Capacités" },
      {
        name: "description",
        content:
          "Vue d'ensemble du développement Nexyra : ce qui est fait, ce qu'Elena sait créer, ce qu'il reste à faire.",
      },
    ],
  }),
});

function CapabilitiesPage() {
  return <DevCapabilities />;
}
