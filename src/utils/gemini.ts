import { config } from "../config.js";

/**
 * Sends a generation request to Gemini 1.5 Flash.
 */
async function callGemini(prompt: string, inlineData?: { mimeType: string; data: string }): Promise<string | null> {
  if (!config.GEMINI_API_KEY) {
    return null;
  }

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${config.GEMINI_API_KEY}`;
    
    const parts: any[] = [];
    if (inlineData) {
      parts.push({
        inline_data: {
          mime_type: inlineData.mimeType,
          data: inlineData.data,
        },
      });
    }
    parts.push({ text: prompt });

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [{ parts }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.warn(`Gemini API error ${response.status}: ${err}`);
      return null;
    }

    const json = (await response.json()) as any;
    const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
    return text || null;
  } catch (error) {
    console.error("Failed to connect to Gemini API:", error);
    return null;
  }
}

/**
 * Classifies the user message intent: APPLY_SCHEME, REPORT_ISSUE, CHECK_STATUS, FAQ.
 * Extracts details like trackingId or category suggestions.
 */
export async function classifyIntentAndExtract(
  text: string
): Promise<{ intent: "APPLY_SCHEME" | "REPORT_ISSUE" | "CHECK_STATUS" | "FAQ"; trackingId?: string; category?: string; region?: string }> {
  // Regex fallbacks in case API key is missing or calls fail
  const trackingIdMatch = text.match(/NS-[0-9A-Z]{4}-[0-9A-Z]{2}/i);
  const foundTrackingId = trackingIdMatch ? trackingIdMatch[0].toUpperCase() : undefined;

  if (config.GEMINI_API_KEY) {
    const prompt = `
Analyze this citizen message: "${text}"
Classify it into exactly one of these intents:
- APPLY_SCHEME (if they want to find/apply for government welfare/grants/yojana/assistance)
- REPORT_ISSUE (if they want to report a grievance/civic complaint, e.g. sanitation, water, pothole, streetlights)
- CHECK_STATUS (if they want to check status of a previously filed report)
- FAQ (for greetings, general queries about NagrikSetu, or platform help)

Also attempt to extract:
1. "trackingId" (look for codes matching the pattern 'NS-xxxx-xx')
2. "category" (e.g. "Water Supply", "Roads", "Sanitation", "Streetlights" - default to null if not clear)
3. "region" (e.g. Ward/Zone number - default to null if not clear)

Respond in raw JSON format only, matching this structure:
{
  "intent": "APPLY_SCHEME" | "REPORT_ISSUE" | "CHECK_STATUS" | "FAQ",
  "trackingId": "NS-XXXX-XX" or null,
  "category": "category name" or null,
  "region": "region name" or null
}
`;
    const responseText = await callGemini(prompt);
    if (responseText) {
      try {
        // Clean markdown backticks if returned
        const cleaned = responseText.replace(/```json/i, "").replace(/```/g, "").trim();
        const parsed = JSON.parse(cleaned);
        return {
          intent: parsed.intent || "FAQ",
          trackingId: parsed.trackingId || foundTrackingId,
          category: parsed.category || undefined,
          region: parsed.region || undefined,
        };
      } catch (err) {
        console.warn("Failed to parse Gemini intent response as JSON, falling back to heuristics.");
      }
    }
  }

  // Pure Local Heuristic Fallback
  const lower = text.toLowerCase();
  
  if (foundTrackingId || lower.includes("status") || lower.includes("track") || lower.includes("progress")) {
    return { intent: "CHECK_STATUS", trackingId: foundTrackingId };
  }

  if (
    lower.includes("apply") ||
    lower.includes("scheme") ||
    lower.includes("welfare") ||
    lower.includes("yojana") ||
    lower.includes("subsidy") ||
    lower.includes("subsidies") ||
    lower.includes("pension")
  ) {
    return { intent: "APPLY_SCHEME" };
  }

  if (
    lower.includes("report") ||
    lower.includes("leak") ||
    lower.includes("broken") ||
    lower.includes("pothole") ||
    lower.includes("streetlight") ||
    lower.includes("drainage") ||
    lower.includes("garbage") ||
    lower.includes("complaint")
  ) {
    let category: string | undefined = undefined;
    if (lower.includes("water") || lower.includes("pipe") || lower.includes("leak")) {
      category = "Water Supply";
    } else if (lower.includes("road") || lower.includes("pothole")) {
      category = "Roads";
    } else if (lower.includes("light") || lower.includes("bulb")) {
      category = "Streetlights";
    } else if (lower.includes("garbage") || lower.includes("clean") || lower.includes("waste")) {
      category = "Sanitation";
    }
    return { intent: "REPORT_ISSUE", category };
  }

  return { intent: "FAQ" };
}

/**
 * Transcribes audio buffer using Gemini audio understanding.
 */
export async function transcribeAudio(audioBuffer: Buffer, mimeType: string): Promise<string | null> {
  if (!config.GEMINI_API_KEY) {
    console.warn("GEMINI_API_KEY missing. Audio speech-to-text fallback returned mock transcript.");
    return "mock audio transcript";
  }

  const base64Data = audioBuffer.toString("base64");
  const prompt = "Transcribe the spoken audio. Provide only the text transcript, preserving the original spoken language (e.g. Hindi, Marathi, English).";
  
  return callGemini(prompt, { mimeType, data: base64Data });
}

/**
 * Generates a helpful chatbot reply based on intent and context.
 */
export async function generateChatReply(
  userMessage: string,
  intent: string,
  languageCode: string,
  contextData?: any
): Promise<string> {
  const langName = languageCode === "hi" ? "Hindi" : languageCode === "mr" ? "Marathi" : "English";

  if (config.GEMINI_API_KEY) {
    const prompt = `
You are the helpful AI municipal assistant named "NagrikSetu Bot".
The citizen said: "${userMessage}"
Detected Intent: ${intent}
Requested Response Language: ${langName} (respond in this language)

Context variables for this request:
${JSON.stringify(contextData || {})}

Formulate a concise, welcoming, and clear response.
- If intent is APPLY_SCHEME, explain how they can apply, mentioning any matched schemes in the context.
- If intent is REPORT_ISSUE, guide them on how to report a grievance (mentioning any extracted category/region).
- If intent is CHECK_STATUS, report the status of their ticket, summarizing from context.
- If intent is FAQ, reply to general greetings or answer basic queries about NagrikSetu.
`;
    const response = await callGemini(prompt);
    if (response) {
      return response.trim();
    }
  }

  // Heuristic responses if no API key is set
  if (languageCode === "hi") {
    if (intent === "CHECK_STATUS") {
      return `आपके शिकायत की वर्तमान स्थिति: ${contextData?.status || "ढूँढा नहीं जा सका"} है।`;
    }
    if (intent === "APPLY_SCHEME") {
      return "आप कल्याणकारी योजनाओं के लिए हमारे पोर्टल पर अपनी प्रोफाइल साझा करके आवेदन कर सकते हैं।";
    }
    if (intent === "REPORT_ISSUE") {
      return "आप शिकायत दर्ज करा सकते हैं। कृपया अपनी समस्या की श्रेणी और वार्ड नंबर की जानकारी दें।";
    }
    return "नमस्ते! मैं नागरिकसेतु सहायक हूँ। मैं आपकी योजनाओं और शिकायतों में मदद कर सकता हूँ।";
  }

  // Default English Heuristic
  if (intent === "CHECK_STATUS") {
    return `The status of your grievance report is currently: ${contextData?.status || "NOT_FOUND"}.`;
  }
  if (intent === "APPLY_SCHEME") {
    return "You can query eligible schemes by submitting your age, income, and occupation profile to check eligibility.";
  }
  if (intent === "REPORT_ISSUE") {
    return "To file a report, please use the submit grievance section, providing category and description details.";
  }
  return "Welcome! I am the NagrikSetu helper. How can I assist you with schemes or grievance redressal today?";
}
