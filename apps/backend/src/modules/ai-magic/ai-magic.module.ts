import { Module } from "@nestjs/common";
import { AiMagicController } from "./ai-magic.controller";
import { AiMagicService } from "./ai-magic.service";

@Module({
  controllers: [AiMagicController],
  providers: [AiMagicService],
})
export class AiMagicModule {}
