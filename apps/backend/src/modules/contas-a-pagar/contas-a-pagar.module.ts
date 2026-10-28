import { Module } from "@nestjs/common";
import { FinanceiroModule } from "../financeiro/financeiro.module";
import { AvisosService } from "./avisos/avisos.service";
import { AvisosController, ContasAPagarController } from "./contas-a-pagar.controller";
import { ContasService } from "./contas.service";
import { RecorrenciasService } from "./recorrencias.service";

@Module({
  imports: [FinanceiroModule],
  controllers: [ContasAPagarController, AvisosController],
  providers: [ContasService, RecorrenciasService, AvisosService],
})
export class ContasAPagarModule {}
