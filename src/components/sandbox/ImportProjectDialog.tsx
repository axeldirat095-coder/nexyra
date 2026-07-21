/**
 * Import projet externe (ZIP ou URL GitHub) dans la mémoire RAG du projet actif.
 * Utilisé depuis DevWorkspace (bouton dans la barre d'outils Mémoire).
 */
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Upload, Github, LoaderCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  projectId: string | null;
  orgId: string | null;
  onImported?: () => void;
}

async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

export function ImportProjectDialog({ open, onOpenChange, projectId, orgId, onImported }: Props) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);

  const callImport = async (body: Record<string, unknown>) => {
    if (!projectId || !orgId) {
      toast.error("Sélectionne d'abord un projet.");
      return;
    }
    setBusy(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Connecte-toi d'abord.");
        return;
      }
      const res = await fetch("/api/import-project", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ ...body, project_id: projectId, org_id: orgId }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || `Import HTTP ${res.status}`);
        return;
      }
      toast.success(`✅ ${json.imported} fichier(s) indexé(s) — Elena connaît maintenant ce projet`);
      onImported?.();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur réseau");
    } finally {
      setBusy(false);
    }
  };

  const handleZip = async (file: File) => {
    if (file.size > 20 * 1024 * 1024) {
      toast.error("ZIP trop volumineux (max 20 MB)");
      return;
    }
    const base64 = await fileToBase64(file);
    await callImport({ kind: "zip", base64, source_label: file.name });
  };

  const handleGithub = async () => {
    if (!/^https?:\/\/github\.com\//.test(url)) {
      toast.error("URL GitHub invalide");
      return;
    }
    await callImport({ kind: "github", url });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg bg-card/95 backdrop-blur border-border/50">
        <DialogHeader>
          <DialogTitle className="gradient-text">Importer un projet externe</DialogTitle>
          <DialogDescription>
            Indexe un projet (ZIP ou repo GitHub public) dans la mémoire d'Elena. Elle pourra référencer sa
            structure et ses fichiers clés lors des prochaines réponses.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="zip" className="mt-3">
          <TabsList className="grid grid-cols-2">
            <TabsTrigger value="zip"><Upload className="mr-1.5 h-3.5 w-3.5" /> ZIP</TabsTrigger>
            <TabsTrigger value="github"><Github className="mr-1.5 h-3.5 w-3.5" /> GitHub</TabsTrigger>
          </TabsList>

          <TabsContent value="zip" className="space-y-3 pt-3">
            <Label className="text-xs">Glisse-dépose ou sélectionne un fichier .zip (max 20 MB)</Label>
            <label className="flex h-32 cursor-pointer items-center justify-center rounded-md border-2 border-dashed border-border/50 bg-secondary/10 transition-colors hover:border-glow-violet/40 hover:bg-secondary/20">
              <input
                type="file"
                accept=".zip"
                disabled={busy}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleZip(f);
                }}
                className="hidden"
              />
              <div className="text-center">
                {busy ? (
                  <LoaderCircle className="mx-auto h-6 w-6 animate-spin text-glow-violet" />
                ) : (
                  <Upload className="mx-auto h-6 w-6 text-muted-foreground" />
                )}
                <p className="mt-2 text-xs text-muted-foreground">
                  {busy ? "Import en cours…" : "Cliquer ou déposer un .zip"}
                </p>
              </div>
            </label>
            <p className="text-[11px] text-muted-foreground">
              30 fichiers max indexés (entrées, configs, src/components, src/routes, hooks, lib, migrations).
            </p>
          </TabsContent>

          <TabsContent value="github" className="space-y-3 pt-3">
            <Label className="text-xs">URL d'un repo GitHub public</Label>
            <Input
              type="url"
              placeholder="https://github.com/owner/repo"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={busy}
              className="font-mono text-xs"
            />
            <Button onClick={handleGithub} disabled={busy || !url.trim()} className="w-full">
              {busy ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Github className="h-3.5 w-3.5" />}
              {busy ? "Import en cours…" : "Importer ce repo"}
            </Button>
            <p className="text-[11px] text-muted-foreground">
              Branche par défaut (main/master). Repos privés : utilise plutôt l'export ZIP.
            </p>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
