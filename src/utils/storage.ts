import fs from "fs/promises";
import path from "path";
import { absoluteUploadDir } from "../config.js";

export interface StorageService {
  saveFile(fileName: string, buffer: Buffer): Promise<string>;
  deleteFile(fileUrl: string): Promise<void>;
}

export class LocalStorageService implements StorageService {
  async saveFile(fileName: string, buffer: Buffer): Promise<string> {
    // Ensure the upload directory exists
    await fs.mkdir(absoluteUploadDir, { recursive: true });
    
    // Generate a unique filename to prevent collisions
    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const ext = path.extname(fileName);
    const baseName = path.basename(fileName, ext).replace(/[^a-zA-Z0-9]/g, "_");
    const uniqueName = `${baseName}-${uniqueSuffix}${ext}`;
    
    const filePath = path.join(absoluteUploadDir, uniqueName);
    await fs.writeFile(filePath, buffer);
    
    // Return a relative URL path to be served statically
    return `/uploads/${uniqueName}`;
  }

  async deleteFile(fileUrl: string): Promise<void> {
    if (!fileUrl.startsWith("/uploads/")) {
      return;
    }
    const fileName = fileUrl.replace("/uploads/", "");
    const filePath = path.join(absoluteUploadDir, fileName);
    try {
      await fs.unlink(filePath);
    } catch (err) {
      console.warn(`Failed to delete file from local storage: ${filePath}`, err);
    }
  }
}

export const storageService = new LocalStorageService();
