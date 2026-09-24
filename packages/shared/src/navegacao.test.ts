import { describe, expect, it } from "vitest";
import { LIMITE_DO_REGISTRO, destinoDoVoltar, registrarVisita, rotaDeRetorno } from "./navegacao";

const visitar = (urls: string[]) => urls.reduce<string[]>((r, u) => registrarVisita(r, u), []);

describe("telas raiz não têm Voltar", () => {
  it.each(["/", "/financeiro", "/comercial", "/comercial/orcamentos", "/comercial/funil", "/reservas", "/operacao", "/acervo/kits", "/eventos", "/clientes", "/disponibilidade"])(
    "%s",
    (url) => {
      expect(rotaDeRetorno(url)).toBeNull();
      expect(destinoDoVoltar(visitar(["/reservas", url]), url)).toBeNull();
    },
  );
});

describe("pai lógico (fallback)", () => {
  it.each([
    ["/comercial/orcamentos/novo", "/comercial/orcamentos"],
    ["/comercial/orcamentos/abc", "/comercial/orcamentos"],
    ["/comercial/orcamentos/abc/editar", "/comercial/orcamentos/abc"],
    ["/reservas/nova", "/reservas"],
    ["/reservas/r1/editar", "/reservas"],
    ["/reservas/r1/comprovante", "/reservas"],
  ])("%s -> %s", (url, pai) => {
    expect(rotaDeRetorno(url)).toBe(pai);
  });

  it("entrada direta pela URL, sem registro: vai para o pai", () => {
    expect(destinoDoVoltar([], "/comercial/orcamentos/abc")).toBe("/comercial/orcamentos");
    expect(destinoDoVoltar(["/comercial/orcamentos/abc"], "/comercial/orcamentos/abc")).toBe("/comercial/orcamentos");
  });

  it("nunca volta para login nem para a proposta pública", () => {
    const registro = visitar(["/login", "/proposta/tok", "/reservas/r1/comprovante"]);
    expect(destinoDoVoltar(registro, "/reservas/r1/comprovante")).toBe("/reservas");
  });
});

describe("contexto real, com filtros", () => {
  it("lista filtrada -> proposta -> Voltar devolve a lista com o filtro", () => {
    const registro = visitar([
      "/comercial/orcamentos",
      "/comercial/orcamentos?busca=a",
      "/comercial/orcamentos?busca=ana&situacao=ENVIADO",
      "/comercial/orcamentos/abc",
    ]);
    expect(destinoDoVoltar(registro, "/comercial/orcamentos/abc")).toBe(
      "/comercial/orcamentos?busca=ana&situacao=ENVIADO",
    );
  });

  it("filtrar letra a letra é uma visita só", () => {
    expect(visitar(["/reservas", "/reservas?busca=a", "/reservas?busca=an"])).toEqual(["/reservas?busca=an"]);
  });

  it("depois de salvar a edição, Voltar no detalhe não reabre o formulário", () => {
    const registro = visitar([
      "/comercial/orcamentos?situacao=RASCUNHO",
      "/comercial/orcamentos/abc",
      "/comercial/orcamentos/abc/editar",
      "/comercial/orcamentos/abc",
    ]);
    expect(destinoDoVoltar(registro, "/comercial/orcamentos/abc")).toBe("/comercial/orcamentos?situacao=RASCUNHO");
  });

  it("do formulário de edição, Voltar vai ao detalhe de onde veio", () => {
    const registro = visitar(["/comercial/orcamentos", "/comercial/orcamentos/abc", "/comercial/orcamentos/abc/editar"]);
    expect(destinoDoVoltar(registro, "/comercial/orcamentos/abc/editar")).toBe("/comercial/orcamentos/abc");
  });

  it("reserva aberta pela Operação volta para a Operação", () => {
    const registro = visitar(["/operacao", "/reservas/r1/editar"]);
    expect(destinoDoVoltar(registro, "/reservas/r1/editar")).toBe("/operacao");
  });

  it("contrato aberto do Financeiro volta para o Financeiro no mesmo recorte", () => {
    const registro = visitar(["/financeiro?aba=contratos&ano=2026&mes=08&busca=silva", "/reservas/r1/editar"]);
    expect(destinoDoVoltar(registro, "/reservas/r1/editar")).toBe("/financeiro?aba=contratos&ano=2026&mes=08&busca=silva");
  });

  it("comprovante depois de criar a reserva volta para a lista, não para o formulário", () => {
    const registro = visitar(["/reservas?aba=TODAS", "/reservas/nova", "/reservas/r9/comprovante"]);
    expect(destinoDoVoltar(registro, "/reservas/r9/comprovante")).toBe("/reservas?aba=TODAS");
  });

  it("o registro tem limite", () => {
    const muitos = Array.from({ length: LIMITE_DO_REGISTRO + 10 }, (_, i) => `/reservas/r${i}/editar`);
    expect(visitar(muitos)).toHaveLength(LIMITE_DO_REGISTRO);
  });
});
