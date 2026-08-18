import {
  ArgumentsHost,
  Catch,
  ConflictException,
  ExceptionFilter,
  HttpException,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import type { Response } from "express";
import { Prisma } from "@festae/database";

/**
 * Traduz erro de banco em resposta que a pessoa do painel consegue entender.
 *
 * Sem isto, qualquer restrição do Postgres virava "Internal server error" —
 * a mensagem que apareceu para a Maria Luiza ao cadastrar um kit com nome
 * repetido. Ela dizia que o sistema quebrou, quando na verdade o sistema
 * tinha recusado o dado de propósito. Sem saber o motivo, a única saída era
 * tentar de novo e ver o mesmo erro.
 *
 * O nome do campo aparece na resposta porque, num formulário com quinze
 * campos, "já existe" sem dizer onde não ajuda ninguém.
 */
@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PrismaExceptionFilter.name);

  catch(error: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const http = this.traduzir(error);

    // O erro cru continua no log do servidor: a resposta é enxuta de
    // propósito, mas quem for investigar precisa do detalhe.
    this.logger.warn(`Prisma ${error.code}: ${error.message.split("\n").pop()}`);

    response.status(http.getStatus()).json(http.getResponse());
  }

  private traduzir(error: Prisma.PrismaClientKnownRequestError): HttpException {
    switch (error.code) {
      // Violação de campo único.
      case "P2002": {
        const campos = this.camposDoErro(error);
        return new ConflictException(
          campos.length > 0
            ? `Já existe um registro com este ${campos.join(", ")}. Escolha outro valor.`
            : "Já existe um registro com estes dados.",
        );
      }

      // Registro não encontrado (update/delete de algo que sumiu).
      case "P2025":
        return new NotFoundException("Registro não encontrado. Ele pode ter sido removido.");

      // Chave estrangeira: aponta para algo que não existe.
      case "P2003":
        return new UnprocessableEntityException(
          "Um dos itens selecionados não existe mais. Atualize a página e tente de novo.",
        );

      // Apagar algo que ainda é usado por outro registro.
      case "P2014":
        return new ConflictException(
          "Este registro está em uso por outro cadastro e não pode ser removido.",
        );

      default:
        // Códigos não mapeados continuam como 500 — mas agora com o código
        // do Prisma na mensagem, para não investigar às cegas.
        return new HttpException(`Erro ao gravar no banco (${error.code}).`, 500);
    }
  }

  /** Nomes dos campos que colidiram, quando o Prisma informa quais são. */
  private camposDoErro(error: Prisma.PrismaClientKnownRequestError): string[] {
    const alvo = (error.meta as { target?: string[] | string } | undefined)?.target;
    if (Array.isArray(alvo)) return alvo;
    if (typeof alvo === "string") return [alvo];
    return [];
  }
}
