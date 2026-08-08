import { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../db.js";
import { matchAndRankSchemes } from "../matching/engine.js";
import { getEmbedding } from "../../utils/embeddings.js";
import { verifyAdminJWT } from "../../utils/auth.js";

// Validation schemas using Zod
const matchBodySchema = z.object({
  profile: z.object({
    age: z.number().optional(),
    income: z.number().optional(),
    gender: z.string().optional(),
    region: z.string().optional(),
    category: z.string().optional(),
    occupation: z.string().optional(),
  }),
  situation: z.string().optional(),
});

const schemeCreateSchema = z.object({
  name: z.string().min(2),
  description: z.string().min(5),
  eligibilityCriteria: z.object({
    minAge: z.number().optional(),
    maxAge: z.number().optional(),
    maxIncome: z.number().optional(),
    genders: z.array(z.string()).optional(),
    regions: z.array(z.string()).optional(),
    categories: z.array(z.string()).optional(),
    occupations: z.array(z.string()).optional(),
  }),
});

export async function schemeRoutes(fastify: FastifyInstance) {
  
  // PUBLIC: Matches schemes for citizen based on profile and situation query
  fastify.post("/api/schemes/match", async (request, reply) => {
    try {
      const parsedBody = matchBodySchema.parse(request.body);
      const { profile, situation } = parsedBody;

      // Fetch all schemes from DB
      const schemes = await prisma.scheme.findMany();

      // Run matching engine
      const ranked = await matchAndRankSchemes(profile, situation, schemes);

      return {
        success: true,
        matchedSchemes: ranked.map((r) => ({
          id: r.scheme.id,
          name: r.scheme.name,
          description: r.scheme.description,
          eligibilityCriteria: r.scheme.eligibilityCriteria,
          score: r.score,
        })),
      };
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ success: false, error: error.issues });
      }
      return reply.status(500).send({ success: false, error: error.message || error });
    }
  });

  // PROTECTED: Create a new welfare scheme (calculates embeddings automatically)
  fastify.post("/api/admin/schemes", { preHandler: verifyAdminJWT }, async (request, reply) => {
    try {
      const parsedBody = schemeCreateSchema.parse(request.body);
      const { name, description, eligibilityCriteria } = parsedBody;

      // Generate embedding for scheme description
      console.log(`Generating description embedding for new scheme: ${name}`);
      const embedding = await getEmbedding(description, "RETRIEVAL_DOCUMENT") || [];

      const scheme = await prisma.scheme.create({
        data: {
          name,
          description,
          eligibilityCriteria,
          embedding,
        },
      });

      return reply.status(201).send({
        success: true,
        scheme: {
          id: scheme.id,
          name: scheme.name,
          description: scheme.description,
          eligibilityCriteria: scheme.eligibilityCriteria,
        },
      });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ success: false, error: error.issues });
      }
      return reply.status(500).send({ success: false, error: error.message || error });
    }
  });

  // PROTECTED: Update welfare scheme details and recalculate embeddings if description changes
  fastify.put("/api/admin/schemes/:id", { preHandler: verifyAdminJWT }, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const parsedBody = schemeCreateSchema.partial().parse(request.body);
      
      // Check if scheme exists
      const existing = await prisma.scheme.findUnique({ where: { id } });
      if (!existing) {
        return reply.status(404).send({ success: false, error: "Scheme not found." });
      }

      // If description changed, recalculate embedding
      let embedding: number[] | undefined = undefined;
      if (parsedBody.description && parsedBody.description !== existing.description) {
        console.log(`Description updated. Regenerating embedding for scheme: ${parsedBody.name || existing.name}`);
        embedding = await getEmbedding(parsedBody.description, "RETRIEVAL_DOCUMENT") || [];
      }

      const updated = await prisma.scheme.update({
        where: { id },
        data: {
          ...parsedBody,
          ...(embedding !== undefined ? { embedding } : {}),
        },
      });

      return {
        success: true,
        scheme: {
          id: updated.id,
          name: updated.name,
          description: updated.description,
          eligibilityCriteria: updated.eligibilityCriteria,
        },
      };
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ success: false, error: error.issues });
      }
      return reply.status(500).send({ success: false, error: error.message || error });
    }
  });

  // PROTECTED: Delete welfare scheme
  fastify.delete("/api/admin/schemes/:id", { preHandler: verifyAdminJWT }, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const existing = await prisma.scheme.findUnique({ where: { id } });
      if (!existing) {
        return reply.status(404).send({ success: false, error: "Scheme not found." });
      }

      await prisma.scheme.delete({ where: { id } });
      return {
        success: true,
        message: "Scheme deleted successfully.",
      };
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message || error });
    }
  });
}
