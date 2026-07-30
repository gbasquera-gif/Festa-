export interface StoredFile {
  url: string;
}

// Ponto de extensão: hoje só existe LocalDiskStorageService (sem
// credenciais de S3/R2 ainda). Trocar para object storage real depois
// significa implementar esta interface de novo — nada que chama
// StorageService precisa mudar.
export interface StorageService {
  save(file: Express.Multer.File, folder: string): Promise<StoredFile>;
}

export const STORAGE_SERVICE = "STORAGE_SERVICE";
