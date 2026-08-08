import { getEmbedding, cosineSimilarity, rankSchemesTfIdf } from "../../utils/embeddings.js";

export interface CitizenProfile {
  age?: number;
  income?: number;
  gender?: string;
  region?: string;
  category?: string; // e.g. General, OBC, SC, ST
  occupation?: string;
}

export interface EligibilityCriteria {
  minAge?: number;
  maxAge?: number;
  maxIncome?: number;
  genders?: string[];
  regions?: string[];
  categories?: string[];
  occupations?: string[];
}

export interface MatchableScheme {
  id: string;
  name: string;
  description: string;
  eligibilityCriteria: any; // parsed as EligibilityCriteria
  embedding?: number[] | null;
}

/**
 * Layer 1: Evaluates deterministic eligibility rules.
 * Returns true if the citizen profile matches all specified criteria.
 */
export function checkEligibility(profile: CitizenProfile, criteriaJson: any): boolean {
  if (!criteriaJson || typeof criteriaJson !== "object") {
    return true; // No rules, eligible by default
  }

  const criteria = criteriaJson as EligibilityCriteria;

  // Age Checks
  if (criteria.minAge !== undefined && profile.age !== undefined && profile.age < criteria.minAge) {
    return false;
  }
  if (criteria.maxAge !== undefined && profile.age !== undefined && profile.age > criteria.maxAge) {
    return false;
  }

  // Income ceiling check
  if (criteria.maxIncome !== undefined && profile.income !== undefined && profile.income > criteria.maxIncome) {
    return false;
  }

  // Gender check (case-insensitive)
  if (criteria.genders && criteria.genders.length > 0 && profile.gender) {
    const profileGenderLower = profile.gender.toLowerCase();
    const matches = criteria.genders.some((g) => g.toLowerCase() === profileGenderLower);
    if (!matches) {
      return false;
    }
  }

  // Region check (case-insensitive)
  if (criteria.regions && criteria.regions.length > 0 && profile.region) {
    const profileRegionLower = profile.region.toLowerCase();
    const matches = criteria.regions.some((r) => r.toLowerCase() === profileRegionLower);
    if (!matches) {
      return false;
    }
  }

  // Category check (case-insensitive)
  if (criteria.categories && criteria.categories.length > 0 && profile.category) {
    const profileCategoryLower = profile.category.toLowerCase();
    const matches = criteria.categories.some((c) => c.toLowerCase() === profileCategoryLower);
    if (!matches) {
      return false;
    }
  }

  // Occupation check (case-insensitive)
  if (criteria.occupations && criteria.occupations.length > 0 && profile.occupation) {
    const profileOccupationLower = profile.occupation.toLowerCase();
    const matches = criteria.occupations.some((o) => o.toLowerCase() === profileOccupationLower);
    if (!matches) {
      return false;
    }
  }

  return true;
}

/**
 * Matches a citizen profile against a list of candidate schemes.
 * Deterministically filters via Layer 1, then ranks via Layer 2 (Gemini Embeddings or TF-IDF fallback).
 */
export async function matchAndRankSchemes(
  profile: CitizenProfile,
  situation: string | undefined,
  schemes: MatchableScheme[]
): Promise<{ scheme: MatchableScheme; score: number }[]> {
  // Step 1: Layer 1 Rule-based Filter
  const eligibleSchemes = schemes.filter((s) => checkEligibility(profile, s.eligibilityCriteria));

  if (eligibleSchemes.length === 0) {
    return [];
  }

  // If no user situation string is supplied, return all passing with a base score of 1.0
  if (!situation || situation.trim() === "") {
    return eligibleSchemes.map((s) => ({ scheme: s, score: 1.0 }));
  }

  // Step 2: Layer 2 ML/Similarity Rank
  // Try to use Gemini embedding API
  const queryEmbedding = await getEmbedding(situation, "RETRIEVAL_QUERY");

  if (queryEmbedding) {
    const results = eligibleSchemes.map((s) => {
      let score = 0.5; // default base similarity
      if (s.embedding && Array.isArray(s.embedding) && s.embedding.length > 0) {
        score = cosineSimilarity(queryEmbedding, s.embedding);
      }
      return { scheme: s, score };
    });

    // Sort by cosine similarity descending
    return results.sort((a, b) => b.score - a.score);
  }

  // Fallback to local TF-IDF rank
  console.log("No embedding API available or failed. Falling back to local TF-IDF matching.");
  const tfIdfRanks = rankSchemesTfIdf(situation, eligibleSchemes);
  
  const tfIdfMap = new Map(tfIdfRanks.map((r) => [r.schemeId, r.score]));

  return eligibleSchemes.map((s) => ({
    scheme: s,
    score: tfIdfMap.get(s.id) ?? 0.0,
  })).sort((a, b) => b.score - a.score);
}
