import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { AiMagicService, type VisualizationRequest } from "./ai-magic.service";

@ApiTags("ai-magic")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("ai-magic")
export class AiMagicController {
  constructor(private readonly aiMagicService: AiMagicService) {}

  @Post("visualize")
  visualize(@Body() body: VisualizationRequest) {
    return this.aiMagicService.generateVisualization(body);
  }
}
