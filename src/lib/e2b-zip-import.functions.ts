/**
 * Import d'un ZIP utilisateur dans la sandbox E2B du projet actif.
 *
 * Permet d'importer n'importe quel projet (téléchargé depuis GitHub, lovable, etc.)
 * sans avoir à connecter un compte GitHub. Le ZIP est décodé serveur-side,
 * uploadé dans /tmp de la sandbox, puis décompressé dans /home/user/app.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const MAX_ZIP_BYTES = 60 * 1024 * 1024; // 60 MB

export const importZipToSandbox = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        projectId: z.string().min(1).max(120),
        filename: z.string().min(1).max(255),
        // ZIP encodé en base64 (max ~60 MB après décodage)
        base64: z.string().min(10),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { ensureSandbox, runCommand, isLargeSandboxReady } = await import("@/server/e2b-sandbox.server");

    // Décodage base64 → bytes
    const bin = atob(data.base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    if (bytes.byteLength > MAX_ZIP_BYTES) {
      throw new Error(`ZIP trop volumineux (${(bytes.byteLength / 1024 / 1024).toFixed(1)} MB, max 60 MB).`);
    }

    // Pré-vol : si le ZIP est lourd (>5 MB) et que la sandbox XL n'est pas
    // encore prête, on refuse — sinon l'install va saturer la petite sandbox
    // et l'utilisateur va perdre 5 min à attendre un échec mémoire.
    if (bytes.byteLength > 5 * 1024 * 1024) {
      const { ready } = await isLargeSandboxReady();
      if (!ready) {
        throw new Error(
          "Sandbox XL pas encore prête (construction en cours, 5–10 min la 1ère fois). Attends que l'indicateur en haut passe au vert puis réessaie.",
        );
      }
    }

    const { sandbox } = await ensureSandbox(context.userId, data.projectId);


    // 1. Upload du zip dans /tmp
    const zipPath = "/tmp/nexyra-import.zip";
    await sandbox.files.write(zipPath, bytes as unknown as string);

    // 2. Wipe app + décompression. Beaucoup de zips GitHub contiennent un seul
    //    dossier racine (ex: repo-main/). On extrait dans /tmp/extract puis on
    //    "remonte" ce dossier racine s'il y en a un.
    const script = `
set -e
if test -f /tmp/vite.pid; then kill "$(cat /tmp/vite.pid)" 2>/dev/null || true; fi
rm -f /tmp/nexyra-install.log /tmp/nexyra-install.pid /tmp/nexyra-install.done /tmp/nexyra-install.failed /tmp/vite.log /tmp/vite.pid
rm -rf /tmp/extract /home/user/app_new /home/user/app.bak 2>/dev/null || true
mkdir -p /tmp/extract
( command -v unzip >/dev/null && unzip -q -o ${zipPath} -d /tmp/extract ) || python3 -m zipfile -e ${zipPath} /tmp/extract
# Si la racine ne contient qu'un seul dossier, on l'utilise comme app root.
entries=$(ls -1 /tmp/extract | wc -l)
if [ "$entries" = "1" ] && [ -d "/tmp/extract/$(ls -1 /tmp/extract)" ]; then
  mv "/tmp/extract/$(ls -1 /tmp/extract)" /home/user/app_new
else
  mv /tmp/extract /home/user/app_new
fi
# .git interne d'un autre projet : on le supprime pour ne pas polluer.
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
      timeoutMs: 180_000,
    });
    if (res.exitCode !== 0) {
      const detail = (res.stderr || res.stdout || "").slice(-400);
      throw new Error(`Décompression échouée (code ${res.exitCode}) — ${detail || "pas de détail"}`);
    }
    const importedFileCount =
      Number.parseInt((res.stdout || "0").trim().split("\n").pop() || "0", 10) || 0;

    // Le ZIP vient d'être extrait dans la PETITE sandbox (créée au démarrage).
    // On relance ensureSandbox : il détecte `needsLargeSandbox` (marker +
    // nombre de fichiers + deps) et migre automatiquement le projet vers la
    // sandbox XL (4 CPU / 4 Go) si le template est prêt. Sinon le projet
    // reste sur la petite sandbox (et l'install sautera la mémoire).
    let migratedToLarge = false;
    try {
      const before = await ensureSandbox(context.userId, data.projectId);
      // Re-call after potential migration; `created: true` signifie nouvelle large sandbox
      migratedToLarge = before.created;
    } catch (err) {
      console.warn("[zip-import] migration check failed", err);
    }

    return { ok: true, importedFileCount, filename: data.filename, migratedToLarge };
  });
