import { FastifyReply, FastifyRequest } from "fastify";

/**
 * Fastify preHandler hook to verify JWT authentication token.
 * Rejects with 401 Unauthorized if verification fails.
 */
export async function verifyAdminJWT(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify();
  } catch (err) {
    return reply.status(401).send({
      success: false,
      error: "Unauthorized access. Valid administrator JWT token required.",
    });
  }
}
