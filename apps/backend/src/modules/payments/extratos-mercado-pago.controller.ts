import { createHash } from "node:crypto";
import {
  BadRequestException,
  Controller,
  HttpCode,
  Post,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FilesInterceptor } from "@nestjs/platform-express";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { LIMITES_DO_EXTRATO, analisarExtratos, type AnaliseDeExtratos } from "@festae/shared";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";

/** O multer entrega o nome em Latin-1; nomes com acento chegam trocados. */
export function nomeDoArquivo(original: string): string {
  const nome = Buffer.from(original, "latin1").toString("utf8");
  return (nome.includes("�") ? original : nome).replace(/[\u0000-\u001f]/g, "").slice(0, 120);
}

/**
 * Extratos do Mercado Pago (Entrega H1): prévia, só leitura.
 *
 * Os arquivos ficam na memória durante a requisição e são descartados: nada
 * é gravado, nenhum lançamento muda, e o conteúdo nunca vai para log. Só
 * ADMIN — o extrato mostra toda a movimentação da conta.
 */
@ApiTags("payments")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("ADMIN")
@Controller("pagamentos/extratos-mercado-pago")
export class ExtratosMercadoPagoController {
  @Post("analise")
  @HttpCode(200)
  @UseInterceptors(
    FilesInterceptor("arquivos", LIMITES_DO_EXTRATO.arquivos, {
      limits: { fileSize: LIMITES_DO_EXTRATO.bytesPorArquivo, files: LIMITES_DO_EXTRATO.arquivos },
    }),
  )
  analisar(@UploadedFiles() arquivos?: Express.Multer.File[]): AnaliseDeExtratos {
    if (!arquivos?.length) throw new BadRequestException("Selecione ao menos um arquivo do Mercado Pago.");
    return analisarExtratos(
      arquivos.map((a) => ({
        nome: nomeDoArquivo(a.originalname),
        hash: createHash("sha256").update(a.buffer).digest("hex"),
        bytes: new Uint8Array(a.buffer.buffer, a.buffer.byteOffset, a.buffer.byteLength),
      })),
    );
  }
}
