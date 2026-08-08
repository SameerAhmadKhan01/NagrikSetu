import { describe, it, expect, beforeAll } from "vitest";
import { classifyIntentAndExtract } from "../utils/gemini.js";
import { config } from "../config.js";

describe("Chatbot Intent Classifier Heuristics (Local Fallback)", () => {
  beforeAll(() => {
    // Ensure we run the heuristic fallback by clearing GEMINI_API_KEY
    config.GEMINI_API_KEY = "";
  });

  it("should classify tracking queries as CHECK_STATUS and extract trackingId", async () => {
    const result1 = await classifyIntentAndExtract("Track my grievance report NS-4819-XP please");
    expect(result1.intent).toBe("CHECK_STATUS");
    expect(result1.trackingId).toBe("NS-4819-XP");

    const result2 = await classifyIntentAndExtract("what is the progress on ns-9204-aq?");
    expect(result2.intent).toBe("CHECK_STATUS");
    expect(result2.trackingId).toBe("NS-9204-AQ");
  });

  it("should classify scheme applications as APPLY_SCHEME", async () => {
    const result1 = await classifyIntentAndExtract("Is there a pension scheme or subsidy for female farmers?");
    expect(result1.intent).toBe("APPLY_SCHEME");

    const result2 = await classifyIntentAndExtract("I want to apply for a yojana");
    expect(result2.intent).toBe("APPLY_SCHEME");
  });

  it("should classify complaint statements as REPORT_ISSUE and extract category suggestions", async () => {
    const result1 = await classifyIntentAndExtract("Report a broken streetlight in Ward-12");
    expect(result1.intent).toBe("REPORT_ISSUE");
    expect(result1.category).toBe("Streetlights");

    const result2 = await classifyIntentAndExtract("There is a massive water leak in the main road");
    expect(result2.intent).toBe("REPORT_ISSUE");
    expect(result2.category).toBe("Water Supply");
  });

  it("should default to FAQ for general questions and greetings", async () => {
    const result1 = await classifyIntentAndExtract("Hello, who are you?");
    expect(result1.intent).toBe("FAQ");

    const result2 = await classifyIntentAndExtract("What is this website about?");
    expect(result2.intent).toBe("FAQ");
  });
});
