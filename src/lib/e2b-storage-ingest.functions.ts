/**
 * Ingestion d'un fichier déposé sur Lovable Cloud Storage (bucket `elena-uploads`)
 * vers la sandbox E2B du projet actif.
 *
 * Pourquoi : pour les gros fichiers (>5 MB et jusqu'à plusieurs centaines de Mo),
 * on évite la limite des payloads HTTP base64. Le navigateur upload directement
 * dans Storage, puis appelle cette fonction qui télécharge serveur-side (réseau
 * interne rapide) et copie dans la sandbox. Si c'est un ZIP, décompression auto
 * dans /home/user/app (équivalent du flow `importZipToSandbox`).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const MAX_BYTES = 200 * 1024 * 1024; // 200 MB — large marge au-dessus des cas réels

export const ingestFromStorage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        projectId: z.string().min(1).max(120),
        storagePath: z.string().min(1).max(500),
        filename: z.string().min(1).max(255),
        // "deposit" → écrit dans _uploads/, "unzip" → décompresse dans /home/user/app
        mode: z.enum(["deposit", "unzip"]).default("deposit"),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { ensureSandbox, runCommand } = await import("@/server/e2b-sandbox.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Vérifie que le fichier appartient bien au user (préfixe userId/...).
    const expectedPrefix = `${context.userId}/`;
    if (!data.storagePath.startsWith(expectedPrefix)) {
      throw new Error("Accès refusé : ce fichier ne t'appartient pas.");
    }

    // 1. Télécharge depuis Storage (service role, contourne RLS — on a déjà vérifié le préfixe).
    const dl = await supabaseAdmin.storage.from("elena-uploads").download(data.storagePath);
    if (dl.error || !dl.data) {
      throw new Error(`Fichier introuvable sur le cloud : ${dl.error?.message ?? "inconnu"}`);
    }
    const arrayBuf = await dl.data.arrayBuffer();
    const bytes = new Uint8Array(arrayBuf);
    if (bytes.byteLength > MAX_BYTES) {
      throw new Error(
        `Fichier trop volumineux (${(bytes.byteLength / 1024 / 1024).toFixed(1)} MB, max ${MAX_BYTES / 1024 / 1024} MB).`,
      );
    }

    const safeName = data.filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 200) || "upload.bin";

    // 2. Récupère / réveille la sandbox du projet.
    const { sandbox } = await ensureSandbox(context.userId, data.projectId);

    if (data.mode === "unzip") {
      // Dépose dans /tmp puis décompresse dans /home/user/app (remplace le projet courant).
      const zipPath = `/tmp/${safeName}`;
      await sandbox.files.write(zipPath, bytes as unknown as string);

      const script = `
set -e
if test -f /tmp/vite.pid; then kill "$(cat /tmp/vite.pid)" 2>/dev/null || true; fi
rm -f /tmp/nexyra-install.log /tmp/nexyra-install.pid /tmp/nexyra-install.done /tmp/nexyra-install.failed /tmp/vite.log /tmp/vite.pid
rm -rf /tmp/extract /home/user/app_new /home/user/app.bak 2>/dev/null || true
mkdir -p /tmp/extract
( command -v unzip >/dev/null && unzip -q -o ${zipPath} -d /tmp/extract ) || python3 -m zipfile -e ${zipPath} /tmp/extract
entries=$(ls -1 /tmp/extract | wc -l)
if [ "$entries" = "1" ] && [ -d "/tmp/extract/$(ls -1 /tmp/extract)" ]; then
  mv "/tmp/extract/$(ls -1 /tmp/extract)" /home/user/app_new
else
  mv /tmp/extract /home/user/app_new
fi
rm -rf /home/user/app_new/.git 2>/dev/null || true
mv /home/user/app /home/user/app.bak 2>/dev/null || true
mv /home/user/app_new /home/user/app
rm -rf /home/user/app.bak
test -f /home/user/app/package.json || { echo "MISSING:package.json"; ls -la /home/user/app; exit 2; }
touch /home/user/app/.nexyra-readonly-import
find /home/user/app -path '*/node_modules' -prune -o -path '*/.git' -prune -o -type f -print | wc -l
`;
      const res = await runCommand(context.userId, data.projectId, script, {
        background: false,
        timeoutMs: 240_000,
      });
      if (res.exitCode !== 0) {
        const detail = (res.stderr || res.stdout || "").slice(-400);
        throw new Error(`Décompression échouée (code ${res.exitCode}) — ${detail || "pas de détail"}`);
      }
      const importedFileCount =
        Number.parseInt((res.stdout || "0").trim().split("\n").pop() || "0", 10) || 0;

      // Nettoie Storage après ingestion réussie pour ne pas garder le ZIP indéfiniment.
      void supabaseAdmin.storage.from("elena-uploads").remove([data.storagePath]).catch(() => {});

      return {
        ok: true as const,
        mode: "unzip" as const,
        path: "/home/user/app",
        bytes: bytes.byteLength,
        importedFileCount,
        filename: safeName,
      };
    }

    // mode "deposit" : copie simple dans /home/user/app/_uploads/
    const destDir = "/home/user/app/_uploads";
    const destPath = `${destDir}/${safeName}`;
    await runCommand(context.userId, data.projectId, `mkdir -p ${destDir}`, { timeoutMs: 10_000 });
    await sandbox.files.write(destPath, bytes as unknown as string);

    void supabaseAdmin.storage.from("elena-uploads").remove([data.storagePath]).catch(() => {});

    return {
      ok: true as const,
      mode: "deposit" as const,
      path: destPath,
      bytes: bytes.byteLength,
      filename: safeName,
    };
  });
