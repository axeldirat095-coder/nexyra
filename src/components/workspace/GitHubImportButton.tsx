/**
 * Bouton "Importer depuis GitHub" + dialog d'import.
 *
 * Parcours utilisateur :
 *  1. Pas connecté → bouton "Connecter GitHub" qui ouvre l'autorisation OAuth.
 *  2. Connecté → liste des repos, recherche, sélection branche, import.
 *  3. Pendant l'import → barre d'étapes (Clone → Install → Prêt).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Github, LoaderCircle, Search, GitBranch, Lock, Globe, CheckCircle2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getGithubConnection,
  startGithubOAuth,
  listGithubRepos,
  listGithubBranches,
  importGithubRepo,
} from "@/lib/github.functions";
import type { ActiveProject } from "./useActiveProject";

type Repo = {
  id: number;
  name: string;
  fullName: string;
  owner: string;
  ownerAvatar: string;
  private: boolean;
  defaultBranch: string;
  description: string | null;
  pushedAt: string;
  htmlUrl: string;
};

export function GitHubImportButton({ active }: { active: ActiveProject | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedRepo, setSelectedRepo] = useState<Repo | null>(null);
  const [selectedBranch, setSelectedBranch] = useState<string>("");
  const [importing, setImporting] = useState(false);
  const [importStep, setImportStep] = useState<string | null>(null);

  const getConnFn = useServerFn(getGithubConnection);
  const startOAuthFn = useServerFn(startGithubOAuth);
  const listReposFn = useServerFn(listGithubRepos);
  const listBranchesFn = useServerFn(listGithubBranches);
  const importFn = useServerFn(importGithubRepo);

  // Lit ?github=connected ou ?github=error au retour de l'OAuth
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const ghStatus = url.searchParams.get("github");
    if (!ghStatus) return;
    const user = url.searchParams.get("user");
    const reason = url.searchParams.get("reason");
    url.searchParams.delete("github");
    url.searchParams.delete("user");
    url.searchParams.delete("reason");
    window.history.replaceState({}, "", url.toString());
    if (ghStatus === "connected") {
      toast.success(`GitHub connecté${user ? ` (@${user})` : ""}`);
      setOpen(true);
    } else {
      toast.error(`Connexion GitHub échouée : ${reason ?? "erreur inconnue"}`);
    }
  }, []);

  const connQuery = useQuery({
    queryKey: ["github", "connection"],
    queryFn: () => getConnFn(),
    enabled: open,
    staleTime: 30_000,
  });

  const reposQuery = useQuery({
    queryKey: ["github", "repos"],
    queryFn: () => listReposFn(),
    enabled: open && connQuery.data?.connected === true,
    staleTime: 60_000,
  });

  const branchesQuery = useQuery({
    queryKey: ["github", "branches", selectedRepo?.owner, selectedRepo?.name],
    queryFn: () =>
      listBranchesFn({ data: { owner: selectedRepo!.owner, repo: selectedRepo!.name } }),
    enabled: !!selectedRepo,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (branchesQuery.data?.branches?.length && !selectedBranch) {
      const def = selectedRepo?.defaultBranch;
      const fallback = branchesQuery.data.branches[0];
      setSelectedBranch(def && branchesQuery.data.branches.includes(def) ? def : fallback);
    }
  }, [branchesQuery.data, selectedBranch, selectedRepo]);

  const connectMutation = useMutation({
    mutationFn: () => startOAuthFn(),
    onSuccess: (res) => {
      window.location.href = res.url;
    },
    onError: (err: Error) => toast.error(`Impossible de démarrer la connexion : ${err.message}`),
  });

  const handleImport = useCallback(async () => {
    if (!active || !selectedRepo || !selectedBranch) return;
    setImporting(true);
    setImportStep("Téléchargement du code (git clone)…");
    // Watchdog : si le serveur ne répond pas en 90s, on remonte une erreur visible.
    const timeoutId = setTimeout(() => {
      toast.error("Import trop long — le serveur ne répond pas après 90s. Réessaie ou prends un repo plus petit.");
    }, 90_000);
    try {
      const res = await importFn({
        data: {
          owner: selectedRepo.owner,
          repo: selectedRepo.name,
          branch: selectedBranch,
          projectId: active.id,
        },
      });
      setImportStep("Préparation du mode édition…");
      if (res.cloneExitCode !== 0) throw new Error("git clone a échoué");
      toast.success(`Repo "${selectedRepo.fullName}" importé !`, {
        description: `${res.importedFileCount ?? ""} fichiers importés. Mode édition en préparation.`,
      });
      window.dispatchEvent(
        new CustomEvent("nexyra:e2b-project-imported", { detail: { projectId: active.id } }),
      );
      setOpen(false);
      setSelectedRepo(null);
      setSelectedBranch("");
      router.invalidate();
    } catch (err) {
      console.error("[GitHubImport] failed", err);
      toast.error(`Import échoué : ${err instanceof Error ? err.message : "erreur inconnue"}`);
    } finally {
      clearTimeout(timeoutId);
      setImporting(false);
      setImportStep(null);
    }
  }, [active, importFn, router, selectedRepo, selectedBranch]);

  const filteredRepos = useMemo(() => {
    const all = (reposQuery.data?.repos ?? []) as Repo[];
    if (!search) return all;
    const q = search.toLowerCase();
    return all.filter(
      (r) =>
        r.fullName.toLowerCase().includes(q) ||
        (r.description ?? "").toLowerCase().includes(q),
    );
  }, [reposQuery.data, search]);

  const disabled = !active;

  return (
    <>
      <button
        type="button"
        title={
          disabled
            ? "Sélectionne un projet d'abord"
            : "Importer un projet depuis GitHub"
        }
        aria-label="Importer depuis GitHub"
        onClick={() => setOpen(true)}
        disabled={disabled}
        className="flex h-9 w-9 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Github className="h-4 w-4" />
      </button>

      <Dialog open={open} onOpenChange={(v) => !importing && setOpen(v)}>
        <DialogContent className="max-w-2xl border-slate-800 bg-slate-950 text-slate-100">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Github className="h-5 w-5" />
              Importer depuis GitHub
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              Charge un projet GitHub dans la preview pour qu'Elena puisse le modifier.
            </DialogDescription>
          </DialogHeader>

          {/* Étape 1 : pas connecté */}
          {!connQuery.isLoading && connQuery.data?.connected === false && (
            <div className="flex flex-col items-center gap-4 py-8 text-center">
              <p className="text-sm text-slate-300">
                Connecte ton compte GitHub pour voir tes repos (publics &amp; privés).
              </p>
              <Button
                onClick={() => connectMutation.mutate()}
                disabled={connectMutation.isPending}
                className="bg-slate-800 hover:bg-slate-700"
              >
                {connectMutation.isPending ? (
                  <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Github className="mr-2 h-4 w-4" />
                )}
                Connecter GitHub
              </Button>
            </div>
          )}

          {/* Étape 2 : connecté, liste des repos */}
          {connQuery.data?.connected === true && !selectedRepo && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                Connecté en tant que <span className="font-medium text-slate-200">@{connQuery.data.username}</span>
              </div>
              <div className="relative">
                <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <Input
                  placeholder="Rechercher un repo…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="border-slate-800 bg-slate-900 pl-8 text-slate-100"
                />
              </div>
              <div className="max-h-[400px] overflow-y-auto rounded-md border border-slate-800">
                {reposQuery.isLoading && (
                  <div className="flex items-center justify-center py-12 text-sm text-slate-400">
                    <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                    Chargement des repos…
                  </div>
                )}
                {reposQuery.data && filteredRepos.length === 0 && (
                  <p className="py-12 text-center text-sm text-slate-500">
                    Aucun repo trouvé.
                  </p>
                )}
                {filteredRepos.map((repo) => (
                  <button
                    key={repo.id}
                    type="button"
                    onClick={() => setSelectedRepo(repo)}
                    className="flex w-full items-start gap-3 border-b border-slate-800 p-3 text-left transition-colors last:border-b-0 hover:bg-slate-900"
                  >
                    <div className="mt-0.5 text-slate-500">
                      {repo.private ? (
                        <Lock className="h-3.5 w-3.5" />
                      ) : (
                        <Globe className="h-3.5 w-3.5" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-slate-100">
                        {repo.fullName}
                      </div>
                      {repo.description && (
                        <div className="mt-0.5 line-clamp-1 text-xs text-slate-500">
                          {repo.description}
                        </div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Étape 3 : choix branche + import */}
          {selectedRepo && (
            <div className="space-y-4">
              <div className="rounded-md border border-slate-800 bg-slate-900 p-3">
                <div className="text-sm font-medium text-slate-100">{selectedRepo.fullName}</div>
                {selectedRepo.description && (
                  <div className="mt-1 text-xs text-slate-500">{selectedRepo.description}</div>
                )}
              </div>

              <div className="space-y-2">
                <label className="flex items-center gap-2 text-xs font-medium text-slate-400">
                  <GitBranch className="h-3.5 w-3.5" />
                  Branche à importer
                </label>
                {branchesQuery.isLoading ? (
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <LoaderCircle className="h-3 w-3 animate-spin" />
                    Chargement des branches…
                  </div>
                ) : branchesQuery.data?.branches?.length === 0 ? (
                  <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200">
                    Ce repo GitHub est <strong>vide</strong> (aucun commit poussé). Pousse au moins un commit sur GitHub avant d'importer.
                  </div>
                ) : (
                  <Select value={selectedBranch} onValueChange={setSelectedBranch}>
                    <SelectTrigger className="border-slate-800 bg-slate-900 text-slate-100">
                      <SelectValue placeholder="Choisir une branche" />
                    </SelectTrigger>
                    <SelectContent className="border-slate-800 bg-slate-950 text-slate-100">
                      {branchesQuery.data?.branches.map((b) => (
                        <SelectItem key={b} value={b}>
                          {b}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              {importing && importStep && (
                <div className="flex items-center gap-2 rounded-md border border-blue-500/40 bg-blue-500/10 p-3 text-sm text-blue-300">
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                  {importStep}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="ghost"
                  onClick={() => setSelectedRepo(null)}
                  disabled={importing}
                  className="text-slate-400 hover:text-slate-100"
                >
                  Retour
                </Button>
                <Button
                  onClick={handleImport}
                  disabled={importing || !selectedBranch || !active}
                  className="bg-gradient-to-r from-blue-600 to-violet-600 text-white hover:opacity-90"
                >
                  {importing ? (
                    <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                  ) : null}
                  Importer dans Nexyra
                </Button>
              </div>
            </div>
          )}

          {connQuery.isLoading && (
            <div className="flex items-center justify-center py-12 text-sm text-slate-400">
              <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
              Vérification de la connexion GitHub…
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
