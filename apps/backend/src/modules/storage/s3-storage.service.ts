import { randomUUID } from "node:crypto";
import { Injectable, Logger } from "@nestjs/common";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { StorageService, StoredFile } from "./storage.interface";

// A extensão sai do mimetype já validado pelo controller, não do nome que o
// cliente mandou: um arquivo chamado "foto.html" enviado como image/png
// viraria uma página servida pelo domínio do bucket.
const EXTENSION_BY_MIME_TYPE: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

/**
 * Configuração do bucket. `endpoint` só é necessário fora da AWS (no
 * Cloudflare R2, por exemplo, é https://<account>.r2.cloudflarestorage.com).
 *
 * `publicUrl` é pedido explicitamente porque o endereço de leitura quase
 * nunca é o mesmo de escrita: no R2 é o domínio público do bucket ou um
 * domínio próprio. Derivar isso sozinho geraria URLs quebradas em silêncio.
 */
export interface S3StorageConfig {
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicUrl: string;
  endpoint?: string;
  region: string;
  /** Necessário em S3 self-hosted (MinIO), onde o bucket vai no caminho. */
  forcePathStyle: boolean;
}

export function readS3ConfigFromEnv(): S3StorageConfig | null {
  const bucket = process.env.S3_BUCKET;
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
  const publicUrl = process.env.S3_PUBLIC_URL;

  if (!bucket || !accessKeyId || !secretAccessKey || !publicUrl) return null;

  return {
    bucket,
    accessKeyId,
    secretAccessKey,
    // Barra final atrapalha na hora de juntar com a chave do objeto.
    publicUrl: publicUrl.replace(/\/+$/, ""),
    endpoint: process.env.S3_ENDPOINT || undefined,
    // "auto" é o que o R2 espera; na AWS a região precisa ser explícita.
    region: process.env.S3_REGION || "auto",
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
  };
}

@Injectable()
export class S3StorageService implements StorageService {
  private readonly logger = new Logger(S3StorageService.name);
  private readonly client: S3Client;

  constructor(private readonly config: S3StorageConfig) {
    this.client = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      forcePathStyle: config.forcePathStyle,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  async save(file: Express.Multer.File, folder: string): Promise<StoredFile> {
    const key = `${folder}/${randomUUID()}${EXTENSION_BY_MIME_TYPE[file.mimetype] ?? ""}`;

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
        // O nome do arquivo é um UUID, então o conteúdo nunca muda para a
        // mesma chave — pode ser cacheado para sempre.
        CacheControl: "public, max-age=31536000, immutable",
      }),
    );

    this.logger.log(`Imagem enviada para ${this.config.bucket}/${key}`);
    return { url: `${this.config.publicUrl}/${key}` };
  }
}
