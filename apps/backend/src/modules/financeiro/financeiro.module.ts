import { Module } from "@nestjs/common";
import { FinanceiroController } from "./financeiro.controller";
import { FinanceiroService } from "./financeiro.service";

@Module({
  controllers: [FinanceiroController],
  providers: [FinanceiroService],
  // O Assistente IA lê os mesmos números que a tela: nada recalculado fora daqui.
  exports: [FinanceiroService],
})
export class FinanceiroModule {}
