import path from "node:path";
import PDFDocument from "pdfkit";
import type { RelatorioExecutivo } from "./relatorio";
import { nomeDoMes } from "./relatorio";

/**
 * O Relatório Executivo Financeiro em PDF: uma página A4, texto vetorial.
 *
 * Desenhado com pdfkit no servidor, e não a partir da tela: o documento não
 * depende de viewport, de navegador nem de impressora, e os números são
 * texto de verdade (selecionáveis, nítidos em qualquer zoom). Gerado sob
 * demanda e devolvido direto — nada é gravado.
 *
 * Só desenha. Todo número chega pronto de `montarRelatorioExecutivo`.
 */

const COR = {
  navy: "#1B2E4B",
  tinta: "#132238",
  coral: "#E05A3A",
  coralEscuro: "#C4472A",
  dourado: "#C69654",
  douradoEscuro: "#A87C3D",
  douradoClaro: "#F3EBDD",
  creme: "#FBF7F2",
  linha: "#E8DFD5",
  apagado: "#7A7266",
};

const A4 = { largura: 595.28, altura: 841.89 };
const MARGEM = 42;
const LARGURA = A4.largura - MARGEM * 2;

/**
 * Só Inter, em WOFF. A IBM Plex Mono do painel não serve aqui: a versão do
 * Fontsource quebra o leitor de fontes do pdfkit, e o pacote oficial não
 * traz TTF. Números usam algarismos tabulares da Inter (`tnum`), que
 * alinham como os da mono; rótulos, caixa-alta espaçada.
 */
function arquivoDeFonte(pacote: string, arquivo: string): string {
  return path.join(path.dirname(require.resolve(`${pacote}/package.json`)), "files", arquivo);
}

const FONTES = {
  regular: arquivoDeFonte("@fontsource/inter", "inter-latin-400-normal.woff"),
  media: arquivoDeFonte("@fontsource/inter", "inter-latin-500-normal.woff"),
  semi: arquivoDeFonte("@fontsource/inter", "inter-latin-600-normal.woff"),
  negrito: arquivoDeFonte("@fontsource/inter", "inter-latin-700-normal.woff"),
} as const;
type Fonte = keyof typeof FONTES;

// De `src/modules/financeiro` ou `dist/modules/financeiro`, a marca fica em `apps/backend/assets`.
const MARCA = path.resolve(__dirname, "..", "..", "..", "assets", "marca-festae.png");

// ---------------------------------------------------------------- formatação

/** "R$ 5.244,90"; negativo com o sinal de menos tipográfico. */
export function reais(valor: number): string {
  const centavos = Math.round(Math.abs(valor) * 100);
  const inteiro = Math.floor(centavos / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const texto = `R$ ${inteiro},${String(centavos % 100).padStart(2, "0")}`;
  return valor < 0 && centavos > 0 ? `−${texto}` : texto;
}

/** "54,3%"; nulo vira "—". */
export function percentual(valor: number | null, casas = 1): string {
  if (valor === null || !Number.isFinite(valor)) return "—";
  return `${(valor * 100).toFixed(casas).replace(".", ",")}%`;
}

/** "+12,4%" / "−3,1%"; sem base, "—". */
export function variacaoEmTexto(percentualDaVariacao: number | null): string {
  if (percentualDaVariacao === null || !Number.isFinite(percentualDaVariacao)) return "—";
  const texto = percentual(Math.abs(percentualDaVariacao));
  if (Math.abs(percentualDaVariacao) < 0.0005) return "0,0%";
  return percentualDaVariacao > 0 ? `+${texto}` : `−${texto}`;
}

const minusculo = (mes: string) => nomeDoMes(mes).replace(/^./, (c) => c.toLowerCase());

// ---------------------------------------------------------------- desenho

export type PdfGerado = {
  pdf: Buffer;
  /** Todo texto desenhado, na ordem — para teste e conferência. */
  textos: string[];
  /** Caracteres que alguma fonte não tinha. Tem de ficar vazio. */
  semGlifo: string[];
  paginas: number;
};

export function gerarRelatorioPdf(r: RelatorioExecutivo): Promise<PdfGerado> {
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 0, bottom: 0, left: 0, right: 0 },
    autoFirstPage: true,
    info: {
      Title: `Relatório Executivo Financeiro — ${r.periodo}`,
      Author: "Festaê",
      Subject: "Relatório Executivo Financeiro",
      Creator: "Festaê Gestão",
    },
  });
  for (const [nome, arquivo] of Object.entries(FONTES)) doc.registerFont(nome, arquivo);

  const textos: string[] = [];
  const semGlifo = new Set<string>();
  let paginas = 1;
  doc.on("pageAdded", () => {
    paginas += 1;
  });

  const partes: Buffer[] = [];
  doc.on("data", (parte: Buffer) => partes.push(parte));

  type Opcoes = {
    fonte?: Fonte;
    tamanho?: number;
    cor?: string;
    largura?: number;
    alinhamento?: "left" | "right" | "center";
    espacamento?: number;
    entrelinha?: number;
    opacidade?: number;
    /** Algarismos tabulares: números alinhados, como na mono do painel. */
    tabular?: boolean;
  };

  function escrever(texto: string, x: number, y: number, o: Opcoes = {}) {
    doc.font(o.fonte ?? "regular").fontSize(o.tamanho ?? 9).fillColor(o.cor ?? COR.tinta, o.opacidade ?? 1);
    const fonte = (doc as unknown as { _font: { font?: { hasGlyphForCodePoint(cp: number): boolean } } })._font.font;
    for (const caractere of texto) {
      if (caractere.trim() && fonte && !fonte.hasGlyphForCodePoint(caractere.codePointAt(0)!)) semGlifo.add(caractere);
    }
    textos.push(texto);
    doc.text(texto, x, y, {
      width: o.largura,
      align: o.alinhamento ?? "left",
      characterSpacing: o.espacamento ?? 0,
      lineGap: o.entrelinha ?? 0,
      lineBreak: o.largura !== undefined,
      features: o.tabular ? ["tnum"] : [],
    });
    doc.fillOpacity(1);
    return doc.y;
  }

  /** O maior corpo em que o texto cabe na largura, até o máximo pedido. */
  function corpoQueCabe(texto: string, fonte: Fonte, maximo: number, largura: number): number {
    let tamanho = maximo;
    doc.font(fonte);
    while (tamanho > 9 && doc.fontSize(tamanho).widthOfString(texto, { features: ["tnum"] }) > largura) tamanho -= 0.5;
    return tamanho;
  }

  /** Rótulo em caixa-alta espaçada, sempre numa linha só: aperta o espaçamento antes de quebrar. */
  function rotulo(texto: string, x: number, y: number, cor = COR.apagado, largura?: number, alinhamento?: "left" | "right") {
    const caixaAlta = texto.toUpperCase();
    let espacamento = 0.9;
    let tamanho = 6.4;
    if (largura !== undefined) {
      doc.font("semi");
      const cabe = () =>
        doc.fontSize(tamanho).widthOfString(caixaAlta, { characterSpacing: espacamento }) <= largura - 1;
      while (!cabe() && espacamento > 0.2) espacamento -= 0.1;
      while (!cabe() && tamanho > 5.4) tamanho -= 0.2;
    }
    return escrever(caixaAlta, x, y, { fonte: "semi", tamanho, cor, espacamento, largura, alinhamento });
  }

  function secao(titulo: string, subtitulo: string, y: number): number {
    escrever(titulo, MARGEM, y, { fonte: "semi", tamanho: 10.5, cor: COR.tinta });
    rotulo(subtitulo, MARGEM, y + 2.5, COR.douradoEscuro, LARGURA, "right");
    return y + 19;
  }

  type Cartao = {
    rotulo: string;
    valor: string;
    nota?: string;
    tom?: "escuro" | "claro" | "acervo";
    corDoValor?: string;
  };

  function cartao(c: Cartao, x: number, y: number, largura: number, altura: number) {
    const fundo = c.tom === "escuro" ? COR.navy : c.tom === "acervo" ? COR.douradoClaro : COR.creme;
    doc.roundedRect(x, y, largura, altura, 6).fillColor(fundo).fill();
    if (c.tom !== "escuro" && c.tom !== "acervo") {
      doc.roundedRect(x + 0.25, y + 0.25, largura - 0.5, altura - 0.5, 6).lineWidth(0.5).strokeColor(COR.linha).stroke();
    }
    const dentro = largura - 24;
    rotulo(c.rotulo, x + 12, y + 12, c.tom === "escuro" ? COR.dourado : c.tom === "acervo" ? COR.douradoEscuro : COR.apagado, dentro);
    const corpo = corpoQueCabe(c.valor, "negrito", 19, dentro);
    escrever(c.valor, x + 12, y + 27, {
      fonte: "negrito",
      tabular: true,
      tamanho: corpo,
      cor: c.corDoValor ?? (c.tom === "escuro" ? "#FFFFFF" : COR.tinta),
    });
    if (c.nota) {
      escrever(c.nota, x + 12, y + 53, {
        tamanho: 7.4,
        cor: c.tom === "escuro" ? "#FFFFFF" : COR.apagado,
        opacidade: c.tom === "escuro" ? 0.72 : 1,
        largura: dentro,
      });
    }
  }

  function linhaDeCartoes(cartoes: Cartao[], y: number, altura: number) {
    const vao = 10;
    const largura = (LARGURA - vao * (cartoes.length - 1)) / cartoes.length;
    cartoes.forEach((c, i) => cartao(c, MARGEM + i * (largura + vao), y, largura, altura));
    return y + altura;
  }

  // ------------------------------------------------------------ cabeçalho

  doc.image(MARCA, MARGEM - 3, 34, { height: 46 });
  rotulo("Relatório Executivo Financeiro", MARGEM, 42, COR.douradoEscuro, LARGURA, "right");
  escrever(`Período: ${r.periodo}`, MARGEM, 54, { fonte: "semi", tamanho: 17, cor: COR.tinta, largura: LARGURA, alinhamento: "right" });
  escrever(`Emitido em ${r.emitidoEmTexto}`, MARGEM, 76, { tamanho: 7.6, cor: COR.apagado, largura: LARGURA, alinhamento: "right" });

  doc.moveTo(MARGEM, 96).lineTo(MARGEM + LARGURA, 96).lineWidth(0.5).strokeColor(COR.linha).stroke();
  doc.moveTo(MARGEM, 96).lineTo(MARGEM + 46, 96).lineWidth(1.6).strokeColor(COR.coral).stroke();

  // ------------------------------------------------------------ faturamento

  let y = secao("Faturamento", "Competência: mês da data da festa", 112);
  y = linhaDeCartoes(
    [
      {
        rotulo: "Faturamento bruto do mês",
        valor: reais(r.faturamento.mes),
        nota: `${r.faturamento.festasNoMes} ${r.faturamento.festasNoMes === 1 ? "festa" : "festas"} em ${minusculo(r.mes)}`,
        tom: "escuro",
      },
      {
        rotulo: "Faturamento acumulado no ano",
        valor: reais(r.faturamento.ano),
        nota: r.mes.endsWith("-01") ? `Janeiro de ${r.ano}` : `Janeiro a ${minusculo(r.mes)}`,
      },
      {
        rotulo: "Faturamento acumulado total",
        valor: reais(r.faturamento.total),
        nota: r.faturamento.desde
          ? `Desde ${minusculo(r.faturamento.desde)}, primeiro mês com contrato registrado`
          : "Nenhum contrato registrado até este mês",
      },
    ],
    y,
    80,
  );

  const cmp = r.comparacao;
  escrever(
    cmp.temBase
      ? `Em relação a ${minusculo(cmp.mesAnterior)}:  faturamento ${variacaoEmTexto(cmp.faturamento.percentual)}  ·  resultado operacional ${variacaoEmTexto(cmp.resultado.percentual)}`
      : `${cmp.periodoAnterior} não teve movimento: não há base de comparação.`,
    MARGEM,
    y + 8,
    { tamanho: 7.6, cor: COR.apagado, largura: LARGURA },
  );

  // ------------------------------------------------------------ resultado

  const res = r.resultado;
  // Retenção de cancelamento entra no resultado em linha própria, e só é
  // citada quando existe: um mês sem cancelamento lê como sempre leu.
  const comRetencao = res.retencao > 0;
  y = secao(
    "Resultado operacional do mês",
    comRetencao ? "Faturamento + retenção − consumo e custeio" : "Faturamento − consumo e custeio",
    y + 38,
  );
  y = linhaDeCartoes(
    [
      {
        rotulo: "Resultado operacional",
        valor: reais(res.resultado),
        nota: comRetencao
          ? "Faturamento + retenção por cancelamento − despesas operacionais"
          : "Faturamento do mês − despesas operacionais",
        corDoValor: res.resultado < 0 ? COR.coralEscuro : COR.tinta,
      },
      {
        rotulo: "Margem operacional",
        valor: percentual(res.margem),
        nota:
          res.margem === null
            ? "Sem faturamento no mês"
            : comRetencao
              ? "Resultado ÷ (faturamento + retenção)"
              : "Resultado operacional ÷ faturamento",
      },
      {
        rotulo: "Despesas operacionais do mês",
        valor: reais(res.despesas),
        nota: "Consumo + custeio, pela data de pagamento",
      },
    ],
    y,
    80,
  );
  escrever(
    (comRetencao
      ? `Inclui ${reais(res.retencao)} de receita de retenção por cancelamento, separada do faturamento das festas. `
      : "") +
      "Resultado operacional não é lucro líquido: não considera impostos, pró-labore nem depreciação. Investimento em acervo não entra nesta conta.",
    MARGEM,
    y + 8,
    { tamanho: 7.6, cor: COR.apagado, largura: LARGURA },
  );

  // ------------------------------------------------------------ recebimentos

  y = secao("Posição de recebimentos", "Caixa: pagamentos confirmados · carteira ativa", y + 40);
  const rec = r.recebimentos;
  const topoRecebimentos = y;
  y = linhaDeCartoes(
    [
      { rotulo: "Total recebido", valor: reais(rec.recebido), nota: "Somente pagamentos confirmados" },
      { rotulo: "Total a receber", valor: reais(rec.aReceber), nota: "Saldo dos contratos vigentes" },
      {
        rotulo: "Índice de recebimento",
        valor: percentual(rec.indice, 0),
        nota:
          rec.indice === null
            ? "Nenhum contrato vigente"
            : rec.creditoAplicado > 0
              ? `da carteira contratada (${reais(rec.contratado)}) já coberta, com crédito Festaê`
              : `da carteira contratada (${reais(rec.contratado)}) já recebida`,
      },
    ],
    y,
    80,
  );
  if (rec.indice !== null) {
    // Barra fina sob o índice, dentro do terceiro cartão.
    const largura = (LARGURA - 20) / 3;
    const x = MARGEM + 2 * (largura + 10) + 12;
    const barra = largura - 24;
    // Ao lado do percentual, na altura do número.
    const inicio = x + 58;
    const topo = topoRecebimentos + 37;
    doc.roundedRect(inicio, topo, barra - 58, 3, 1.5).fillColor(COR.linha).fill();
    doc.roundedRect(inicio, topo, Math.max(3, (barra - 58) * Math.min(1, rec.indice)), 3, 1.5).fillColor(COR.dourado).fill();
  }
  const notas: string[] = [];
  if (rec.recebidoSemData > 0) notas.push(`Inclui ${reais(rec.recebidoSemData)} recebidos pelo painel antigo, sem data registrada.`);
  if (rec.recebidoAlemDoContratado > 0) {
    notas.push(`${reais(rec.recebidoAlemDoContratado)} recebidos acima do valor de algum contrato não entram no índice.`);
  }
  // Crédito Festaê abate o saldo da carteira sem ser recebimento: o índice o
  // conta como coberto, o "total recebido" não.
  if (rec.creditoAplicado > 0) {
    notas.push(`${reais(rec.creditoAplicado)} da carteira estão cobertos por crédito Festaê: abatem o saldo, não são recebimento.`);
  }
  // O caixa do mês só ganha linha quando houve reembolso: é aí que ele
  // difere do que entrou, e a saída precisa aparecer com o seu valor.
  const cx = r.caixaDoMes;
  if (cx.reembolsos > 0) {
    notas.push(
      `Caixa de ${minusculo(r.mes)}: ${reais(cx.entradas)} entraram e ${reais(cx.reembolsos)} saíram em reembolsos de cancelamento (líquido ${reais(cx.liquido)}). ` +
        "Pagamentos de reservas canceladas depois continuam no caixa do dia em que entraram.",
    );
  }
  // Reembolso combinado e ainda não feito não saiu do caixa: aparece à parte,
  // para ninguém contar com um dinheiro que já tem destino.
  if (cx.reembolsosARealizar > 0) {
    notas.push(`Reembolsos a realizar: ${reais(cx.reembolsosARealizar)} já destinados a clientes e ainda não devolvidos — não saíram do caixa.`);
  }
  if (r.creditoEmAberto > 0) {
    notas.push(`Crédito Festaê em aberto das clientes: ${reais(r.creditoEmAberto)} — já entrou no caixa quando foi pago; não é receita nova.`);
  }
  // Retiradas dos sócios: saída de caixa, nunca despesa. Só aparecem quando
  // houve retirada no mês, com o movimento líquido do caixa que elas afetam.
  const ret = r.fluxoDeCaixa?.retiradas;
  if (ret && ret.total > 0) {
    const partes = [
      ret.DISTRIBUICAO_DE_LUCROS > 0 ? `distribuição de lucros ${reais(ret.DISTRIBUICAO_DE_LUCROS)}` : null,
      ret.PRO_LABORE > 0 ? `pró-labore ${reais(ret.PRO_LABORE)}` : null,
      ret.DEVOLUCAO_DE_APORTE > 0 ? `devolução de aporte ${reais(ret.DEVOLUCAO_DE_APORTE)}` : null,
    ].filter(Boolean);
    notas.push(
      `Retiradas dos sócios em ${minusculo(r.mes)}: ${reais(ret.total)} (${partes.join("; ")}) — saídas de caixa fora do Resultado Operacional. ` +
        `Movimento líquido do caixa no mês: ${reais(r.fluxoDeCaixa.movimentoLiquido)}.`,
    );
  }
  // Saldo disponível: só com saldo da conta informado. É onde a retirada
  // reduz o dinheiro disponível — o Resultado Operacional não muda.
  if (r.saldoDisponivel) {
    const sd = r.saldoDisponivel;
    notas.push(
      `Saldo disponível em ${dataCurta(sd.ate)}: ${reais(sd.saldo)} — saldo inicial de ${dataCurta(sd.referencia.dia)} ` +
        `(${reais(sd.referencia.valor)}) mais entradas e menos saídas desde então, retiradas inclusive.`,
    );
  }
  const fimDasNotas =
    notas.length > 0
      ? escrever(notas.join(" "), MARGEM, y + 8, { tamanho: 7.6, cor: COR.apagado, largura: LARGURA })
      : y;

  // ------------------------------------------------------------ acervo e carteira futura

  y = secao(
    "Investimento e compromissos",
    "Fora do resultado do mês",
    notas.length > 0 ? Math.max(y + 40, fimDasNotas + 16) : y + 26,
  );
  const metade = (LARGURA - 10) / 2;
  cartao(
    {
      rotulo: "Investimento em acervo no mês",
      valor: reais(r.acervoNoMes),
      nota: "Capital que fica no acervo. Não compõe o resultado operacional.",
      tom: "acervo",
    },
    MARGEM,
    y,
    metade,
    78,
  );

  const cf = r.carteiraFutura;
  const xf = MARGEM + metade + 10;
  doc.roundedRect(xf, y, metade, 78, 6).fillColor(COR.creme).fill();
  doc.roundedRect(xf + 0.25, y + 0.25, metade - 0.5, 77.5, 6).lineWidth(0.5).strokeColor(COR.linha).stroke();
  rotulo(`Carteira futura · próximos ${cf.dias} dias`, xf + 12, y + 12, COR.apagado, metade - 24);
  const meia = (metade - 24 - 12) / 2;
  escrever("Contratado em festas futuras", xf + 12, y + 26, { tamanho: 7.4, cor: COR.apagado, largura: meia });
  escrever(reais(cf.contratado), xf + 12, y + 37, { fonte: "negrito", tabular: true, tamanho: corpoQueCabe(reais(cf.contratado), "negrito", 14, meia), cor: COR.tinta });
  escrever("Saldo futuro a receber", xf + 12 + meia + 12, y + 26, { tamanho: 7.4, cor: COR.apagado, largura: meia });
  escrever(reais(cf.aReceber), xf + 12 + meia + 12, y + 37, { fonte: "negrito", tabular: true, tamanho: corpoQueCabe(reais(cf.aReceber), "negrito", 14, meia), cor: COR.coralEscuro });
  escrever(
    `${cf.festas} ${cf.festas === 1 ? "festa" : "festas"} contratadas. Não é faturamento realizado nem previsão de caixa.`,
    xf + 12,
    y + 78 - 21,
    { tamanho: 7.4, cor: COR.apagado, largura: metade - 24 },
  );

  // ------------------------------------------------------------ rodapé

  const rodape = A4.altura - 104;
  doc.moveTo(MARGEM, rodape).lineTo(MARGEM + LARGURA, rodape).lineWidth(0.5).strokeColor(COR.linha).stroke();
  rotulo("Nota metodológica", MARGEM, rodape + 12, COR.douradoEscuro);
  escrever(
    "Faturamento apurado por competência da data da festa: o valor total do contrato entra no mês em que a festa acontece; reservas canceladas não entram. " +
      "Recebimentos apurados pelos pagamentos efetivamente confirmados como pagos; pendentes e recusados não contam. " +
      "Investimentos em acervo não compõem o Resultado Operacional. Os números são os mesmos da Visão Geral do Financeiro para o mesmo período.",
    MARGEM,
    rodape + 24,
    { tamanho: 7.3, cor: COR.apagado, largura: LARGURA, entrelinha: 1.6 },
  );
  escrever("Festaê Gestão · documento interno, gerado sob demanda", MARGEM, A4.altura - 36, { tamanho: 6.8, cor: COR.apagado });
  escrever("Página 1 de 1", MARGEM, A4.altura - 36, { tamanho: 6.8, cor: COR.apagado, largura: LARGURA, alinhamento: "right" });

  return new Promise((resolve, reject) => {
    doc.on("end", () =>
      resolve({ pdf: Buffer.concat(partes), textos, semGlifo: [...semGlifo], paginas }),
    );
    doc.on("error", reject);
    doc.end();
  });
}

/** "Festae-Relatorio-Financeiro-2026-09.pdf" */
export function nomeDoArquivo(mes: string): string {
  return `Festae-Relatorio-Financeiro-${mes}.pdf`;
}

/** "2026-10-31" → "31/10/2026". */
function dataCurta(dia: string): string {
  const [a, m, d] = dia.split("-");
  return `${d}/${m}/${a}`;
}
