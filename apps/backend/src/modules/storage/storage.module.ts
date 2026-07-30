import { Module } from "@nestjs/common";
import { UploadsController } from "./uploads.controller";
import { LocalDiskStorageService } from "./local-disk-storage.service";
import { STORAGE_SERVICE } from "./storage.interface";

@Module({
  controllers: [UploadsController],
  providers: [{ provide: STORAGE_SERVICE, useClass: LocalDiskStorageService }],
  exports: [STORAGE_SERVICE],
})
export class StorageModule {}
