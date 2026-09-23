import { BadRequestException, Controller, Get, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { mesEmChapeco } from "@festae/shared";
import { ComercialService } from "./comercial.service";
import { ehDetalheComercial } from "./visao-geral";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";

/**
 * Só ADMIN, como o Financeiro: contratado, ticket e saldo a receber são
 * números do negócio, e a operação não precisa deles para montar festa.
 */
@ApiTags("comercial")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("ADMIN")
@Controller("comercial")
export class ComercialController {
  constructor(private readonly comercial: ComercialService) {}

  /**
   * `ano` (AAAA) e `mes` (AAAA-MM, ou "todos" para o ano inteiro). Sem nada,
   * o mês corrente de Chapecó. O período vem sempre explícito do filtro da
   * tela — nenhum número é calculado sobre um período que ela não mostrou.
   */
  @Get("visao-geral")
  visaoGeral(@Query("ano") ano?: string, @Query("mes") mes?: string) {
    const periodo = lerPeriodo(ano, mes);
    return this.comercial.visaoGeral(periodo.ano, periodo.mes);
  }

  /** De que contratos (ou propostas) um KPI é feito, no mesmo período. */
  @Get("detalhe")
  detalhe(@Query("tipo") tipo?: string, @Query("ano") ano?: string, @Query("mes") mes?: string) {
    const pedido = (tipo ?? "").toUpperCase();
    if (pedido !== "PROPOSTAS" && !ehDetalheComercial(pedido)) {
      throw new BadRequestException("tipo deve ser CONTRATADO, FESTAS, CARTEIRA ou PROPOSTAS.");
    }
    const periodo = lerPeriodo(ano, mes);
    return this.comercial.detalhe(pedido, periodo.ano, periodo.mes);
  }
}

export function lerPeriodo(ano?: string, mes?: string): { ano: number; mes: string | null } {
  const corrente = mesEmChapeco(new Date());
  if (ano !== undefined && !/^\d{4}$/.test(ano)) {
    throw new BadRequestException("ano deve ter o formato AAAA.");
  }
  if (mes !== undefined && mes !== "todos" && !/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) {
    throw new BadRequestException('mes deve ter o formato AAAA-MM, ou "todos".');
  }
  const anoValido = ano ? Number(ano) : Number((mes && mes !== "todos" ? mes : corrente).slice(0, 4));
  if (mes === "todos") return { ano: anoValido, mes: null };
  if (mes) {
    if (Number(mes.slice(0, 4)) !== anoValido) {
      throw new BadRequestException("mes precisa ser do ano informado.");
    }
    return { ano: anoValido, mes };
  }
  // Só o ano: o ano inteiro. Nada: o mês corrente.
  if (ano) return { ano: anoValido, mes: null };
  return { ano: anoValido, mes: corrente };
}
