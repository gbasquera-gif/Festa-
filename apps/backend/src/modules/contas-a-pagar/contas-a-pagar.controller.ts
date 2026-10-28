import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import {
  ativarDestinatarioSchema,
  configuracaoDeAvisosSchema,
  confirmarDestinatarioSchema,
  criarRecorrenciaSchema,
  destinatarioDeAvisoSchema,
  editarRecorrenciaSchema,
  filtroDeContasSchema,
  gerarRetroativasSchema,
  registrarPagamentoDeContaSchema,
  resolverConferenciaSchema,
  type ConfiguracaoDeAvisosInput,
  type ConfirmarDestinatarioInput,
  type CriarRecorrenciaInput,
  type DestinatarioDeAvisoInput,
  type EditarRecorrenciaInput,
  type FiltroDeContas,
  type GerarRetroativasInput,
  type RegistrarPagamentoDeContaInput,
  type ResolverConferenciaInput,
} from "@festae/shared";
import { CurrentUser, type AuthUser } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { AvisosService } from "./avisos/avisos.service";
import { ContasService } from "./contas.service";
import { hojeEmChapeco } from "./datas";
import { gerarContasAutomaticas } from "./geracao";
import { RecorrenciasService } from "./recorrencias.service";

const hoje = () => hojeEmChapeco(new Date());

/**
 * Contas a pagar e despesas recorrentes. Só ADMIN, como todo o financeiro.
 *
 * Não há aqui rota da tarefa agendada: ela roda num processo à parte, sem
 * HTTP. "Gerar agora" é uma ação de quem está logado — cria só o que falta,
 * do mesmo jeito que a tarefa.
 */
@ApiTags("contas-a-pagar")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("ADMIN")
@Controller("financeiro")
export class ContasAPagarController {
  constructor(
    private readonly contas: ContasService,
    private readonly recorrencias: RecorrenciasService,
  ) {}

  @Get("contas-a-pagar")
  listar(@Query(new ZodValidationPipe(filtroDeContasSchema)) filtro: FiltroDeContas) {
    return this.contas.listar(filtro, hoje());
  }

  @Post("contas-a-pagar/:id/pagamento")
  registrarPagamento(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(registrarPagamentoDeContaSchema)) body: RegistrarPagamentoDeContaInput,
  ) {
    return this.contas.registrarPagamento(id, body, hoje());
  }

  @Post("contas-a-pagar/gerar")
  gerarAgora() {
    return gerarContasAutomaticas(hoje());
  }

  @Get("recorrencias")
  listarRecorrencias() {
    return this.recorrencias.listar(hoje());
  }

  @Post("recorrencias")
  criarRecorrencia(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(criarRecorrenciaSchema)) body: CriarRecorrenciaInput,
  ) {
    return this.recorrencias.criar(body, user.userId, hoje());
  }

  @Patch("recorrencias/:id")
  editarRecorrencia(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(editarRecorrenciaSchema)) body: EditarRecorrenciaInput,
  ) {
    return this.recorrencias.editar(id, body, user.userId, hoje());
  }

  @Post("recorrencias/:id/pausar")
  pausar(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.recorrencias.pausar(id, user.userId, hoje());
  }

  @Post("recorrencias/:id/retomar")
  retomar(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.recorrencias.retomar(id, user.userId, hoje());
  }

  @Post("recorrencias/:id/encerrar")
  encerrar(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.recorrencias.encerrar(id, user.userId, hoje());
  }

  @Post("recorrencias/:id/retroativas")
  gerarRetroativas(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(gerarRetroativasSchema)) body: GerarRetroativasInput,
  ) {
    return this.recorrencias.gerarRetroativas(id, body.competencias, user.userId, hoje());
  }

  @Get("recorrencias/:id/historico")
  historico(@Param("id") id: string) {
    return this.recorrencias.historico(id);
  }

  @Get("conferencias")
  conferencias() {
    return this.contas.conferenciasPendentes();
  }

  @Post("conferencias/:id")
  resolverConferencia(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(resolverConferenciaSchema)) body: ResolverConferenciaInput,
  ) {
    return this.contas.resolverConferencia(id, body, user.userId);
  }
}

/** Avisos e central de notificações. Só ADMIN. */
@ApiTags("avisos")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("ADMIN")
@Controller()
export class AvisosController {
  constructor(private readonly avisos: AvisosService) {}

  @Get("avisos")
  situacao() {
    return this.avisos.situacao();
  }

  @Put("avisos/configuracao")
  salvarConfiguracao(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(configuracaoDeAvisosSchema)) body: ConfiguracaoDeAvisosInput,
  ) {
    return this.avisos.salvarConfiguracao(body, user.userId);
  }

  @Post("avisos/destinatarios")
  adicionarDestinatario(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(destinatarioDeAvisoSchema)) body: DestinatarioDeAvisoInput,
  ) {
    return this.avisos.adicionarDestinatario(body, user.userId);
  }

  @Post("avisos/destinatarios/:id/codigo")
  enviarCodigo(@Param("id") id: string) {
    return this.avisos.enviarCodigo(id);
  }

  @Post("avisos/destinatarios/:id/confirmar")
  confirmar(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(confirmarDestinatarioSchema)) body: ConfirmarDestinatarioInput,
  ) {
    return this.avisos.confirmar(id, body.codigo);
  }

  @Patch("avisos/destinatarios/:id")
  ativar(@Param("id") id: string, @Body(new ZodValidationPipe(ativarDestinatarioSchema)) body: { ativo: boolean }) {
    return this.avisos.ativar(id, body.ativo);
  }

  @Delete("avisos/destinatarios/:id")
  remover(@Param("id") id: string) {
    return this.avisos.remover(id);
  }

  @Get("notificacoes")
  notificacoes(@Query("limite") limite?: string) {
    return this.avisos.notificacoes(Number(limite) || 30);
  }

  @Get("notificacoes/contagem")
  contagem() {
    return this.avisos.contarNaoLidas();
  }

  @Post("notificacoes/lidas")
  marcarTodas() {
    return this.avisos.marcarTodasLidas();
  }

  @Post("notificacoes/:id/lida")
  marcarLida(@Param("id") id: string) {
    return this.avisos.marcarLida(id);
  }
}
