import { Injectable } from "@nestjs/common";

export interface VisualizationRequest {
  photoUrl: string;
  themeId: string;
}

export interface VisualizationResult {
  status: "queued";
  message: string;
}

/**
 * Ponto de extensão para o Festaê Magic AI: cliente envia foto do ambiente,
 * IA gera visualização da festa e recomenda decoração/fornecedores.
 * Ainda não há modelo de IA por trás — só o contrato da API já wired,
 * para o app poder expor a entrada da feature ("em breve") sem retrabalho.
 */
@Injectable()
export class AiMagicService {
  async generateVisualization(_request: VisualizationRequest): Promise<VisualizationResult> {
    return {
      status: "queued",
      message:
        "Festaê Magic AI ainda não está disponível. Em breve você poderá enviar a foto do seu espaço e ver sua festa antes de reservar.",
    };
  }
}
