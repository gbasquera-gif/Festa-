import { Logger, Module } from "@nestjs/common";
import { UploadsController } from "./uploads.controller";
import { LocalDiskStorageService } from "./local-disk-storage.service";
import { readS3ConfigFromEnv, S3StorageService } from "./s3-storage.service";
import { STORAGE_SERVICE, type StorageService } from "./storage.interface";

/**
 * Object storage quando o bucket está configurado; disco local caso
 * contrário (o suficiente para desenvolvimento).
 *
 * O aviso do disco local é gritado de propósito: em container o disco é
 * apagado a cada deploy, então subir para produção sem bucket significa
 * perder todas as fotos do catálogo no próximo restart — uma falha que só
 * aparece dias depois se ninguém avisar.
 */
function createStorageService(): StorageService {
  const logger = new Logger("StorageModule");
  const s3Config = readS3ConfigFromEnv();

  if (s3Config) {
    logger.log(`Uploads no bucket "${s3Config.bucket}" (leitura em ${s3Config.publicUrl}).`);
    return new S3StorageService(s3Config);
  }

  logger.warn(
    "Uploads indo para o disco local: em container isso é apagado a cada deploy. " +
      "Configure S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY e S3_PUBLIC_URL em produção.",
  );
  return new LocalDiskStorageService();
}

@Module({
  controllers: [UploadsController],
  providers: [{ provide: STORAGE_SERVICE, useFactory: createStorageService }],
  exports: [STORAGE_SERVICE],
})
export class StorageModule {}
