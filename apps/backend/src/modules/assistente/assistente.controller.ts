import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Param,
  Post,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { z } from "zod";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser, type AuthUser } from "../../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import type { IdentidadeAutenticada } from "./contrato";
import { NucleoDoAssistente, RecusaDoAssistente } from "./nucleo";
import { extensaoDoAudio, mimeBase } from "./provedor";

const mensagemSchema = z.object({
  mensagem: z.string().trim().min(1, "Escreva uma pergunta.").max(500, "A pergunta pode ter até 500 caracteres."),
  conversaId: z.string().uuid().optional(),
});
const falaSchema = z.object({ texto: z.string().trim().min(1).max(1500) });

const BYTES_DE_AUDIO = 3 * 1024 * 1024;

/**
 * O canal PAINEL do Assistente IA: texto e voz.
 *
 * A identidade é a do JWT — o mesmo login do painel, relido do banco a cada
 * requisição pela estratégia JWT. ADMIN e OPS entram; o que cada um consulta
 * é decidido no núcleo, pelo catálogo de ferramentas do papel. Cliente da
 * loja não passa do `RolesGuard`.
 */
@ApiTags("assistente")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("ADMIN", "OPS")
@Controller("assistente")
export class AssistenteController {
  constructor(private readonly nucleo: NucleoDoAssistente) {}

  @Get("estado")
  estado(@CurrentUser() user: AuthUser) {
    return this.nucleo.estado(identidade(user).papel);
  }

  @Post("mensagens")
  @HttpCode(200)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async mensagem(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(mensagemSchema)) corpo: z.infer<typeof mensagemSchema>) {
    return traduzirRecusa(() =>
      this.nucleo.responder({
        canal: "PAINEL_TEXTO",
        identidade: identidade(user),
        conversaId: corpo.conversaId,
        mensagem: corpo.mensagem,
        origem: "DIGITADA",
      }),
    );
  }

  /**
   * Pergunta falada: transcreve e responde na mesma ida. O áudio não é
   * guardado em lugar nenhum — vive na memória desta requisição.
   */
  @Post("audio")
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UseInterceptors(FileInterceptor("audio", { limits: { fileSize: BYTES_DE_AUDIO, files: 1 } }))
  async audio(
    @CurrentUser() user: AuthUser,
    @UploadedFile() arquivo: Express.Multer.File | undefined,
    @Body() corpo: { conversaId?: string; segundos?: string },
  ) {
    if (!arquivo || arquivo.size === 0) throw new BadRequestException("Nenhum áudio recebido.");
    if (!extensaoDoAudio(arquivo.mimetype)) {
      throw new BadRequestException(`Formato de áudio não suportado (${mimeBase(arquivo.mimetype)}).`);
    }
    const conversaId = corpo.conversaId && /^[0-9a-f-]{36}$/i.test(corpo.conversaId) ? corpo.conversaId : undefined;
    const segundos = Math.min(70, Math.max(0, Number(corpo.segundos) || 0));
    const quem = identidade(user);
    return traduzirRecusa(async () => {
      const transcricao = await this.nucleo.transcrever(quem, "PAINEL_VOZ", arquivo.buffer, arquivo.mimetype, segundos);
      if (!transcricao) {
        return { transcricao: "", resposta: null, aviso: "Não consegui entender o áudio. Tente falar de novo, mais perto do microfone." };
      }
      const resposta = await this.nucleo.responder({
        canal: "PAINEL_VOZ",
        identidade: quem,
        conversaId,
        mensagem: transcricao.slice(0, 500),
        origem: "TRANSCRITA",
      });
      return { transcricao, resposta };
    });
  }

  @Post("fala")
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async fala(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(falaSchema)) corpo: z.infer<typeof falaSchema>) {
    const { audio, mimeType } = await traduzirRecusa(() => this.nucleo.falar(identidade(user), corpo.texto));
    return new StreamableFile(audio, { type: mimeType, disposition: "inline" });
  }

  @Delete("conversas/:id")
  @HttpCode(204)
  encerrar(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    this.nucleo.conversas.encerrar(user.userId, id);
  }

  /**
   * Métricas técnicas, sem conteúdo de conversa: o detalhe do dia nesta
   * instância e, em `uso`, os totais do dia e do mês somados no banco.
   */
  @Get("metricas")
  @Roles("ADMIN")
  async metricas() {
    return { ...this.nucleo.metricas.resumoDoDia(), uso: await this.nucleo.limites.totais() };
  }
}

function identidade(user: AuthUser): IdentidadeAutenticada {
  if (user.role !== "ADMIN" && user.role !== "OPS") throw new HttpException("Sem acesso ao assistente.", HttpStatus.FORBIDDEN);
  return { usuarioId: user.userId, papel: user.role, comprovadaPor: "JWT_PAINEL" };
}

async function traduzirRecusa<T>(fazer: () => Promise<T>): Promise<T> {
  try {
    return await fazer();
  } catch (e) {
    if (e instanceof RecusaDoAssistente) {
      const status =
        e.codigo === "LIMITE"
          ? HttpStatus.TOO_MANY_REQUESTS
          : e.codigo === "INVALIDA"
            ? HttpStatus.BAD_REQUEST
            : e.codigo === "CANAL_INATIVO"
              ? HttpStatus.FORBIDDEN
              : HttpStatus.SERVICE_UNAVAILABLE;
      throw new HttpException({ message: e.message, codigo: e.codigo, tentarEmSegundos: e.tentarEmSegundos }, status);
    }
    throw e;
  }
}
