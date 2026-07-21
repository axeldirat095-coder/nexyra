/**
 * Télécharge des images de référence (souvent des chat-uploads sans extension
 * dans l'URL) et les retourne en Uint8Array + mediaType inférés via le header
 * Content-Type. Indispensable car les API vision OpenAI/Anthropic refusent
 * souvent les URLs sans extension ("Failed to download …").
 */
import { createClient } from "@supabase/supabase-js";

export type FetchedImage = { data: Uint8Array; mediaType: string; url: string };

type StorageRef = { bucket: string; objectPath: string };

function adminClient() {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function storageRefFromUrl(rawUrl: string): StorageRef | null {
  try {
    const u = new URL(rawUrl);
    const match = u.pathname.match(/\/storage\/v1\/object\/(?:public|sign)\/([^/]+)\/(.+)$/);
    if (!match) return null;
    return { bucket: decodeURIComponent(match[1]), objectPath: decodeURIComponent(match[2]) };
  } catch {
    return null;
  }
}

async function downloadFromStorage(rawUrl: string): Promise<FetchedImage | null> {
  const ref = storageRefFromUrl(rawUrl);
  if (!ref) return null;
  const sb = adminClient();
  let objectPath = ref.objectPath;
  let mediaTypeFromList: string | undefined;

  // Quand Elena recopie une URL d'image, le modèle coupe parfois la fin du nom
  // (`...file_abc` au lieu de `...file_abcdef.png`). On liste donc le dossier
  // et on retrouve le vrai fichier par préfixe via l'API Storage officielle.
  const slash = objectPath.lastIndexOf("/");
  if (slash > 0) {
    const dir = objectPath.slice(0, slash);
    const filenamePrefix = objectPath.slice(slash + 1);
    const { data: candidates } = await sb.storage.from(ref.bucket).list(dir, {
      limit: 10,
      search: filenamePrefix,
    });
    const candidate = candidates?.find((file) => file.name === filenamePrefix)
      ?? candidates?.find((file) => file.name.startsWith(filenamePrefix));
    if (candidate) {
      objectPath = `${dir}/${candidate.name}`;
      mediaTypeFromList = candidate.metadata?.mimetype;
    }
  }

  const { data, error } = await sb.storage.from(ref.bucket).download(objectPath);
  if (error || !data) return null;
  const mediaType = mediaTypeFromList?.startsWith("image/") ? mediaTypeFromList : data.type || "image/png";
  return { data: new Uint8Array(await data.arrayBuffer()), mediaType, url: rawUrl };
}

async function fetchOneImage(url: string): Promise<FetchedImage | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (res.ok) {
      const ct = res.headers.get("content-type")?.split(";")[0]?.trim() || "image/png";
      const mediaType = ct.startsWith("image/") ? ct : "image/png";
      return { data: new Uint8Array(await res.arrayBuffer()), mediaType, url };
    }
  } catch {
    // Fallback stockage interne ci-dessous.
  }
  return downloadFromStorage(url);
}

export async function fetchImagesAsBuffers(urls: string[]): Promise<FetchedImage[]> {
  const fetched = (await Promise.all(urls.map(fetchOneImage))).filter((img): img is FetchedImage => Boolean(img));
  if (fetched.length === 0) {
    throw new Error("Aucune image jointe n'a pu être lue. Réessaie en renvoyant l'image dans le chat.");
  }
  return fetched;
}
