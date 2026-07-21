/**
 * Embeddings helper — utilise OpenAI text-embedding-3-small (1536 dims, ~$0.02/1M tokens).
 * Si pas de clé OpenAI admin disponible, retourne null (le RAG retombe sur FTS).
 */

export async function generateEmbedding(
  text: string,
  apiKey: string,
): Promise<number[] | null> {
  const trimmed = text.trim().slice(0, 8000); // ~2k tokens max, économique
  if (!trimmed) return null;

  try {
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "text-embedding-3-small",
        input: trimmed,
      }),
    });
    if (!res.ok) {
      console.warn("embedding api error", res.status);
      return null;
    }
    const json = await res.json();
    const vec = json.data?.[0]?.embedding;
    return Array.isArray(vec) ? (vec as number[]) : null;
  } catch (e) {
    console.warn("embedding fatal", e);
    return null;
  }
}

/** Format Postgres vector literal: "[0.1,0.2,...]" */
export function toPgVector(vec: number[]): string {
  return `[${vec.join(",")}]`;
}

/**
 * Batch embeddings — 1 seul appel HTTP pour N textes (jusqu'à 2048 inputs côté OpenAI).
 * Beaucoup moins cher en latence + frais fixes que N appels séparés.
 * Retourne un tableau aligné sur l'input ; les entrées vides ou échouées sont `null`.
 */
export async function generateEmbeddingsBatch(
  texts: string[],
  apiKey: string,
  batchSize = 20,
): Promise<Array<number[] | null>> {
  const results: Array<number[] | null> = new Array(texts.length).fill(null);
  // Pré-trim
  const cleaned = texts.map((t) => (t ?? "").trim().slice(0, 8000));

  for (let start = 0; start < cleaned.length; start += batchSize) {
    const slice = cleaned.slice(start, start + batchSize);
    // Garde l'index original pour les non-vides
    const indexed = slice
      .map((t, i) => ({ text: t, idx: start + i }))
      .filter((x) => x.text.length > 0);
    if (indexed.length === 0) continue;

    try {
      const res = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "text-embedding-3-small",
          input: indexed.map((x) => x.text),
        }),
      });
      if (!res.ok) {
        console.warn("batch embedding api error", res.status);
        continue;
      }
      const json = await res.json();
      const data = json.data as Array<{ index: number; embedding: number[] }> | undefined;
      if (!Array.isArray(data)) continue;
      for (const row of data) {
        const original = indexed[row.index]?.idx;
        if (typeof original === "number" && Array.isArray(row.embedding)) {
          results[original] = row.embedding;
        }
      }
    } catch (e) {
      console.warn("batch embedding fatal", e);
    }
  }
  return results;
}
