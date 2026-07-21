/**
 * Bouton "Importer un ZIP" — alternative à GitHub.
 * Permet de charger n'importe quel projet (téléchargé depuis GitHub, exporté,
 * etc.) dans la sandbox E2B du projet actif, sans connecter de compte.
 */
import { useCallback, useRef, useState } from "react";
import { FileArchive, LoaderCircle } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { importZipToSandbox } from "@/lib/e2b-zip-import.functions";
import type { ActiveProject } from "./useActiveProject";

async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  // Conversion par chunks pour ne pas saturer la stack JS sur gros fichiers
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)));
  }
  return btoa(bin);
}

export function ZipImportButton({ active }: { active: ActiveProject | null }) {
  const importFn = useServerFn(importZipToSandbox);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const disabled = !active;

  const handleFile = useCallback(
    async (file: File) => {
      if (!active) return;
      if (file.size > 60 * 1024 * 1024) {
        toast.error("ZIP trop volumineux (max 60 MB).");
        return;
      }
      setBusy(true);
      const tid = toast.loading(`Import de "${file.name}" en cours…`);
      try {
        const base64 = await fileToBase64(file);
        const res = await importFn({
          data: { projectId: active.id, filename: file.name, base64 },
        });
        const migrationNote = res.migratedToLarge
          ? " — projet migré sur la Sandbox XL (4 CPU / 4 Go)."
          : "";
        toast.success(
          `Projet importé (${res.importedFileCount} fichiers).${migrationNote} Mode édition en préparation.`,
          { id: tid },
        );
        window.dispatchEvent(
          new CustomEvent("nexyra:e2b-project-imported", { detail: { projectId: active.id } }),
        );
      } catch (err) {
        toast.error(`Import échoué : ${err instanceof Error ? err.message : "erreur inconnue"}`, {
          id: tid,
        });
      } finally {
        setBusy(false);
        if (inputRef.current) inputRef.current.value = "";
      }
    },
    [active, importFn],
  );

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".zip,application/zip"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
        }}
      />
      <button
        type="button"
        title={disabled ? "Sélectionne un projet d'abord" : "Importer un ZIP (projet exporté)"}
        aria-label="Importer un ZIP"
        onClick={() => inputRef.current?.click()}
        disabled={disabled || busy}
        className="flex h-9 w-9 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy ? (
          <LoaderCircle className="h-4 w-4 animate-spin" />
        ) : (
          <FileArchive className="h-4 w-4" />
        )}
      </button>
    </>
  );
}
