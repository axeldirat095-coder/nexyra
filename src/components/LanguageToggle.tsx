import { Languages } from "lucide-react";
import { useI18n, type Lang } from "@/i18n/i18n";

export function LanguageToggle() {
  const { lang, setLang, t } = useI18n();
  return (
    <div className="flex items-center gap-2">
      <Languages className="h-4 w-4 text-muted-foreground" />
      <span className="text-sm text-foreground">{t("settings.language")} :</span>
      <div className="flex rounded-md border border-border/40 bg-card/40 p-0.5 text-xs">
        {(["fr", "en"] as Lang[]).map((l) => (
          <button
            key={l}
            onClick={() => setLang(l)}
            className={`rounded px-2 py-1 uppercase ${
              lang === l ? "bg-primary/15 text-primary" : "text-muted-foreground"
            }`}
          >
            {l}
          </button>
        ))}
      </div>
    </div>
  );
}
