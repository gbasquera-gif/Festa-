import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { Injectable } from "@nestjs/common";
import type { StorageService, StoredFile } from "./storage.interface";

export const UPLOADS_ROOT = join(__dirname, "..", "..", "..", "uploads");

@Injectable()
export class LocalDiskStorageService implements StorageService {
  async save(file: Express.Multer.File, folder: string): Promise<StoredFile> {
    const dir = join(UPLOADS_ROOT, folder);
    await mkdir(dir, { recursive: true });

    const filename = `${randomUUID()}${extname(file.originalname)}`;
    await writeFile(join(dir, filename), file.buffer);

    const baseUrl = process.env.PUBLIC_URL ?? `http://localhost:${process.env.PORT ?? 3333}`;
    return { url: `${baseUrl}/uploads/${folder}/${filename}` };
  }
}
