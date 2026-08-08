import { config } from "../config.js";
import natural from "natural";

const { TfIdf } = natural;

/**
 * Fetch embeddings using Gemini API (text-embedding-004)
 * If no key is set or execution fails, it returns null.
 */
export async function getEmbedding(text: string, taskType: "RETRIEVAL_QUERY" | "RETRIEVAL_DOCUMENT" = "RETRIEVAL_DOCUMENT"): Promise<number[] | null> {
  if (!config.GEMINI_API_KEY) {
    return null;
  }

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:embedContent?key=${config.GEMINI_API_KEY}`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "models/gemini-embedding-2",
        content: {
          parts: [{ text }],
        },
        task_type: taskType,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.warn(`Gemini Embedding API returned status ${response.status}: ${errText}`);
      return null;
    }

    const json = (await response.json()) as any;
    if (json.embedding && Array.isArray(json.embedding.values)) {
      return json.embedding.values as number[];
    }

    return null;
  } catch (error) {
    console.error("Error fetching Gemini embedding:", error);
    return null;
  }
}

/**
 * Calculates cosine similarity between two float arrays.
 */
export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length) {
    return 0;
  }
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) {
    return 0;
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Fallback keyword TF-IDF similarity matcher using the natural library.
 * Ranks schemes based on the word usage similarity.
 */
export function rankSchemesTfIdf(
  query: string,
  schemes: { id: string; name: string; description: string }[]
): { schemeId: string; score: number }[] {
  const tfidf = new TfIdf();
  
  // Add scheme descriptions as documents
  schemes.forEach((s) => {
    tfidf.addDocument(`${s.name} ${s.description}`);
  });

  const results: { schemeId: string; score: number }[] = [];
  
  // tfidf.tfidfs calculates TF-IDF scores for the query terms across all documents
  tfidf.tfidfs(query, (i, score) => {
    results.push({
      schemeId: schemes[i].id,
      // Normalize score to look like [0, 1] range relative value
      score: score > 0 ? Math.min(score / 5, 1.0) : 0,
    });
  });

  // Sort by score descending
  return results.sort((a, b) => b.score - a.score);
}
