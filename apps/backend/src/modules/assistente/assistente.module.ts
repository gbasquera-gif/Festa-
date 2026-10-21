import { Logger, Module } from "@nestjs/common";
import { FinanceiroModule } from "../financeiro/financeiro.module";
import { FinanceiroService } from "../financeiro/financeiro.service";
import { RetiradasService } from "../financeiro/retiradas.service";
import { ComercialModule } from "../comercial/comercial.module";
import { ComercialService } from "../comercial/comercial.service";
import { OrcamentosModule } from "../orcamentos/orcamentos.module";
import { OrcamentosService } from "../orcamentos/orcamentos.service";
import { PanoramaDeOrcamentosService } from "../orcamentos/panorama.service";
import { AcervoModule } from "../acervo/acervo.module";
import { AcervoService } from "../acervo/acervo.service";
import { AvailabilityModule } from "../availability/availability.module";
import { AvailabilityService } from "../availability/availability.service";
import { ProductsModule } from "../products/products.module";
import { ProductsService } from "../products/products.service";
import { lerCarteiraCrua } from "../financeiro/carteira";
import { montarLinha } from "../financeiro/contratos";
import { AssistenteController } from "./assistente.controller";
import { lerConfiguracao, type ConfiguracaoDoAssistente } from "./configuracao";
import { MetricasDoAssistente } from "./controle";
import type { ServicosDoAssistente } from "./ferramentas";
import { NucleoDoAssistente } from "./nucleo";
import { ProvedorOpenAI, type ProvedorDeIA } from "./provedor";
import { ProvedorSimulado } from "./provedor-simulado";
import { LimitesNoBanco } from "./uso-no-banco";

export const CONFIGURACAO_DO_ASSISTENTE = Symbol("CONFIGURACAO_DO_ASSISTENTE");

/** O provedor que a configuração pede. Nulo quando o assistente está desligado. */
export function criarProvedor(cfg: ConfiguracaoDoAssistente): ProvedorDeIA | null {
  if (cfg.modo === "OPENAI") return new ProvedorOpenAI(cfg.openai);
  if (cfg.modo === "SIMULADO") return new ProvedorSimulado(cfg.transcricaoSimulada);
  return null;
}

/**
 * O Assistente IA Festaê.
 *
 * Importa os módulos que já existem e usa os serviços deles como estão: o
 * assistente é mais um leitor dos mesmos números, não uma segunda apuração.
 */
@Module({
  imports: [FinanceiroModule, ComercialModule, OrcamentosModule, AcervoModule, AvailabilityModule, ProductsModule],
  controllers: [AssistenteController],
  providers: [
    { provide: CONFIGURACAO_DO_ASSISTENTE, useFactory: () => lerConfiguracao() },
    {
      provide: NucleoDoAssistente,
      inject: [
        CONFIGURACAO_DO_ASSISTENTE,
        FinanceiroService,
        RetiradasService,
        ComercialService,
        PanoramaDeOrcamentosService,
        OrcamentosService,
        AcervoService,
        AvailabilityService,
        ProductsService,
      ],
      useFactory: (
        cfg: ConfiguracaoDoAssistente,
        financeiro: FinanceiroService,
        retiradas: RetiradasService,
        comercial: ComercialService,
        panoramaDeOrcamentos: PanoramaDeOrcamentosService,
        orcamentos: OrcamentosService,
        acervo: AcervoService,
        disponibilidade: AvailabilityService,
        produtos: ProductsService,
      ) => {
        const logger = new Logger("AssistenteIA");
        const servicos: ServicosDoAssistente = {
          financeiro,
          retiradas,
          comercial,
          panoramaDeOrcamentos,
          orcamentos,
          acervo,
          disponibilidade,
          produtos,
          async carteira(agora) {
            const reservas = await lerCarteiraCrua();
            return reservas.map((r) => ({ linha: montarLinha(r, agora), canceladaEm: r.cancelledAt }));
          },
        };
        logger.log(
          cfg.modo === "OPENAI"
            ? `Assistente IA ligado (OpenAI · texto ${cfg.openai.modeloDeTexto} · transcrição ${cfg.openai.modeloDeTranscricao} · voz ${cfg.saidaDeVoz === "OPENAI" ? cfg.openai.modeloDeVoz : "do navegador"}).`
            : cfg.modo === "SIMULADO"
              ? "Assistente IA em modo de demonstração (provedor simulado, sem chave de API)."
              : process.env.ASSISTENTE_IA_PROVEDOR?.trim().toLowerCase() === "simulado"
                ? "Assistente IA desligado: o modo de demonstração não liga em produção."
                : process.env.ASSISTENTE_IA_PROVEDOR?.trim().toLowerCase() === "desligado"
                  ? "Assistente IA desligado por ASSISTENTE_IA_PROVEDOR=desligado."
                  : process.env.ASSISTENTE_IA_PROVEDOR?.trim() && process.env.ASSISTENTE_IA_PROVEDOR.trim().toLowerCase() !== "openai"
                    ? "Assistente IA desligado: ASSISTENTE_IA_PROVEDOR com valor desconhecido (use openai, simulado ou desligado)."
                    : "Assistente IA desligado: sem OPENAI_API_KEY neste ambiente.",
        );
        const metricas = new MetricasDoAssistente(cfg.precos, (linha) => logger.log(linha));
        // Limites e teto de gasto no banco: valem para todas as instâncias da API.
        return new NucleoDoAssistente(cfg, criarProvedor(cfg), servicos, metricas, undefined, new LimitesNoBanco(cfg.limites));
      },
    },
  ],
})
export class AssistenteModule {}
