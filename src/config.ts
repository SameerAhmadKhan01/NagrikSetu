import dotenv from "dotenv";
import path from "path";

// Load environment variables
dotenv.config();

export const config = {
  PORT: parseInt(process.env.PORT || "5000", 10),
  HOST: process.env.HOST || "0.0.0.0",
  JWT_SECRET: process.env.JWT_SECRET || "dev-jwt-secret-key-12345",
  DATABASE_URL: process.env.DATABASE_URL || "",
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || "",
  UPLOAD_DIR: process.env.UPLOAD_DIR || "./uploads",
};

// Ensure upload directory exists as absolute path
export const absoluteUploadDir = path.resolve(config.UPLOAD_DIR);
