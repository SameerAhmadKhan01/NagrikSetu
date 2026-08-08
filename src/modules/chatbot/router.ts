import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { classifyIntentAndExtract, transcribeAudio, generateChatReply } from "../../utils/gemini.js";
import { prisma } from "../../db.js";

interface ChatJsonBody {
  message?: string;
  languageCode?: string;
}

export async function chatbotRoutes(fastify: FastifyInstance) {
  // Expose chatbot POST endpoint
  fastify.post("/api/chat", async (request: FastifyRequest, reply: FastifyReply) => {
    let messageText = "";
    let languageCode = "en";
    let isVoice = false;

    // Check if multipart request
    if (request.isMultipart()) {
      const parts = request.parts();
      let audioBuffer: Buffer | null = null;
      let mimeType = "";

      for await (const part of parts) {
        if (part.type === "file" && part.fieldname === "audio") {
          mimeType = part.mimetype;
          audioBuffer = await part.toBuffer();
          isVoice = true;
        } else if (part.type === "field") {
          if (part.fieldname === "languageCode") {
            languageCode = String(part.value);
          } else if (part.fieldname === "message") {
            messageText = String(part.value);
          }
        }
      }

      if (isVoice && audioBuffer) {
        console.log(`Processing voice upload: mimetype=${mimeType}, size=${audioBuffer.length} bytes`);
        const transcript = await transcribeAudio(audioBuffer, mimeType);
        if (transcript) {
          messageText = transcript;
        } else {
          messageText = "";
        }
      }
    } else {
      // JSON body parser
      const body = request.body as ChatJsonBody;
      messageText = body.message || "";
      languageCode = body.languageCode || "en";
    }

    if (!messageText || messageText.trim() === "") {
      return reply.status(400).send({
        success: false,
        error: "Message content or audio is required.",
      });
    }

    // Step 2: Classify intent and extract variables
    const { intent, trackingId, category, region } = await classifyIntentAndExtract(messageText);

    // Step 3: Fetch context based on intent
    const contextData: Record<string, any> = {};
    if (intent === "CHECK_STATUS" && trackingId) {
      contextData.trackingId = trackingId;
      try {
        const report = await prisma.grievanceReport.findUnique({
          where: { trackingId },
        });
        if (report) {
          contextData.status = report.status;
          contextData.category = report.category;
          contextData.createdAt = report.createdAt;
          contextData.found = true;
        } else {
          contextData.status = "NOT_FOUND";
          contextData.found = false;
        }
      } catch (err) {
        contextData.status = "DATABASE_UNAVAILABLE";
        contextData.found = false;
      }
    }

    // Step 4: Generate contextual reply
    const replyText = await generateChatReply(messageText, intent, languageCode, contextData);

    // Step 5: Return clean payload
    return {
      success: true,
      intent,
      transcript: isVoice ? messageText : undefined,
      reply: replyText,
      suggestedFields: {
        category,
        region,
        trackingId,
      },
    };
  });
}
