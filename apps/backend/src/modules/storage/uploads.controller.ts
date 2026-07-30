import {
  BadRequestException,
  Controller,
  Inject,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { STORAGE_SERVICE, type StorageService } from "./storage.interface";

const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_FOLDERS = ["themes", "kits", "products"];

@ApiTags("uploads")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("ADMIN", "OPS")
@Controller("uploads")
export class UploadsController {
  constructor(@Inject(STORAGE_SERVICE) private readonly storage: StorageService) {}

  @Post("image/:folder")
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: MAX_FILE_SIZE_BYTES },
    }),
  )
  async uploadImage(@Param("folder") folder: string, @UploadedFile() file?: Express.Multer.File) {
    if (!ALLOWED_FOLDERS.includes(folder)) {
      throw new BadRequestException("Categoria de upload inválida.");
    }
    if (!file) {
      throw new BadRequestException("Nenhum arquivo enviado.");
    }
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException("Formato de imagem não suportado. Use JPEG, PNG ou WebP.");
    }

    return this.storage.save(file, folder);
  }
}
