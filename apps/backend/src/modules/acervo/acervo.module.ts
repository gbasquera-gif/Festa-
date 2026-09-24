import { Module } from "@nestjs/common";
import { AcervoController } from "./acervo.controller";
import { AcervoService } from "./acervo.service";

@Module({
  controllers: [AcervoController],
  providers: [AcervoService],
})
export class AcervoModule {}
