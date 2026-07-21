import { MessageCircle, Heart } from "lucide-react";

const DISCORD_URL =
  (typeof import.meta !== "undefined" && (import.meta.env?.VITE_DISCORD_URL as string)) ||
  "https://discord.gg/nexyra";

interface CommunityCTAProps {
  variant?: "card" | "inline";
  className?: string;
}

export function CommunityCTA({ variant = "card", className = "" }: CommunityCTAProps) {
  if (variant === "inline") {
    return (
      <a
        href={DISCORD_URL}
        target="_blank"
        rel="noopener noreferrer"
        className={`inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground ${className}`}
      >
        <MessageCircle className="h-4 w-4 text-[#5865F2]" />
        Rejoindre le Discord
      </a>
    );
  }

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-[#5865F2]/30 bg-gradient-to-br from-[#5865F2]/15 via-card/40 to-violet-500/10 p-6 backdrop-blur-md ${className}`}
    >
      <div className="absolute -top-12 -right-12 h-40 w-40 rounded-full bg-[#5865F2]/30 blur-3xl" />
      <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#5865F2]/20 ring-1 ring-[#5865F2]/40">
            <MessageCircle className="h-5 w-5 text-[#A5B4FC]" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-foreground">
              Communauté Nexyra sur Discord
            </h3>
            <p className="mt-1 max-w-md text-xs text-muted-foreground">
              Échange avec d'autres builders, partage tes projets, propose des features et
              vote pour celles que tu veux voir arriver.
            </p>
          </div>
        </div>
        <a
          href={DISCORD_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-gradient inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-semibold"
        >
          <Heart className="h-3.5 w-3.5" />
          Nous rejoindre
        </a>
      </div>
    </div>
  );
}
