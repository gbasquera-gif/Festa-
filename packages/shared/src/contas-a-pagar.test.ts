import { describe, expect, it } from "vitest";
import {
  atualizacaoDaConta,
  candidatosDeDuplicidade,
  diaPrevisto,
  diasAte,
  diasNoMes,
  domingoDePascoa,
  ehDiaUtil,
  feriadosNacionais,
  marcoDoDia,
  normalizarTexto,
  ocorrenciasAutomaticas,
  ocorrenciasEntre,
  ocorrenciasRetroativas,
  proximosVencimentos,
  semelhancaDeDescricao,
  situacaoDaConta,
  somarMeses,
  textoDoPrazo,
  vencimentoDaCompetencia,
  type ContaPrevista,
  type LancamentoExistente,
  type RegraDeVencimento,
} from "./contas-a-pagar";

const regra = (parcial: Partial<RegraDeVencimento> = {}): RegraDeVencimento => ({
  diaDoVencimento: 10,
  intervaloMeses: 1,
  dataInicial: "2026-01-01",
  dataFinal: null,
  ajusteDiaInexistente: "ULTIMO_DIA_DO_MES",
  ajusteDiaNaoUtil: "MANTER",
  ...parcial,
});

describe("calendário", () => {
  it("conta os dias de cada mês, com fevereiro bissexto", () => {
    expect(diasNoMes("2027-02")).toBe(28);
    expect(diasNoMes("2028-02")).toBe(29);
    expect(diasNoMes("2100-02")).toBe(28);
    expect(diasNoMes("2000-02")).toBe(29);
    expect(diasNoMes("2026-04")).toBe(30);
    expect(diasNoMes("2026-12")).toBe(31);
  });

  it("soma meses atravessando o ano, para frente e para trás", () => {
    expect(somarMeses("2026-11", 1)).toBe("2026-12");
    expect(somarMeses("2026-12", 1)).toBe("2027-01");
    expect(somarMeses("2027-01", -1)).toBe("2026-12");
    expect(somarMeses("2026-10", 12)).toBe("2027-10");
    expect(somarMeses("2026-10", -25)).toBe("2024-09");
  });

  it("conta dias até uma data, negativo quando já passou", () => {
    expect(diasAte("2026-10-28", "2026-10-28")).toBe(0);
    expect(diasAte("2026-10-28", "2026-11-04")).toBe(7);
    expect(diasAte("2026-12-31", "2027-01-01")).toBe(1);
    expect(diasAte("2026-11-04", "2026-10-28")).toBe(-7);
  });

  it("acha a Páscoa (e por ela a Sexta-feira Santa)", () => {
    expect(domingoDePascoa(2024)).toBe("2024-03-31");
    expect(domingoDePascoa(2025)).toBe("2025-04-20");
    expect(domingoDePascoa(2026)).toBe("2026-04-05");
    expect(domingoDePascoa(2027)).toBe("2027-03-28");
    expect(feriadosNacionais(2026)).toContain("2026-04-03");
  });

  it("conhece só os feriados nacionais; Consciência Negra a partir de 2024", () => {
    const de2026 = feriadosNacionais(2026);
    expect(de2026).toEqual([
      "2026-01-01",
      "2026-04-03",
      "2026-04-21",
      "2026-05-01",
      "2026-09-07",
      "2026-10-12",
      "2026-11-02",
      "2026-11-15",
      "2026-11-20",
      "2026-12-25",
    ]);
    expect(feriadosNacionais(2023)).not.toContain("2023-11-20");
    // Carnaval e Corpus Christi são ponto facultativo: não presumidos.
    expect(de2026).not.toContain("2026-02-17");
    expect(de2026).not.toContain("2026-06-04");
  });

  it("dia útil: nem fim de semana, nem feriado nacional", () => {
    expect(ehDiaUtil("2026-11-20")).toBe(false); // sexta, Consciência Negra
    expect(ehDiaUtil("2026-11-21")).toBe(false); // sábado
    expect(ehDiaUtil("2026-11-22")).toBe(false); // domingo
    expect(ehDiaUtil("2026-11-23")).toBe(true);
    expect(ehDiaUtil("2026-02-17")).toBe(true); // terça de Carnaval
  });
});

describe("vencimento de cada competência", () => {
  it("dia que existe no mês é ele mesmo", () => {
    expect(diaPrevisto("2026-11", regra({ diaDoVencimento: 10 }))).toBe("2026-11-10");
  });

  it("dia 31 em mês de 30: último dia ou 1º do mês seguinte, conforme a conta", () => {
    expect(diaPrevisto("2026-04", regra({ diaDoVencimento: 31 }))).toBe("2026-04-30");
    expect(
      diaPrevisto("2026-04", regra({ diaDoVencimento: 31, ajusteDiaInexistente: "PRIMEIRO_DIA_DO_MES_SEGUINTE" })),
    ).toBe("2026-05-01");
  });

  it("fevereiro com 29, 30 e 31, em ano comum e bissexto", () => {
    for (const dia of [29, 30, 31]) {
      expect(diaPrevisto("2027-02", regra({ diaDoVencimento: dia }))).toBe("2027-02-28");
      expect(
        diaPrevisto("2027-02", regra({ diaDoVencimento: dia, ajusteDiaInexistente: "PRIMEIRO_DIA_DO_MES_SEGUINTE" })),
      ).toBe("2027-03-01");
    }
    expect(diaPrevisto("2028-02", regra({ diaDoVencimento: 29 }))).toBe("2028-02-29");
    expect(diaPrevisto("2028-02", regra({ diaDoVencimento: 30 }))).toBe("2028-02-29");
    expect(
      diaPrevisto("2028-02", regra({ diaDoVencimento: 30, ajusteDiaInexistente: "PRIMEIRO_DIA_DO_MES_SEGUINTE" })),
    ).toBe("2028-03-01");
  });

  it("dezembro para o mês seguinte vira janeiro do outro ano", () => {
    // Dezembro tem 31; o ajuste só entra em mês curto. Novembro, dia 31 → 1º/12.
    expect(
      diaPrevisto("2026-11", regra({ diaDoVencimento: 31, ajusteDiaInexistente: "PRIMEIRO_DIA_DO_MES_SEGUINTE" })),
    ).toBe("2026-12-01");
  });

  it("fim de semana e feriado: mantém por padrão; antecipa ou adia quando a conta pede", () => {
    const vinte = (ajusteDiaNaoUtil: RegraDeVencimento["ajusteDiaNaoUtil"]) =>
      vencimentoDaCompetencia("2026-11", regra({ diaDoVencimento: 20, ajusteDiaNaoUtil }));
    expect(vinte("MANTER")).toBe("2026-11-20");
    expect(vinte("ANTECIPAR")).toBe("2026-11-19");
    expect(vinte("ADIAR")).toBe("2026-11-23"); // feriado, sábado, domingo
  });

  it("Sexta-feira Santa e virada de ano", () => {
    expect(vencimentoDaCompetencia("2026-04", regra({ diaDoVencimento: 3, ajusteDiaNaoUtil: "ADIAR" }))).toBe(
      "2026-04-06",
    );
    expect(vencimentoDaCompetencia("2027-01", regra({ diaDoVencimento: 1, ajusteDiaNaoUtil: "ADIAR" }))).toBe(
      "2027-01-04",
    );
    expect(vencimentoDaCompetencia("2027-01", regra({ diaDoVencimento: 1, ajusteDiaNaoUtil: "ANTECIPAR" }))).toBe(
      "2026-12-31",
    );
  });
});

describe("competências da conta", () => {
  it("mensal com dia 31 atravessando o ano e fevereiro", () => {
    const r = regra({ diaDoVencimento: 31, dataInicial: "2026-11-05" });
    expect(ocorrenciasEntre(r, "2026-11", "2027-03")).toEqual([
      { competencia: "2026-11", vencimento: "2026-11-30" },
      { competencia: "2026-12", vencimento: "2026-12-31" },
      { competencia: "2027-01", vencimento: "2027-01-31" },
      { competencia: "2027-02", vencimento: "2027-02-28" },
      { competencia: "2027-03", vencimento: "2027-03-31" },
    ]);
  });

  it("começo depois do dia do mês: o primeiro vencimento é no mês seguinte", () => {
    const r = regra({ diaDoVencimento: 10, dataInicial: "2026-11-20" });
    expect(ocorrenciasEntre(r, "2026-11", "2027-01").map((o) => o.competencia)).toEqual(["2026-12", "2027-01"]);
  });

  it("data final inclusiva encerra a sequência", () => {
    const r = regra({ diaDoVencimento: 10, dataInicial: "2026-01-01", dataFinal: "2026-03-10" });
    expect(ocorrenciasEntre(r, "2026-01", "2026-12").map((o) => o.competencia)).toEqual([
      "2026-01",
      "2026-02",
      "2026-03",
    ]);
    const antes = regra({ diaDoVencimento: 10, dataInicial: "2026-01-01", dataFinal: "2026-03-09" });
    expect(ocorrenciasEntre(antes, "2026-01", "2026-12")).toHaveLength(2);
  });

  it("trimestral e anual andam na cadência da data inicial", () => {
    const tri = regra({ intervaloMeses: 3, dataInicial: "2026-01-15", diaDoVencimento: 15 });
    expect(ocorrenciasEntre(tri, "2026-01", "2026-12").map((o) => o.competencia)).toEqual([
      "2026-01",
      "2026-04",
      "2026-07",
      "2026-10",
    ]);
    // Começando a busca no meio da cadência.
    expect(ocorrenciasEntre(tri, "2026-05", "2027-02").map((o) => o.competencia)).toEqual([
      "2026-07",
      "2026-10",
      "2027-01",
    ]);
    const anual = regra({ intervaloMeses: 12, dataInicial: "2026-03-01", diaDoVencimento: 31 });
    expect(ocorrenciasEntre(anual, "2026-01", "2028-12")).toEqual([
      { competencia: "2026-03", vencimento: "2026-03-31" },
      { competencia: "2027-03", vencimento: "2027-03-31" },
      { competencia: "2028-03", vencimento: "2028-03-31" },
    ]);
  });

  it("prévia: os próximos vencimentos a partir de hoje", () => {
    const r = regra({ diaDoVencimento: 30, dataInicial: "2026-10-01" });
    expect(proximosVencimentos(r, "2026-10-28", 5).map((o) => o.vencimento)).toEqual([
      "2026-10-30",
      "2026-11-30",
      "2026-12-30",
      "2027-01-30",
      "2027-02-28",
    ]);
    const curta = regra({ diaDoVencimento: 5, dataInicial: "2026-10-01", dataFinal: "2026-12-31" });
    expect(proximosVencimentos(curta, "2026-10-28", 5).map((o) => o.vencimento)).toEqual([
      "2026-11-05",
      "2026-12-05",
    ]);
  });
});

describe("geração automática e retroativa", () => {
  it("gera o mês corrente e o seguinte, nunca o que venceu antes do cadastro", () => {
    const r = regra({ diaDoVencimento: 10, dataInicial: "2026-07-01" });
    expect(ocorrenciasAutomaticas(r, "2026-10-28", "2026-10-28")).toEqual([
      { competencia: "2026-11", vencimento: "2026-11-10" },
    ]);
    const trinta = regra({ diaDoVencimento: 30, dataInicial: "2026-07-01" });
    expect(ocorrenciasAutomaticas(trinta, "2026-10-28", "2026-10-28").map((o) => o.competencia)).toEqual([
      "2026-10",
      "2026-11",
    ]);
  });

  it("atravessa o ano", () => {
    const r = regra({ diaDoVencimento: 10, dataInicial: "2026-01-01" });
    expect(ocorrenciasAutomaticas(r, "2026-01-01", "2026-12-15").map((o) => o.competencia)).toEqual([
      "2026-10",
      "2026-11",
      "2026-12",
      "2027-01",
    ]);
  });

  it("os meses anteriores ao cadastro só aparecem como oferta, nunca automáticos", () => {
    const r = regra({ diaDoVencimento: 10, dataInicial: "2026-07-01" });
    const retro = ocorrenciasRetroativas(r, "2026-10-28", "2026-10-28");
    expect(retro.map((o) => o.competencia)).toEqual(["2026-07", "2026-08", "2026-09", "2026-10"]);
    const auto = ocorrenciasAutomaticas(r, "2026-10-28", "2026-10-28").map((o) => o.competencia);
    expect(retro.some((o) => auto.includes(o.competencia))).toBe(false);
  });

  it("tarefa parada: recupera o que venceu depois do cadastro", () => {
    const r = regra({ diaDoVencimento: 10, dataInicial: "2026-09-01" });
    // Cadastrada em 05/09; a tarefa só voltou a rodar em 20/11.
    expect(ocorrenciasAutomaticas(r, "2026-09-05", "2026-11-20").map((o) => o.competencia)).toEqual([
      "2026-09",
      "2026-10",
      "2026-11",
      "2026-12",
    ]);
  });

  it("retomada: o período pausado não volta sozinho", () => {
    const r = regra({ diaDoVencimento: 10, dataInicial: "2026-01-01" });
    // Pausada em setembro, retomada em 15/11.
    expect(ocorrenciasAutomaticas(r, "2026-11-15", "2026-11-15").map((o) => o.competencia)).toEqual(["2026-12"]);
    expect(ocorrenciasRetroativas(r, "2026-11-15", "2026-11-15").map((o) => o.competencia)).toContain("2026-10");
  });

  it("conta com início no futuro não gera nada antes da hora", () => {
    const r = regra({ diaDoVencimento: 10, dataInicial: "2027-03-01" });
    expect(ocorrenciasAutomaticas(r, "2026-10-28", "2026-10-28")).toEqual([]);
    expect(ocorrenciasAutomaticas(r, "2026-10-28", "2027-02-15").map((o) => o.competencia)).toEqual(["2027-03"]);
  });
});

describe("situação de uma conta", () => {
  const hoje = "2026-10-28";
  it("só o pagamento registrado diz que foi paga", () => {
    expect(situacaoDaConta({ pagoEm: "2026-10-01", venceEm: "2026-09-01" }, hoje)).toBe("PAGA");
    expect(situacaoDaConta({ pagoEm: null, venceEm: "2026-10-27" }, hoje)).toBe("VENCIDA");
    expect(situacaoDaConta({ pagoEm: null, venceEm: "2026-10-28" }, hoje)).toBe("VENCE_HOJE");
    expect(situacaoDaConta({ pagoEm: null, venceEm: "2026-11-04" }, hoje)).toBe("PROXIMA");
    expect(situacaoDaConta({ pagoEm: null, venceEm: "2026-11-05" }, hoje)).toBe("A_VENCER");
    expect(situacaoDaConta({ pagoEm: null, venceEm: null }, hoje)).toBe("SEM_VENCIMENTO");
  });

  it("prazo em palavras", () => {
    expect(textoDoPrazo(7)).toBe("vence em 7 dias");
    expect(textoDoPrazo(1)).toBe("vence amanhã");
    expect(textoDoPrazo(0)).toBe("vence hoje");
    expect(textoDoPrazo(-1)).toBe("venceu ontem");
    expect(textoDoPrazo(-3)).toBe("venceu há 3 dias");
  });
});

describe("marco do aviso de cada dia", () => {
  const todos = [7, 3, 1, 0, -1];
  const vence = "2026-11-10";

  it("cada marco no seu dia", () => {
    expect(marcoDoDia(vence, "2026-11-02", todos)).toBeNull();
    expect(marcoDoDia(vence, "2026-11-03", todos)).toBe(7);
    expect(marcoDoDia(vence, "2026-11-07", todos)).toBe(3);
    expect(marcoDoDia(vence, "2026-11-09", todos)).toBe(1);
    expect(marcoDoDia(vence, "2026-11-10", todos)).toBe(0);
    expect(marcoDoDia(vence, "2026-11-11", todos)).toBe(-1);
  });

  it("tarefa parada: sai o marco mais recente, uma vez só, dentro da janela", () => {
    // Parada de 03 a 08/11: em 08/11 faltam 2 dias — sai o de 3 dias, não o de 7.
    expect(marcoDoDia(vence, "2026-11-08", todos)).toBe(3);
    // De 7 dias, perdido há mais de 2 dias: deixado de lado.
    expect(marcoDoDia(vence, "2026-11-06", todos)).toBeNull();
    expect(marcoDoDia(vence, "2026-11-13", todos)).toBe(-1);
    expect(marcoDoDia(vence, "2026-11-14", todos)).toBeNull();
  });

  it("conta vencida há meses não dispara aviso na primeira execução", () => {
    expect(marcoDoDia("2026-07-10", "2026-10-28", todos)).toBeNull();
  });

  it("respeita os marcos desligados", () => {
    expect(marcoDoDia(vence, "2026-11-03", [0])).toBeNull();
    expect(marcoDoDia(vence, "2026-11-10", [0])).toBe(0);
    expect(marcoDoDia(vence, "2026-11-11", [7, 3])).toBeNull();
    expect(marcoDoDia(vence, "2026-11-10", [])).toBeNull();
  });

  it("conta criada a 5 dias do vencimento ainda recebe o aviso", () => {
    expect(marcoDoDia(vence, "2026-11-05", todos)).toBe(7);
  });
});

describe("conferência de duplicidade", () => {
  const prevista: ContaPrevista = {
    descricao: "Aluguel do galpão",
    natureza: "CUSTEIO",
    fornecedor: "Imobiliária Exemplo",
    valor: 1500,
    tipoDeValor: "FIXO",
    vencimento: "2026-11-10",
  };
  const lancamento = (parcial: Partial<LancamentoExistente>): LancamentoExistente => ({
    id: "g1",
    descricao: "Aluguel galpão novembro",
    natureza: "CUSTEIO",
    fornecedor: null,
    valor: 1500,
    venceEm: null,
    pagoEm: "2026-11-09",
    recorrenciaId: null,
    ...parcial,
  });

  it("normaliza acento, caixa e pontuação", () => {
    expect(normalizarTexto("  Aluguel do GALPÃO — nov. ")).toBe("aluguel do galpao nov");
    expect(semelhancaDeDescricao("Aluguel do galpão", "aluguel galpao")).toBe(1);
    expect(semelhancaDeDescricao("Energia elétrica", "Internet fibra")).toBe(0);
  });

  it("acha o lançamento manual da mesma conta", () => {
    expect(candidatosDeDuplicidade(prevista, [lancamento({})]).map((c) => c.id)).toEqual(["g1"]);
  });

  it("mesmo fornecedor com descrição diferente também é candidato", () => {
    const l = lancamento({ descricao: "Boleto mensal", fornecedor: "imobiliaria exemplo" });
    expect(candidatosDeDuplicidade(prevista, [l])).toHaveLength(1);
  });

  it("descarta natureza diferente, data longe, valor fixo divergente e o que já tem recorrência", () => {
    expect(candidatosDeDuplicidade(prevista, [lancamento({ natureza: "CONSUMO" })])).toEqual([]);
    expect(candidatosDeDuplicidade(prevista, [lancamento({ pagoEm: "2026-10-01" })])).toEqual([]);
    expect(candidatosDeDuplicidade(prevista, [lancamento({ valor: 1800 })])).toEqual([]);
    expect(candidatosDeDuplicidade(prevista, [lancamento({ recorrenciaId: "r9" })])).toEqual([]);
    expect(candidatosDeDuplicidade(prevista, [lancamento({ descricao: "Material de festa" })])).toEqual([]);
  });

  it("valor fixo aceita diferença de centavos; variável aceita a oscilação da fatura", () => {
    expect(candidatosDeDuplicidade(prevista, [lancamento({ valor: 1500.9 })])).toHaveLength(1);
    const energia: ContaPrevista = { ...prevista, descricao: "Energia", fornecedor: null, valor: 300, tipoDeValor: "VARIAVEL" };
    expect(candidatosDeDuplicidade(energia, [lancamento({ descricao: "Energia outubro", valor: 520 })])).toHaveLength(1);
    expect(candidatosDeDuplicidade(energia, [lancamento({ descricao: "Energia outubro", valor: 1200 })])).toEqual([]);
  });

  it("ordena pelo mais próximo do vencimento", () => {
    const longe = lancamento({ id: "longe", pagoEm: "2026-11-20" });
    const perto = lancamento({ id: "perto", venceEm: "2026-11-10", pagoEm: null });
    expect(candidatosDeDuplicidade(prevista, [longe, perto]).map((c) => c.id)).toEqual(["perto", "longe"]);
  });
});

describe("edição da recorrência nas contas em aberto", () => {
  const antes = {
    descricao: "Internet",
    natureza: "CUSTEIO" as const,
    categoria: "Serviços",
    fornecedor: "Provedor",
    valor: 120,
    vencimento: "2026-12-10",
  };

  it("conta intocada acompanha a edição", () => {
    const conta = { ...antes, venceEm: "2026-12-10" };
    const depois = { ...antes, valor: 140, vencimento: "2026-12-15" };
    expect(atualizacaoDaConta(conta, antes, depois)).toEqual({ valor: 140, venceEm: "2026-12-15" });
  });

  it("ajuste feito à mão na conta não é desfeito", () => {
    const conta = { ...antes, valor: 133.4, venceEm: "2026-12-12" };
    const depois = { ...antes, valor: 140, vencimento: "2026-12-15", descricao: "Internet fibra" };
    expect(atualizacaoDaConta(conta, antes, depois)).toEqual({ descricao: "Internet fibra" });
  });

  it("sem mudança, nada a gravar", () => {
    const conta = { ...antes, venceEm: "2026-12-10" };
    expect(atualizacaoDaConta(conta, antes, antes)).toEqual({});
  });
});
