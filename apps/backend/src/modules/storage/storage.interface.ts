export interface StoredFile {
  url: string;
}

// Duas implementações: S3StorageService (usada quando o bucket está
// configurado) e LocalDiskStorageService (desenvolvimento). Quem consome
// StorageService não sabe qual das duas está ativa.
export interface StorageService {
  save(file: Express.Multer.File, folder: string): Promise<StoredFile>;
}

export const STORAGE_SERVICE = "STORAGE_SERVICE";
