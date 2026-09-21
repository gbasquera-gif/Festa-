import { Module } from "@nestjs/common";
import { OrcamentosController } from "./orcamentos.controller";
import { PropostaController } from "./proposta.controller";
import { OrcamentosService } from "./orcamentos.service";
import { ReservationsModule } from "../reservations/reservations.module";

@Module({
  imports: [ReservationsModule],
  controllers: [OrcamentosController, PropostaController],
  providers: [OrcamentosService],
})
export class OrcamentosModule {}
