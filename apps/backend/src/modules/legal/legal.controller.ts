import { Controller, Get, Header, Param, NotFoundException } from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";
import { LEGAL_DOCUMENTS, type LegalDocument } from "@festae/shared";
import { renderLegalDocument } from "./legal.html";

/**
 * Política de Privacidade e Termos de Uso em página pública.
 *
 * Apple e Google exigem uma URL acessível sem login para a ficha do app, e a
 * Festaê ainda não tem site. Servir daqui resolve isso hoje e mantém uma
 * fonte de verdade só: o mesmo texto que o aplicativo mostra.
 *
 * Fica fora do prefixo /api/v1 de propósito — é página para pessoa ler, não
 * endpoint de API.
 */
@ApiExcludeController()
@Controller("legal")
export class LegalController {
  private find(slug: string): LegalDocument {
    const document = LEGAL_DOCUMENTS.find((item) => item.slug === slug);
    if (!document) throw new NotFoundException("Documento não encontrado.");
    return document;
  }

  @Get(":slug")
  @Header("Content-Type", "text/html; charset=utf-8")
  // Cache curto: o texto muda pouco, mas uma correção precisa chegar rápido.
  @Header("Cache-Control", "public, max-age=3600")
  page(@Param("slug") slug: string) {
    return renderLegalDocument(this.find(slug));
  }

  @Get(":slug/json")
  json(@Param("slug") slug: string) {
    return this.find(slug);
  }
}
