import { describe, it, expect } from "vitest";
import { checkEligibility, CitizenProfile, EligibilityCriteria } from "../modules/matching/engine.js";

describe("Eligibility Matching Engine - Layer 1 Rules Filter", () => {
  it("should match profile when all eligibility rules pass", () => {
    const profile: CitizenProfile = {
      age: 25,
      income: 150000,
      gender: "Female",
      region: "Maharashtra",
      category: "OBC",
      occupation: "Farmer",
    };

    const criteria: EligibilityCriteria = {
      minAge: 18,
      maxAge: 45,
      maxIncome: 200000,
      genders: ["Female"],
      regions: ["Maharashtra", "Delhi"],
      categories: ["OBC", "General"],
      occupations: ["Farmer"],
    };

    expect(checkEligibility(profile, criteria)).toBe(true);
  });

  it("should fail profile when age is below minAge", () => {
    const profile: CitizenProfile = { age: 16 };
    const criteria: EligibilityCriteria = { minAge: 18 };
    expect(checkEligibility(profile, criteria)).toBe(false);
  });

  it("should fail profile when age exceeds maxAge", () => {
    const profile: CitizenProfile = { age: 50 };
    const criteria: EligibilityCriteria = { maxAge: 45 };
    expect(checkEligibility(profile, criteria)).toBe(false);
  });

  it("should fail profile when income exceeds maxIncome ceiling", () => {
    const profile: CitizenProfile = { income: 300000 };
    const criteria: EligibilityCriteria = { maxIncome: 250000 };
    expect(checkEligibility(profile, criteria)).toBe(false);
  });

  it("should fail profile when gender does not match list", () => {
    const profile: CitizenProfile = { gender: "Male" };
    const criteria: EligibilityCriteria = { genders: ["Female"] };
    expect(checkEligibility(profile, criteria)).toBe(false);
  });

  it("should perform case-insensitive checks on gender and category", () => {
    const profile: CitizenProfile = { gender: "female", category: "obc" };
    const criteria: EligibilityCriteria = { genders: ["Female"], categories: ["OBC"] };
    expect(checkEligibility(profile, criteria)).toBe(true);
  });
});
