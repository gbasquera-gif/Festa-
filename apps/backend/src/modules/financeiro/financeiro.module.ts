import { Module } from "@nestjs/common";
import { FinanceiroController } from "./financeiro.controller";
import { FinanceiroService } from "./financeiro.service";
import { RetiradasService } from "./retiradas.service";

@Module({
  controllers: [FinanceiroController],
  providers: [FinanceiroService, RetiradasService],
  // O Assistente IA lê os mesmos números que a tela: nada recalculado fora daqui.
  exports: [FinanceiroService, RetiradasService],
})
export class FinanceiroModule {}
