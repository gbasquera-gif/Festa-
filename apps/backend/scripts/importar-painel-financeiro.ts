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
type Representacao = {
  venda: VendaLegado;
  jaExiste: boolean;
  reservaId?: string;
  duplicidadeProvavel: string[];
  quebrasDeRegra: Excecao[];
  recebido: number;
  saldo: number;
};

/** O valor efetivamente recebido de um contrato do painel antigo.
 *
 * Não é o campo `sinal`: um contrato quitado ficava com status "Pago" e sinal
 * zerado. Somar só o campo cobraria de novo de quem já pagou. */
function recebidoDaVenda(venda: VendaLegado): number {
  return venda.status.trim().toLowerCase() === "pago" ? venda.valor : venda.sinal;
}

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

async function conciliar(vendas: VendaLegado[], declaracoes: Declaracoes): Promise<Representacao[]> {
  const reservas = await prisma.reservation.findMany({
    where: { status: { notIn: ["CANCELLED", "REJECTED"] } },
    select: {
      id: true,
      eventDate: true,
      order: {
        select: { total: true, event: { select: { user: { select: { name: true } } } } },
      },
    },
  });

  return vendas.map((venda) => {
    const dia = data(venda.dataEvento).toISOString().slice(0, 10);
    const alvo = normalizarNome(venda.cliente);

    const mesmoNomeEData = reservas.find((r) => {
      const nome = normalizarNome(r.order.event.user.name ?? "");
      return (
        r.eventDate.toISOString().slice(0, 10) === dia &&
        (nome === alvo || nome.includes(alvo) || alvo.includes(nome))
      );
    });

    // Duplicidade provável: bate em dois dos três (nome, data, valor) mas não
    // nos três. É onde mora o registro digitado duas vezes com um dedo trocado.
    const duplicidadeProvavel = reservas
      .filter((r) => r.id !== mesmoNomeEData?.id)
      .filter((r) => {
        const nome = normalizarNome(r.order.event.user.name ?? "");
        const bateNome = nome === alvo || nome.includes(alvo) || alvo.includes(nome);
        const bateData = r.eventDate.toISOString().slice(0, 10) === dia;
        const bateValor = Math.abs(Number(r.order.total) - venda.valor) < 0.01;
        return [bateNome, bateData, bateValor].filter(Boolean).length >= 2;
      })
      .map((r) => `${r.order.event.user.name} · ${r.eventDate.toISOString().slice(0, 10)} · ${brl(Number(r.order.total))}`);

    const recebido = recebidoDaVenda(venda);
    return {
      venda,
      jaExiste: mesmoNomeEData !== undefined,
      reservaId: mesmoNomeEData?.id,
      duplicidadeProvavel,
      quebrasDeRegra: quebrasDeRegra(venda, declaracoes),
      recebido,
      saldo: Math.max(0, Number((venda.valor - recebido).toFixed(2))),
    };
  });
}

/** O lucro pelo método do painel antigo: faturamento por data do contrato,
 *  despesa lendo só a aba Contas. Existe para a comparação do item 9 — não
 *  deve ser usado como indicador. */
function lucroDoPainelAntigo(vendas: VendaLegado[], contas: ContaLegado[], mes: string) {
  const mesDe = (d: string) => data(d).toISOString().slice(0, 7);
  const doMes = vendas.filter((v) => mesDe(v.data) === mes);
  const faturamento = doMes.reduce((s, v) => s + v.valor, 0);
  const despesa = contas
    .filter((c) => mesDe(c.dataPgto ?? c.venc ?? c.data ?? "") === mes)
    .reduce((s, c) => s + c.valor, 0);
  return {
    faturamento,
    contratos: doMes.length,
    despesa,
    lucro: Number((faturamento - despesa).toFixed(2)),
    ticket: doMes.length > 0 ? Number((faturamento / doMes.length).toFixed(2)) : null,
  };
}

/** Os contratos do painel antigo como o sistema novo os apuraria. */
function contratosApurados(vendas: VendaLegado[]): ContratoApurado[] {
  return vendas.map((venda) => ({
    fechadoEm: data(venda.data),
    festaEm: data(venda.dataEvento),
    valor: venda.valor,
    // Pagamento sem data: a origem guardava quanto, nunca quando.
    recebimentos: recebidoDaVenda(venda) > 0 ? [{ valor: recebidoDaVenda(venda), recebidoEm: null }] : [],
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
  const declaracoes = carregarDeclaracoes(
    indiceExcecoes >= 0 ? flags[indiceExcecoes + 1] : undefined,
  );

  const { vendas, contas, aportes, meta } = carregar(caminho);
  const gastos = gastosDaExportacao(contas, aportes);
  const conciliacao = await conciliar(vendas, declaracoes);
  const linha = (t: string) => console.log(`\n${"=".repeat(74)}\n${t}\n${"=".repeat(74)}`);

  console.log(aplicar ? "MODO: GRAVANDO\n" : "MODO: SIMULAÇÃO — nada será gravado\n");
  console.log(`banco: ${(process.env.DATABASE_URL ?? "").replace(/\/\/[^@]*@/, "//***@")}`);

  // ---- 1, 5, 6, 8 ----
  linha("1. OS CONTRATOS DA EXPORTAÇÃO");
  for (const r of conciliacao) {
    const excecao = r.quebrasDeRegra.length > 0;
    console.log(
      `  ${r.venda.num.padEnd(9)} ${r.venda.cliente.trim().slice(0, 30).padEnd(30)} ` +
        `festa ${r.venda.dataEvento}  ${brl(r.venda.valor).padStart(11)}  ` +
        `recebido ${brl(r.recebido).padStart(11)}  saldo ${brl(r.saldo).padStart(11)}` +
        (excecao ? "  << exceção histórica" : ""),
    );
  }
  const contratado = vendas.reduce((s, v) => s + v.valor, 0);
  const recebido = conciliacao.reduce((s, r) => s + r.recebido, 0);
  console.log(`\n  ${"TOTAL".padEnd(40)} ${brl(contratado).padStart(11)}  ${brl(recebido).padStart(20)}  ${brl(contratado - recebido).padStart(17)}`);

  // ---- 2, 3, 4 ----
  linha("2/3. O QUE JÁ EXISTE NO BANCO OPERACIONAL");
  console.log("  Apurado contra o banco indicado no topo deste relatório. Se ele não for o");
  console.log("  de produção, esta seção e a seguinte não respondem nada sobre produção.\n");
  for (const r of conciliacao) {
    console.log(`  ${r.venda.num.padEnd(9)} ${r.jaExiste ? `JÁ EXISTE (${r.reservaId})` : "ausente"}`);
  }
  const ausentes = conciliacao.filter((r) => !r.jaExiste);
  console.log(`\n  já no banco: ${conciliacao.length - ausentes.length} | ausentes: ${ausentes.length}`);

  linha("4. DUPLICIDADES PROVÁVEIS");
  const comDuplicidade = conciliacao.filter((r) => r.duplicidadeProvavel.length > 0);
  if (comDuplicidade.length === 0) {
    console.log("  nenhuma reserva do banco bate parcialmente com os contratos da exportação.");
  }
  for (const r of comDuplicidade) {
    console.log(`  ${r.venda.num} (${r.venda.cliente.trim()}) parece com:`);
    for (const c of r.duplicidadeProvavel) console.log(`      ${c}`);
  }

  // ---- 5, 6 ----
  linha("5/6. REGRAS COMERCIAIS VIGENTES");
  for (const r of conciliacao) {
    if (r.quebrasDeRegra.length === 0) {
      console.log(`  ${r.venda.num.padEnd(9)} passa nas regras atuais`);
      continue;
    }
    console.log(`  ${r.venda.num.padEnd(9)} EXCEÇÃO HISTÓRICA:`);
    for (const q of r.quebrasDeRegra) {
      console.log(`      [${q.origem}] ${q.regra}`);
      console.log(`                 ${q.motivo}`);
    }
  }
  const semDeclaracao = Object.keys(declaracoes).length === 0;
  if (semDeclaracao) {
    console.log("\n  Nenhum arquivo de exceções declaradas foi passado (--excecoes).");
    console.log("  Só aparece acima o que o dado prova sozinho.");
  }

  // ---- 7 ----
  linha("7. COMO CADA CONTRATO FICA DEPOIS DA MIGRAÇÃO");
  console.log("  Todos com origemDoRegistro = MIGRACAO, cidade, modalidade e valor inalterados.");
  console.log("  Taxa de entrega e montagem gravadas como R$ 0,00: a origem não decompõe o");
  console.log("  valor, e inventar a taxa da tabela faria o total discordar do contrato.\n");
  for (const r of conciliacao) {
    console.log(
      `  ${r.venda.num.padEnd(9)} ${(r.venda.cidade ?? "").trim().padEnd(10)} ${(r.venda.modalidade ?? "").padEnd(22)} ` +
        `total ${brl(r.venda.valor).padStart(11)}  ${r.recebido > 0 ? "1 pagamento sem data" : "sem pagamento"}` +
        (r.quebrasDeRegra.length > 0 ? `  + ${r.quebrasDeRegra.length} exceção(ões)` : ""),
    );
  }

  // ---- 9 ----
  linha("9. INDICADORES ANTES E DEPOIS");
  // Os meses de contrato E os meses de festa: sob competência a festa de
  // outubro tem receita mesmo sem nenhum contrato assinado em outubro, e é
  // justamente essa diferença que a comparação existe para mostrar.
  const mesesComContrato = [
    ...new Set(
      vendas.flatMap((v) => [
        data(v.data).toISOString().slice(0, 7),
        data(v.dataEvento).toISOString().slice(0, 7),
      ]),
    ),
  ].sort();
  const apurados = contratosApurados(vendas);
  for (const mes of mesesComContrato) {
    const antes = lucroDoPainelAntigo(vendas, contas, mes);
    const depois = indicadoresDoMes(apurados, gastos, mes);
    console.log(`\n  ${mes}`);
    console.log(`    ${"".padEnd(26)} ${"painel antigo".padStart(14)}  ${"sistema novo".padStart(14)}`);
    console.log(`    ${"faturamento".padEnd(26)} ${brl(antes.faturamento).padStart(14)}  ${brl(depois.competencia.receita).padStart(14)}  (antes: data do contrato; agora: data da festa)`);
    console.log(`    ${"despesa".padEnd(26)} ${brl(antes.despesa).padStart(14)}  ${brl(depois.competencia.despesa).padStart(14)}  (agora inclui consumo e custeio)`);
    console.log(`    ${"resultado".padEnd(26)} ${brl(antes.lucro).padStart(14)}  ${brl(depois.competencia.resultado).padStart(14)}`);
    console.log(`    ${"contratos fechados".padEnd(26)} ${String(antes.contratos).padStart(14)}  ${String(depois.contratosFechados).padStart(14)}  (não muda: é a prova da carga)`);
  }
  const totalGasto = gastos.reduce((s, g) => s + g.valor, 0);
  const acervo = gastos.filter((g) => g.natureza === "ACERVO").reduce((s, g) => s + g.valor, 0);
  console.log(`\n  ACUMULADO`);
  console.log(`    ${"capital investido".padEnd(26)} ${brl(totalGasto).padStart(14)}  ${brl(acervo).padStart(14)}  (consumo e custeio saem do acervo)`);
  console.log(`    ${"faturamento acumulado".padEnd(26)} ${brl(contratado).padStart(14)}  ${brl(contratado).padStart(14)}  (não muda)`);
  console.log(`    ${"recebido".padEnd(26)} ${brl(recebido).padStart(14)}  ${brl(recebido).padStart(14)}  (não muda)`);
  console.log(`    ${"saldo a receber".padEnd(26)} ${brl(contratado - recebido).padStart(14)}  ${brl(contratado - recebido).padStart(14)}  (não muda)`);

  // ---- 10 ----
  linha("10. INCONSISTÊNCIAS ENCONTRADAS");
  const problemas: string[] = [];
  for (const r of conciliacao) {
    if (r.recebido > r.venda.valor) problemas.push(`${r.venda.num}: recebido maior que o contrato`);
    if (r.venda.status.trim().toLowerCase() === "pago" && r.venda.sinal === 0)
      problemas.push(`${r.venda.num}: marcado "Pago" com o campo sinal zerado — o recebido só existe no status`);
    if (data(r.venda.dataEvento) < data(r.venda.data))
      problemas.push(`${r.venda.num}: festa antes do contrato`);
    if (!r.venda.evento?.trim()) problemas.push(`${r.venda.num}: sem tipo de evento`);
  }
  const semData = gastos.filter((g) => g.pagoEm === null);
  if (semData.length > 0)
    problemas.push(`${semData.length} gasto(s) sem data de pagamento — ficam fora da despesa de qualquer mês`);
  if (recebido > 0)
    problemas.push(`${brl(recebido)} recebidos sem data de recebimento — a origem nunca guardou quando`);
  problemas.push("nenhum contrato decompõe valor de serviço e taxa de entrega — a decomposição é desconhecida");
  for (const p of problemas) console.log(`  · ${p}`);

  // ---- Gastos ----
  linha("GASTOS A CARREGAR");
  const porNatureza = new Map<NaturezaDoGasto, { n: number; total: number }>();
  for (const g of gastos) {
    const atual = porNatureza.get(g.natureza) ?? { n: 0, total: 0 };
    porNatureza.set(g.natureza, { n: atual.n + 1, total: atual.total + g.valor });
  }
  for (const [nat, { n, total }] of [...porNatureza].sort()) {
    console.log(`  ${nat.padEnd(10)} ${String(n).padStart(3)}  ${brl(total).padStart(14)}`);
  }
  const jaGravados = await prisma.gasto.findMany({
    where: { referenciaExterna: { in: gastos.map((g) => g.referenciaExterna) } },
    select: { referenciaExterna: true },
  });
  console.log(`  já no banco: ${jaGravados.length} | a inserir: ${gastos.length - jaGravados.length}`);
  if (meta) console.log(`\n  meta mensal na origem: ${brl(meta.valor)}`);

  if (!aplicar) {
    console.log("\n\nNada foi gravado. A carga de contratos exige a modelagem de");
    console.log("docs/MIGRACAO-DE-HISTORICO.md, que ainda não foi implementada.");
    return;
  }

  const conhecidos = new Set(jaGravados.map((g) => g.referenciaExterna));
  let inseridos = 0;
  for (const gasto of gastos.filter((g) => !conhecidos.has(g.referenciaExterna))) {
    await prisma.gasto.create({ data: gasto });
    inseridos += 1;
  }
  console.log(`\ngravados ${inseridos} gastos novos.`);
  if (meta) {
    const agora = new Date();
    const competencia = `${agora.getUTCFullYear()}-${String(agora.getUTCMonth() + 1).padStart(2, "0")}`;
    await prisma.metaMensal.upsert({
      where: { competencia },
      create: { competencia, lucroAlvo: meta.valor },
      update: { lucroAlvo: meta.valor },
    });
    console.log(`meta de ${competencia} definida em ${brl(meta.valor)}.`);
  }
}

main()
  .catch((erro) => {
    console.error(erro);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
