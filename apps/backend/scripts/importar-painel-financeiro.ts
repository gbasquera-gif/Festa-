/**
 * Carga do painel financeiro antigo para o Postgres.
 *
 *   pnpm --filter @festae/backend exec tsx scripts/importar-painel-financeiro.ts <backup.json>
 *   ... --aplicar            grava os gastos e a meta
 *   ... --criar-contratos    além disso, cria as reservas que ainda não existem
 *
 * Sem `--aplicar` nada é gravado: a execução só imprime o que faria. É
 * deliberado — o painel antigo não tinha histórico, então um erro de carga
 * não teria como ser desfeito por lá.
 *
 * O arquivo de backup NÃO pode ficar no repositório: ele é público e a
 * exportação tem faturamento e nome de cliente.
 *
 * Ver docs/SPRINT-0-PAINEL-FINANCEIRO.md.
 */
import { readFileSync } from "node:fs";
import { prisma } from "@festae/database";
import {
  DELIVERY_CITY,
  indicadoresDoMes,
  isDeliveryCity,
  normalizarDataDaFesta,
  type ContratoApurado,
  type NaturezaDoGasto,
} from "@festae/shared";
import { classificarGasto } from "./classificar-gasto";
import {
  conferirIntegridade,
  registrarExcecoes,
  registrarHistorico,
  type ContratoHistorico,
} from "./registrar-historico";

type VendaLegado = {
  num: string;
  data: string;
  cliente: string;
  evento?: string;
  dataEvento: string;
  cidade?: string;
  modalidade?: string;
  valor: number;
  sinal: number;
  status: string;
  obs?: string;
};

type ContaLegado = {
  desc: string;
  categoria?: string;
  tipo?: string;
  venc?: string;
  dataPgto?: string;
  valor: number;
  status?: string;
  obs?: string;
  data?: string;
};

type AporteLegado = {
  data: string;
  finalidade: string;
  valor: number;
  forma?: string;
  obs?: string;
};

const brl = (valor: number) =>
  valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Aceita ISO e DD/MM/AAAA — a exportação mistura os dois formatos. */
function data(bruta: string): Date {
  const texto = String(bruta).trim();
  const iso = texto.includes("/")
    ? texto.split("/").reverse().map((parte, i) => (i === 0 ? parte : parte.padStart(2, "0"))).join("-")
    : texto.slice(0, 10);
  return normalizarDataDaFesta(iso);
}

/** Chave estável, para a carga poder rodar duas vezes sem duplicar. */
function referencia(aba: string, quando: string, valor: number, descricao: string): string {
  const slug = descricao
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return `legado:${aba}:${data(quando).toISOString().slice(0, 10)}:${valor.toFixed(2)}:${slug}`;
}

function carregar(caminho: string) {
  const bruto = JSON.parse(readFileSync(caminho, "utf-8")) as Record<string, unknown>;
  const ler = <T,>(chave: string): T[] => {
    const valor = bruto[chave];
    if (valor === undefined) return [];
    return (typeof valor === "string" ? JSON.parse(valor) : valor) as T[];
  };
  const meta = bruto["festae:meta"];
  return {
    vendas: ler<VendaLegado>("festae:vendas"),
    contas: ler<ContaLegado>("festae:contas"),
    aportes: ler<AporteLegado>("festae:aportes"),
    meta: (typeof meta === "string" ? JSON.parse(meta) : meta) as { valor: number } | undefined,
  };
}

type GastoParaCarga = {
  referenciaExterna: string;
  descricao: string;
  natureza: NaturezaDoGasto;
  valor: number;
  pagoEm: Date | null;
  venceEm: Date | null;
  categoria: string | null;
  formaDePagamento: string | null;
  observacao: string | null;
};

function gastosDaExportacao(contas: ContaLegado[], aportes: AporteLegado[]): GastoParaCarga[] {
  const deContas = contas.map((conta) => ({
    referenciaExterna: referencia("conta", conta.dataPgto ?? conta.venc ?? conta.data ?? "", conta.valor, conta.desc),
    descricao: conta.desc,
    natureza: classificarGasto(conta.desc, conta.categoria),
    valor: conta.valor,
    // Só tem data de saída o que foi efetivamente pago. O painel antigo
    // gravava dataPgto mesmo em conta pendente, e é isso que fazia uma conta
    // não paga entrar na despesa do mês.
    pagoEm: conta.status?.toLowerCase() === "pago" && conta.dataPgto ? data(conta.dataPgto) : null,
    venceEm: conta.venc ? data(conta.venc) : null,
    categoria: conta.categoria ?? null,
    formaDePagamento: null,
    observacao: conta.obs || null,
  }));

  const deAportes = aportes.map((aporte) => ({
    referenciaExterna: referencia("aporte", aporte.data, aporte.valor, aporte.finalidade),
    descricao: aporte.finalidade,
    natureza: classificarGasto(aporte.finalidade),
    valor: aporte.valor,
    pagoEm: data(aporte.data),
    venceEm: null,
    categoria: null,
    formaDePagamento: aporte.forma ?? null,
    observacao: aporte.obs || null,
  }));

  return [...deContas, ...deAportes];
}

function normalizarNome(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Como um contrato do painel antigo fica depois de migrado. */
type Excecao = { regra: string; motivo: string; origem: "detectada" | "declarada" };

/** Exceções declaradas por quem fechou a venda, num arquivo fora do código.
 *
 * Existe para não haver exceção escrita no código para um cliente ou uma
 * cidade. O script prova o que dá para provar pelo dado; o que depende da
 * memória da negociação é declarado por uma pessoa, num arquivo revisável, e
 * fica registrado como tal. Ver apps/backend/scripts/excecoes.exemplo.json. */
type Declaracoes = Record<string, { regra: string; justificativa: string }[]>;

function carregarDeclaracoes(caminho: string | undefined): Declaracoes {
  if (!caminho) return {};
  const bruto = JSON.parse(readFileSync(caminho, "utf-8")) as Record<string, unknown>;
  const saida: Declaracoes = {};
  for (const [chave, valor] of Object.entries(bruto)) {
    if (chave.startsWith("_") || !Array.isArray(valor)) continue;
    saida[chave] = valor as { regra: string; justificativa: string }[];
  }
  return saida;
}

/**
 * As regras comerciais vigentes que este contrato histórico não cumpre.
 *
 * Só entra aqui o que o dado **prova**. Que a entrega saiu de Chapecó está na
 * exportação e é verificável; que a taxa foi cortesia não está em lugar nenhum
 * — a origem guarda um valor só por contrato, sem separar serviço de taxa.
 * Afirmar cortesia a partir disso seria inventar. O desconhecido vira
 * inconsistência declarada, não exceção.
 */
function quebrasDeRegra(venda: VendaLegado, declaracoes: Declaracoes): Excecao[] {
  const quebras: Excecao[] = [];
  const entrega = (venda.modalidade ?? "").toLowerCase().includes("entrega");
  if (entrega && !isDeliveryCity(venda.cidade)) {
    quebras.push({
      regra: "ENTREGA_FORA_DA_CIDADE_ATENDIDA",
      motivo: `entrega em ${venda.cidade?.trim()}, e a regra atende só ${DELIVERY_CITY}`,
      origem: "detectada",
    });
  }
  for (const declarada of declaracoes[venda.num.trim()] ?? []) {
    quebras.push({ regra: declarada.regra, motivo: declarada.justificativa, origem: "declarada" });
  }
  return quebras;
}

/** Os recebimentos de um contrato, e o que a origem prova sobre cada um.
 *
 * O campo `sinal` prova sinal. O status "Pago" prova que o resto entrou, mas
 * não em que papel — daí INDETERMINADO. Não há terceiro caminho: inventar
 * composição foi vetado, e com razão. */
function recebimentosDaVenda(venda: VendaLegado) {
  const recebimentos: { valor: number; tipo: "DEPOSIT" | "BALANCE" | "INDETERMINADO" }[] = [];
  if (venda.sinal > 0) recebimentos.push({ valor: venda.sinal, tipo: "DEPOSIT" });
  if (venda.status.trim().toLowerCase() === "pago") {
    const resto = Number((venda.valor - venda.sinal).toFixed(2));
    if (resto > 0) recebimentos.push({ valor: resto, tipo: "INDETERMINADO" });
  }
  return recebimentos;
}

function recebidoDaVenda(venda: VendaLegado): number {
  return Number(recebimentosDaVenda(venda).reduce((s, r) => s + r.valor, 0).toFixed(2));
}

const TIPOS_DE_EVENTO: Record<string, ContratoHistorico["tipoDeEvento"]> = {
  aniversario: "ANIVERSARIO",
  batizado: "BATIZADO",
  "cha revelacao": "CHA_REVELACAO",
  "cha de bebe": "CHA_DE_BEBE",
};

function tipoDeEvento(venda: VendaLegado): ContratoHistorico["tipoDeEvento"] {
  const chave = semAcento(venda.evento ?? "").trim();
  return TIPOS_DE_EVENTO[chave] ?? "OUTRO";
}

function semAcento(texto: string): string {
  return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function paraHistorico(venda: VendaLegado, excecoes: Excecao[]): ContratoHistorico {
  const modalidade = semAcento(venda.modalidade ?? "");
  return {
    referenciaExterna: `legado:contrato:${venda.num.trim()}`,
    cliente: venda.cliente.trim(),
    fechadoEm: data(venda.data),
    festaEm: data(venda.dataEvento),
    cidade: (venda.cidade ?? "").trim() || DELIVERY_CITY,
    tipoDeEvento: tipoDeEvento(venda),
    entrega: modalidade.includes("entrega"),
    montagem: modalidade.includes("montagem"),
    valor: venda.valor,
    recebimentos: recebimentosDaVenda(venda),
    observacao: venda.obs || undefined,
    excecoes: excecoes.map((e) => ({
      regra: e.regra,
      justificativa: e.motivo,
      origemDaInformacao: e.origem,
    })),
  };
}

type Situacao = "ausente" | "corresponde" | "conflito-cancelada";

type Representacao = {
  venda: VendaLegado;
  situacao: Situacao;
  reservaId?: string;
  statusDaReserva?: string;
  /** Divergência financeira entre o Admin e o painel histórico. */
  referenciaExternaDaReserva?: string | null;
  divergencias: string[];
  duplicidadeParcial: string[];
  excecoes: Excecao[];
  recebido: number;
  saldo: number;
};

async function conciliar(vendas: VendaLegado[], declaracoes: Declaracoes): Promise<Representacao[]> {
  const reservas = await prisma.reservation.findMany({
    select: {
      id: true,
      status: true,
      eventDate: true,
      referenciaExterna: true,
      order: {
        select: {
          total: true,
          payments: { where: { status: "PAID" }, select: { amount: true } },
          event: { select: { user: { select: { name: true } } } },
        },
      },
    },
  });

  return vendas.map((venda) => {
    const dia = data(venda.dataEvento).toISOString().slice(0, 10);
    const alvo = normalizarNome(venda.cliente);
    const referencia = `legado:contrato:${venda.num.trim()}`;
    const recebido = recebidoDaVenda(venda);

    const bateNome = (r: (typeof reservas)[number]) => {
      const nome = normalizarNome(r.order.event.user.name ?? "");
      return nome === alvo || nome.includes(alvo) || alvo.includes(nome);
    };

    // Mesma cliente + mesma data = mesmo negócio. Pagamento diferente é
    // divergência financeira, não outra festa — foi a regra que você fixou.
    const correspondente =
      reservas.find((r) => r.referenciaExterna === referencia) ??
      reservas.find((r) => r.eventDate.toISOString().slice(0, 10) === dia && bateNome(r));

    const duplicidadeParcial = reservas
      .filter((r) => r.id !== correspondente?.id)
      .filter((r) => {
        const criterios = [
          bateNome(r),
          r.eventDate.toISOString().slice(0, 10) === dia,
          Math.abs(Number(r.order.total) - venda.valor) < 0.01,
        ];
        return criterios.filter(Boolean).length >= 2;
      })
      .map(
        (r) =>
          `${r.order.event.user.name} · ${r.eventDate.toISOString().slice(0, 10)} · ${brl(Number(r.order.total))} · ${r.status}`,
      );

    const divergencias: string[] = [];
    let situacao: Situacao = "ausente";
    if (correspondente) {
      const cancelada = ["CANCELLED", "REJECTED"].includes(correspondente.status);
      situacao = cancelada ? "conflito-cancelada" : "corresponde";
      const totalAdmin = Number(correspondente.order.total);
      const recebidoAdmin = correspondente.order.payments.reduce((s, p) => s + Number(p.amount), 0);
      if (Math.abs(totalAdmin - venda.valor) >= 0.01)
        divergencias.push(`contratado: Admin ${brl(totalAdmin)} × painel ${brl(venda.valor)}`);
      if (Math.abs(recebidoAdmin - recebido) >= 0.01)
        divergencias.push(`recebido: Admin ${brl(recebidoAdmin)} × painel ${brl(recebido)}`);
    }

    return {
      venda,
      situacao,
      reservaId: correspondente?.id,
      statusDaReserva: correspondente?.status,
      referenciaExternaDaReserva: correspondente?.referenciaExterna,
      divergencias,
      duplicidadeParcial,
      excecoes: quebrasDeRegra(venda, declaracoes),
      recebido,
      saldo: Number(Math.max(0, venda.valor - recebido).toFixed(2)),
    };
  });
}

/** O lucro pelo método do painel antigo. Só para a comparação — não é
 *  indicador, e não deve virar um. */
function lucroDoPainelAntigo(vendas: VendaLegado[], contas: ContaLegado[], mes: string) {
  const mesDe = (d: string) => data(d).toISOString().slice(0, 7);
  const doMes = vendas.filter((v) => mesDe(v.data) === mes);
  const faturamento = doMes.reduce((s, v) => s + v.valor, 0);
  const despesa = contas
    .filter((c) => mesDe(c.dataPgto ?? c.venc ?? c.data ?? "") === mes)
    .reduce((s, c) => s + c.valor, 0);
  return { faturamento, contratos: doMes.length, despesa, lucro: Number((faturamento - despesa).toFixed(2)) };
}

function contratosApurados(vendas: VendaLegado[]): ContratoApurado[] {
  return vendas.map((venda) => ({
    fechadoEm: data(venda.data),
    festaEm: data(venda.dataEvento),
    valor: venda.valor,
    recebimentos: recebimentosDaVenda(venda).map((r) => ({ valor: r.valor, recebidoEm: null })),
  }));
}

async function main() {
  const [caminho, ...flags] = process.argv.slice(2);
  if (!caminho) {
    console.error("Diga o caminho do backup exportado do painel antigo.");
    process.exit(1);
  }
  const aplicar = flags.includes("--aplicar");
  const indiceExcecoes = flags.indexOf("--excecoes");
  const declaracoes = carregarDeclaracoes(indiceExcecoes >= 0 ? flags[indiceExcecoes + 1] : undefined);

  const { vendas, contas, aportes, meta } = carregar(caminho);
  const gastos = gastosDaExportacao(contas, aportes);
  const conciliacao = await conciliar(vendas, declaracoes);
  const linha = (t: string) => console.log(`\n${"=".repeat(76)}\n${t}\n${"=".repeat(76)}`);

  console.log(aplicar ? "MODO: GRAVANDO\n" : "MODO: SIMULAÇÃO — nada será gravado\n");
  console.log(`banco: ${(process.env.DATABASE_URL ?? "").replace(/\/\/[^@]*@/, "//***@")}`);

  const contratado = vendas.reduce((s, v) => s + v.valor, 0);
  const recebido = conciliacao.reduce((s, r) => s + r.recebido, 0);
  const saldo = Number((contratado - recebido).toFixed(2));

  linha("1/2. CORRESPONDÊNCIA COM O BANCO OPERACIONAL");
  console.log("  Apurado contra o banco do topo. Se ele não for o de produção, esta seção");
  console.log("  e as duas seguintes não respondem nada sobre produção.\n");
  for (const r of conciliacao) {
    const rotulo =
      r.situacao === "corresponde"
        ? `JÁ EXISTE  ${r.statusDaReserva}`
        : r.situacao === "conflito-cancelada"
          ? `CONFLITO: reserva ${r.statusDaReserva}`
          : "ausente";
    console.log(`  ${r.venda.num.padEnd(9)} ${r.venda.cliente.trim().slice(0, 28).padEnd(28)} ${rotulo}`);
  }
  const ausentes = conciliacao.filter((r) => r.situacao === "ausente");
  const existentes = conciliacao.filter((r) => r.situacao === "corresponde");
  const conflitos = conciliacao.filter((r) => r.situacao === "conflito-cancelada");
  console.log(`\n  já existem: ${existentes.length} | ausentes: ${ausentes.length} | conflitos: ${conflitos.length}`);

  linha("3. DUPLICIDADES PARCIAIS");
  const comDuplicidade = conciliacao.filter((r) => r.duplicidadeParcial.length > 0);
  if (comDuplicidade.length === 0) console.log("  nenhuma.");
  for (const r of comDuplicidade) {
    console.log(`  ${r.venda.num} (${r.venda.cliente.trim()}) parece com:`);
    for (const c of r.duplicidadeParcial) console.log(`      ${c}`);
  }

  linha("4. RESERVAS CANCELADAS CONFLITANTES");
  if (conflitos.length === 0) console.log("  nenhuma.");
  for (const r of conflitos) {
    console.log(`  ${r.venda.num}: existe reserva ${r.statusDaReserva} para a mesma cliente e data.`);
    console.log("     A carga NÃO cria outra festa. Decisão manual: reativar ou registrar à parte.");
  }

  linha("5. DIVERGÊNCIAS FINANCEIRAS (Admin × painel histórico)");
  const comDivergencia = conciliacao.filter((r) => r.divergencias.length > 0);
  if (comDivergencia.length === 0) console.log("  nenhuma.");
  for (const r of comDivergencia) {
    console.log(`  ${r.venda.num} (${r.venda.cliente.trim()}):`);
    for (const d of r.divergencias) console.log(`      ${d}`);
  }
  if (comDivergencia.length > 0) {
    console.log("\n  A carga não reescreve pagamento de reserva existente. Fica para saneamento");
    console.log("  manual, e os totais de controle abaixo vão acusar a diferença.");
  }

  linha("6. O QUE A CARGA VAI CRIAR E ALTERAR");
  console.log("  CRIA (só para contratos ausentes):");
  if (ausentes.length === 0) console.log("      nada.");
  for (const r of ausentes) {
    const h = paraHistorico(r.venda, r.excecoes);
    console.log(
      `      ${r.venda.num}  cliente, evento, pedido, reserva` +
        `${h.recebimentos.length > 0 ? ` e ${h.recebimentos.length} pagamento(s)` : ""}` +
        `${h.excecoes.length > 0 ? ` e ${h.excecoes.length} exceção(ões)` : ""}`,
    );
  }
  console.log("\n  ACRESCENTA a reserva existente (aditivo, não altera o que já está lá):");
  const acrescentos = existentes.filter((r) => r.excecoes.length > 0);
  if (acrescentos.length === 0) console.log("      nada.");
  for (const r of acrescentos) console.log(`      ${r.venda.num}  ${r.excecoes.length} exceção(ões) comercial(is)`);
  console.log("\n  NUNCA altera: valor, pagamento, data ou status de reserva já existente.");
  console.log(`\n  GASTOS: ${gastos.length} lançamentos. META: ${meta ? brl(meta.valor) : "—"}`);

  linha("7. PAGAMENTOS HISTÓRICOS E SUAS CLASSIFICAÇÕES");
  for (const r of conciliacao) {
    const recs = recebimentosDaVenda(r.venda);
    if (recs.length === 0) {
      console.log(`  ${r.venda.num.padEnd(9)} sem recebimento`);
      continue;
    }
    for (const rec of recs) {
      const prova = rec.tipo === "DEPOSIT" ? "campo sinal da origem" : 'só a palavra "Pago" no status';
      console.log(`  ${r.venda.num.padEnd(9)} ${brl(rec.valor).padStart(11)}  ${rec.tipo.padEnd(14)} paidAt=null  (prova: ${prova})`);
    }
  }
  console.log(`\n  Nenhuma data inventada. Os ${brl(recebido)} contam como recebido e abatem o saldo,`);
  console.log("  mas ficam fora do caixa de qualquer mês até alguém saber quando entraram.");

  linha("8. EXCEÇÕES COMERCIAIS");
  const comExcecao = conciliacao.filter((r) => r.excecoes.length > 0);
  if (comExcecao.length === 0) console.log("  nenhuma.");
  for (const r of comExcecao) {
    console.log(`  ${r.venda.num}:`);
    for (const e of r.excecoes) {
      console.log(`      [${e.origem}] ${e.regra}`);
      console.log(`                 ${e.motivo}`);
    }
  }
  console.log("\n  A regra comercial geral não muda. Vendas novas continuam sujeitas a ela.");

  linha("9. INCONSISTÊNCIAS PARA SANEAMENTO MANUAL");
  const problemas: string[] = [];
  for (const r of conciliacao) {
    const h = paraHistorico(r.venda, r.excecoes);
    for (const p of conferirIntegridade(h)) problemas.push(`${r.venda.num}: ${p} (BLOQUEIA a carga)`);
    if (r.venda.status.trim().toLowerCase() === "pago" && r.venda.sinal === 0)
      problemas.push(`${r.venda.num}: quitado só pelo status, sem composição — gravado como INDETERMINADO`);
    if (!r.venda.evento?.trim()) problemas.push(`${r.venda.num}: sem tipo de evento — entra como OUTRO`);
  }
  if (recebido > 0) problemas.push(`${brl(recebido)} sem data de recebimento — fora do caixa mensal até saneamento`);
  problemas.push("nenhum contrato separa serviço de taxa de entrega — taxas gravadas como R$ 0,00");
  for (const p of problemas) console.log(`  · ${p}`);

  linha("10. COMPARAÇÃO FINANCEIRA ANTES E DEPOIS");
  const meses = [
    ...new Set(vendas.flatMap((v) => [data(v.data).toISOString().slice(0, 7), data(v.dataEvento).toISOString().slice(0, 7)])),
  ].sort();
  const apurados = contratosApurados(vendas);
  for (const mes of meses) {
    const antes = lucroDoPainelAntigo(vendas, contas, mes);
    const depois = indicadoresDoMes(apurados, gastos, mes);
    console.log(`\n  ${mes}${"".padEnd(20)}${"painel antigo".padStart(14)}${"sistema novo".padStart(16)}`);
    console.log(`    ${"faturamento".padEnd(22)}${brl(antes.faturamento).padStart(14)}${brl(depois.competencia.receita).padStart(16)}`);
    console.log(`    ${"despesa".padEnd(22)}${brl(antes.despesa).padStart(14)}${brl(depois.competencia.despesa).padStart(16)}`);
    console.log(`    ${"resultado".padEnd(22)}${brl(antes.lucro).padStart(14)}${brl(depois.competencia.resultado).padStart(16)}`);
    console.log(`    ${"caixa do mês".padEnd(22)}${"—".padStart(14)}${brl(depois.caixa.resultado).padStart(16)}`);
  }
  const acervo = gastos.filter((g) => g.natureza === "ACERVO").reduce((s, g) => s + g.valor, 0);
  console.log(`\n  ACUMULADO${"".padEnd(15)}${"painel antigo".padStart(14)}${"sistema novo".padStart(16)}`);
  console.log(`    ${"capital investido".padEnd(22)}${brl(gastos.reduce((s, g) => s + g.valor, 0)).padStart(14)}${brl(acervo).padStart(16)}`);

  linha("TOTAIS DE CONTROLE");
  const ALVOS = { contratado: 2500, recebido: 941, saldo: 1559 };
  const conferir = (rotulo: string, apurado: number, alvo: number) => {
    const ok = Math.abs(apurado - alvo) < 0.01;
    console.log(`  ${ok ? "OK     " : "FALHOU "} ${rotulo.padEnd(22)} ${brl(apurado).padStart(13)}  alvo ${brl(alvo)}`);
    return ok;
  };
  const fecham =
    [
      conferir("faturamento contratado", contratado, ALVOS.contratado),
      conferir("recebido histórico", recebido, ALVOS.recebido),
      conferir("saldo a receber", saldo, ALVOS.saldo),
    ].every(Boolean) && comDivergencia.length === 0;
  if (!fecham) {
    console.log("\n  Algum controle não fechou, ou há divergência financeira com o Admin.");
    console.log("  Investigar antes de concluir a carga.");
  }

  if (!aplicar) {
    console.log("\n\nNada foi gravado. Rode com --aplicar para executar.");
    return;
  }

  linha("EXECUTANDO");
  let criadas = 0;
  let jaMigradas = 0;
  let preservadas = 0;
  for (const r of conciliacao) {
    if (r.situacao !== "ausente") {
      // Distingue o que esta carga já trouxe do que a operação cadastrou por
      // conta própria: numa segunda execução as duas coisas "já existem", mas
      // só uma delas é responsabilidade da migração.
      const daMigracao = r.referenciaExternaDaReserva === `legado:contrato:${r.venda.num.trim()}`;
      if (daMigracao) jaMigradas += 1;
      else preservadas += 1;
      const n =
        r.reservaId && r.excecoes.length > 0
          ? await registrarExcecoes(
              r.reservaId,
              r.excecoes.map((e) => ({ regra: e.regra, justificativa: e.motivo, origemDaInformacao: e.origem })),
            )
          : 0;
      const origem = daMigracao ? "já migrada por esta carga" : "reserva da operação, preservada";
      console.log(`  ${r.venda.num}: ${origem}${n > 0 ? `, ${n} exceção(ões) conferidas` : ""}.`);
      continue;
    }
    const resultado = await registrarHistorico(paraHistorico(r.venda, r.excecoes));
    if (resultado.criada) criadas += 1;
    else jaMigradas += 1;
    console.log(`  ${r.venda.num}: ${resultado.criada ? "CRIADA" : "já existia"} (${resultado.reservaId})`);
  }
  console.log(
    `\n  criados agora: ${criadas} | já migrados antes: ${jaMigradas} | reservas da operação preservadas: ${preservadas}`,
  );

  const jaGravados = await prisma.gasto.findMany({
    where: { referenciaExterna: { in: gastos.map((g) => g.referenciaExterna) } },
    select: { referenciaExterna: true },
  });
  const conhecidos = new Set(jaGravados.map((g) => g.referenciaExterna));
  let inseridos = 0;
  for (const gasto of gastos.filter((g) => !conhecidos.has(g.referenciaExterna))) {
    await prisma.gasto.create({ data: gasto });
    inseridos += 1;
  }
  console.log(`  gastos inseridos: ${inseridos} | já estavam: ${conhecidos.size}`);

  if (meta) {
    const agora = new Date();
    const competencia = `${agora.getUTCFullYear()}-${String(agora.getUTCMonth() + 1).padStart(2, "0")}`;
    await prisma.metaMensal.upsert({
      where: { competencia },
      create: { competencia, lucroAlvo: meta.valor },
      update: { lucroAlvo: meta.valor },
    });
    console.log(`  meta de ${competencia}: ${brl(meta.valor)}`);
  }
}

main()
  .catch((erro) => {
    console.error(erro);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
