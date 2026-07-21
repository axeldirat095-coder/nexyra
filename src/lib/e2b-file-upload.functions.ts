/**
 * Dépose un fichier (ex: .zip) dans la sandbox E2B du projet actif
 * sans rien écraser. Le fichier est écrit dans /home/user/app/_uploads/
 * pour qu'Elena puisse le manipuler (unzip_archive, lecture, etc.).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const MAX_BYTES = 50 * 1024 * 1024; // 50 MB

export const uploadFileToSandbox = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        projectId: z.string().min(1).max(120),
        filename: z.string().min(1).max(255),
        base64: z.string().min(4),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { ensureSandbox, runCommand } = await import("@/server/e2b-sandbox.server");

    const bin = atob(data.base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    if (bytes.byteLength > MAX_BYTES) {
      throw new Error(`Fichier trop volumineux (${(bytes.byteLength / 1024 / 1024).toFixed(1)} MB, max 50 MB).`);
    }

    const safeName = data.filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 200) || "upload.bin";
    const destDir = "/home/user/app/_uploads";
    const destPath = `${destDir}/${safeName}`;

    const { sandbox } = await ensureSandbox(context.userId, data.projectId);
    await runCommand(context.userId, data.projectId, `mkdir -p ${destDir}`, { timeoutMs: 10_000 });
    await sandbox.files.write(destPath, bytes as unknown as string);

    return { ok: true, path: destPath, bytes: bytes.byteLength, filename: safeName };
  });
