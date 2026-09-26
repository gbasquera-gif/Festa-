import { Body, Controller, Get, Ip, Param, Post, Headers } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { aprovarPropostaSchema, type AprovarPropostaInput } from "@festae/shared";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { OrcamentosService } from "./orcamentos.service";

/**
 * A proposta vista pela cliente. Rota pública, de propósito.
 *
 * Sem login: a cliente recebe o link pelo WhatsApp e abre no celular, e
 * exigir conta para ler um orçamento é o tipo de atrito que faz a venda
 * esfriar. A barreira é o token — 32 bytes aleatórios, nunca sequencial — e
 * o que a rota devolve é só esta proposta: nenhum id interno de outra
 * cliente, nenhuma listagem, nenhum dado de catálogo além do que está sendo
 * proposto.
 */
@ApiTags("proposta")
@Controller("proposta")
export class PropostaController {
  constructor(private readonly orcamentos: OrcamentosService) {}

  @Get(":token")
  ver(@Param("token") token: string) {
    return this.orcamentos.propostaPublica(token);
  }

  @ApiOperation({
    summary: "Registra o aceite da cliente",
    description:
      "Guarda nome, data, hora e valor aprovado. É evidência de manifestação, não assinatura eletrônica com valor jurídico — e a tela diz isso.",
  })
  @Post(":token/aprovar")
  aprovar(
    @Param("token") token: string,
    @Body(new ZodValidationPipe(aprovarPropostaSchema)) body: AprovarPropostaInput,
    @Ip() ip: string,
    @Headers("user-agent") agente: string,
  ) {
    return this.orcamentos.aprovarPorToken(token, body.nome, body.opcaoId, ip, agente);
  }
}
