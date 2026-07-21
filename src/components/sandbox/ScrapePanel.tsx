/**
 * Quick scraping panel for the dev workspace.
 * Calls /api/scrape (Firecrawl proxy) and renders markdown preview.
 */
import { useState } from "react";
import { useDraft } from "@/hooks/useDraft";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Globe, Search, Map as MapIcon, Send } from "lucide-react";

type Action = "scrape" | "search" | "map";

export function ScrapePanel({ onSendToElena }: { onSendToElena?: (text: string) => void } = {}) {
  const [action, setAction] = useState<Action>("scrape");
  const [input, setInput, clearInput] = useDraft(`scrape:${action}`);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string>("");

  const run = async () => {
    if (!input.trim()) return;
    setLoading(true);
    setResult("");
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) {
        toast.error("Connectez-vous pour utiliser le scraping");
        return;
      }

      const payload =
        action === "search"
          ? { query: input, limit: 5 }
          : action === "map"
            ? { url: input, limit: 50 }
            : { url: input, formats: ["markdown"], onlyMainContent: true };

      const res = await fetch("/api/scrape", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action, payload }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        toast.error(json.error || `Erreur ${res.status}`);
        setResult(JSON.stringify(json, null, 2));
        return;
      }

      // Normalize output preview
      const d = json.data?.data ?? json.data;
      let preview = "";
      if (action === "scrape") {
        preview = d?.markdown || d?.summary || JSON.stringify(d, null, 2);
      } else if (action === "search") {
        const items = d?.web ?? d ?? [];
        preview = (Array.isArray(items) ? items : []).map((r: { title?: string; url?: string; description?: string }) => `### ${r.title}\n${r.url}\n${r.description ?? ""}`).join("\n\n");
      } else if (action === "map") {
        const links = d?.links ?? [];
        preview = `${links.length} URLs trouvées:\n\n${links.slice(0, 100).join("\n")}`;
      }
      setResult(preview || JSON.stringify(d, null, 2));
      clearInput();
      toast.success("Scrape réussi");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur réseau");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="p-4 space-y-3 bg-card/50 backdrop-blur border-border/50">
      <div className="flex items-center gap-2">
        <Globe className="h-4 w-4 text-primary" />
        <h3 className="font-semibold text-sm">Scraping web (Firecrawl)</h3>
      </div>

      <Tabs value={action} onValueChange={(v) => setAction(v as Action)}>
        <TabsList className="grid grid-cols-3 w-full h-8">
          <TabsTrigger value="scrape" className="text-xs gap-1"><Globe className="h-3 w-3" />Scrape</TabsTrigger>
          <TabsTrigger value="search" className="text-xs gap-1"><Search className="h-3 w-3" />Search</TabsTrigger>
          <TabsTrigger value="map" className="text-xs gap-1"><MapIcon className="h-3 w-3" />Map</TabsTrigger>
        </TabsList>

        <TabsContent value={action} className="mt-3 space-y-2">
          <div className="flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={action === "search" ? "ex: meilleur four à pizza" : "https://example.com"}
              onKeyDown={(e) => e.key === "Enter" && run()}
              className="text-sm"
            />
            <Button onClick={run} disabled={loading || !input.trim()} size="sm">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Lancer"}
            </Button>
          </div>
          {result && (
            <>
              <pre className="text-xs bg-muted/50 p-3 rounded-md max-h-64 overflow-auto whitespace-pre-wrap font-mono">
                {result}
              </pre>
              {onSendToElena && (
                <Button
                  size="sm"
                  variant="secondary"
                  className="w-full gap-1.5"
                  onClick={() => {
                    const snippet = result.slice(0, 4000);
                    onSendToElena(
                      `Voici du contenu scrapé que je veux que tu analyses :\n\n\`\`\`\n${snippet}\n\`\`\``,
                    );
                    toast.success("Contenu envoyé à Elena");
                  }}
                >
                  <Send className="h-3 w-3" />
                  Envoyer à Elena comme contexte
                </Button>
              )}
            </>
          )}
        </TabsContent>
      </Tabs>
    </Card>
  );
}
