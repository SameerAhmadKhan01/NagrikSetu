import { FastifyInstance } from "fastify";
import { prisma } from "../../db.js";
import { storageService } from "../../utils/storage.js";

/**
 * Route handlers for Anonymous Grievance Reporting.
 * Allows citizens to file reports with media uploads without logging in,
 * generating a randomized trackable ID.
 */
export async function reportRoutes(fastify: FastifyInstance) {
  
  // PUBLIC: Submit an anonymous grievance report with optional media file upload
  fastify.post("/api/reports", async (request, reply) => {
    if (!request.isMultipart()) {
      return reply.status(400).send({
        success: false,
        error: "Content-Type must be multipart/form-data",
      });
    }

    try {
      const parts = request.parts();
      let description = "";
      let category = "";
      let region = "";
      let latitude = 0.0;
      let longitude = 0.0;
      
      let fileBuffer: Buffer | null = null;
      let fileName = "";
      let mimeType = "";

      for await (const part of parts) {
        if (part.type === "file" && part.fieldname === "media") {
          fileBuffer = await part.toBuffer();
          fileName = part.filename;
          mimeType = part.mimetype;
        } else if (part.type === "field") {
          if (part.fieldname === "description") {
            description = String(part.value);
          } else if (part.fieldname === "category") {
            category = String(part.value);
          } else if (part.fieldname === "region") {
            region = String(part.value);
          } else if (part.fieldname === "latitude") {
            latitude = parseFloat(String(part.value)) || 0.0;
          } else if (part.fieldname === "longitude") {
            longitude = parseFloat(String(part.value)) || 0.0;
          }
        }
      }

      if (!description || !category || !region) {
        return reply.status(400).send({
          success: false,
          error: "Required fields missing: description, category, region",
        });
      }

      // Check media constraints (e.g. support image and video files)
      let mediaUrl: string | undefined = undefined;
      if (fileBuffer && fileName) {
        if (!mimeType.startsWith("image/") && !mimeType.startsWith("video/")) {
          return reply.status(400).send({
            success: false,
            error: "Uploaded file must be an image or a video.",
          });
        }
        mediaUrl = await storageService.saveFile(fileName, fileBuffer);
      }

      // Generate secure unique trackingId: NS-XXXX-YY (e.g. NS-1948-QZ)
      const randomDigits = Math.floor(1000 + Math.random() * 9000); // 4 digits
      const randomLetters = Math.random().toString(36).substring(2, 4).toUpperCase(); // 2 letters
      const trackingId = `NS-${randomDigits}-${randomLetters}`;

      // Default SLA based on category complexity
      let slaHours = 48; // Standard 2 days
      if (category.toLowerCase() === "roads") {
        slaHours = 72; // Roads require longer repairs (3 days)
      } else if (category.toLowerCase() === "sanitation") {
        slaHours = 24; // Sanitation is high urgency (1 day)
      }

      const report = await prisma.grievanceReport.create({
        data: {
          trackingId,
          description,
          category,
          region,
          latitude,
          longitude,
          mediaUrl,
          slaHours,
          status: "SUBMITTED",
        },
      });

      return reply.status(201).send({
        success: true,
        trackingId: report.trackingId,
        report: {
          id: report.id,
          status: report.status,
          createdAt: report.createdAt,
          slaHours: report.slaHours,
        },
      });
    } catch (error: any) {
      console.error("Error creating report:", error);
      return reply.status(500).send({
        success: false,
        error: error.message || error,
      });
    }
  });

  // PUBLIC: Track grievance report status by trackingId only
  fastify.get("/api/reports/track/:trackingId", async (request, reply) => {
    const { trackingId } = request.params as { trackingId: string };
    
    try {
      const report = await prisma.grievanceReport.findUnique({
        where: { trackingId: trackingId.toUpperCase() },
      });

      if (!report) {
        return reply.status(404).send({
          success: false,
          error: "Grievance report not found with the provided tracking ID.",
        });
      }

      return {
        success: true,
        report: {
          trackingId: report.trackingId,
          status: report.status,
          description: report.description,
          category: report.category,
          region: report.region,
          mediaUrl: report.mediaUrl,
          createdAt: report.createdAt,
          resolvedAt: report.resolvedAt,
          slaHours: report.slaHours,
          escalated: report.status === "ESCALATED",
        },
      };
    } catch (error: any) {
      return reply.status(500).send({
        success: false,
        error: error.message || error,
      });
    }
  });
}
