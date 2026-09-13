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
import { normalizarDataDaFesta, type NaturezaDoGasto } from "@festae/shared";
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

async function conciliarContratos(vendas: VendaLegado[]) {
  const reservas = await prisma.reservation.findMany({
    where: { status: { notIn: ["CANCELLED", "REJECTED"] } },
    select: {
      id: true,
      eventDate: true,
      order: {
        select: {
          total: true,
          event: { select: { user: { select: { name: true } } } },
        },
      },
    },
  });

  return vendas.map((venda) => {
    const dia = data(venda.dataEvento).toISOString().slice(0, 10);
    const alvo = normalizarNome(venda.cliente);
    const encontrada = reservas.find((reserva) => {
      const mesmoDia = reserva.eventDate.toISOString().slice(0, 10) === dia;
      const nome = normalizarNome(reserva.order.event.user.name ?? "");
      return mesmoDia && (nome === alvo || nome.includes(alvo) || alvo.includes(nome));
    });
    const entregaForaDeChapeco =
      (venda.modalidade ?? "").toLowerCase().includes("entrega") &&
      normalizarNome(venda.cidade ?? "") !== "chapeco";
    return { venda, jaExiste: encontrada !== undefined, reservaId: encontrada?.id, entregaForaDeChapeco };
  });
}

async function main() {
  const [caminho, ...flags] = process.argv.slice(2);
  if (!caminho) {
    console.error("Diga o caminho do backup exportado do painel antigo.");
    process.exit(1);
  }
  const aplicar = flags.includes("--aplicar");
  const criarContratos = flags.includes("--criar-contratos");

  const { vendas, contas, aportes, meta } = carregar(caminho);
  const gastos = gastosDaExportacao(contas, aportes);

  console.log(aplicar ? "MODO: gravando\n" : "MODO: simulação, nada será gravado\n");

  // ---- Gastos ----
  const porNatureza = new Map<NaturezaDoGasto, { n: number; total: number }>();
  for (const gasto of gastos) {
    const atual = porNatureza.get(gasto.natureza) ?? { n: 0, total: 0 };
    porNatureza.set(gasto.natureza, { n: atual.n + 1, total: atual.total + gasto.valor });
  }
  console.log(`GASTOS: ${gastos.length} lançamentos (${contas.length} contas + ${aportes.length} aportes)`);
  for (const [natureza, { n, total }] of [...porNatureza].sort()) {
    console.log(`  ${natureza.padEnd(10)} ${String(n).padStart(3)} lançamentos  ${brl(total).padStart(14)}`);
  }
  console.log(`  ${"TOTAL".padEnd(10)} ${String(gastos.length).padStart(3)} lançamentos  ${brl(gastos.reduce((s, g) => s + g.valor, 0)).padStart(14)}`);

  console.log("\n  Reclassificados para fora do capital (confira um a um):");
  for (const gasto of gastos.filter((g) => g.natureza !== "ACERVO").sort((a, b) => a.descricao.localeCompare(b.descricao))) {
    console.log(`    ${gasto.natureza.padEnd(9)} ${gasto.descricao.slice(0, 46).padEnd(46)} ${brl(gasto.valor).padStart(12)}`);
  }

  const jaGravados = await prisma.gasto.findMany({
    where: { referenciaExterna: { in: gastos.map((g) => g.referenciaExterna) } },
    select: { referenciaExterna: true },
  });
  const conhecidos = new Set(jaGravados.map((g) => g.referenciaExterna));
  const novos = gastos.filter((g) => !conhecidos.has(g.referenciaExterna));
  console.log(`\n  já no banco: ${conhecidos.size} | a inserir: ${novos.length}`);

  // ---- Contratos ----
  const conciliacao = await conciliarContratos(vendas);
  console.log(`\nCONTRATOS: ${vendas.length} na exportação`);
  for (const { venda, jaExiste, entregaForaDeChapeco } of conciliacao) {
    const marca = jaExiste ? "JÁ EXISTE" : "não existe";
    const alerta = entregaForaDeChapeco ? "  << entrega fora de Chapecó" : "";
    console.log(`  ${venda.num.padEnd(9)} ${marca.padEnd(10)} ${venda.cliente.trim().slice(0, 28).padEnd(28)} ${brl(venda.valor).padStart(12)}${alerta}`);
  }
  const faltando = conciliacao.filter((c) => !c.jaExiste);
  console.log(`\n  já no Postgres: ${conciliacao.length - faltando.length} | ausentes: ${faltando.length}`);
  if (faltando.length > 0 && !criarContratos) {
    console.log("  (para criar as ausentes como reserva, rode de novo com --criar-contratos)");
  }

  // ---- Meta ----
  if (meta) {
    console.log(`\nMETA: ${brl(meta.valor)} por mês. A carga grava esse valor para o mês corrente;`);
    console.log("      os meses seguintes passam a ser definidos um a um no painel.");
  }

  if (!aplicar) {
    console.log("\nNada foi gravado. Releia a reclassificação acima antes de rodar com --aplicar.");
    return;
  }

  // ---- Gravação ----
  let inseridos = 0;
  for (const gasto of novos) {
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

  if (criarContratos && faltando.length > 0) {
    console.log("\nA criação de reservas ainda não roda por este script — ela precisa passar");
    console.log("pelo mesmo caminho da venda manual do painel, com conferência de capacidade");
    console.log("e de estoque, e uma delas conflita com a regra de entrega só em Chapecó.");
    console.log("Cadastre estas pelo painel, em Nova reserva manual:");
    for (const { venda } of faltando) {
      console.log(`  ${venda.num}  ${venda.cliente.trim()}  festa ${venda.dataEvento}  ${brl(venda.valor)}  sinal ${brl(venda.sinal)}`);
    }
  }
}

main()
  .catch((erro) => {
    console.error(erro);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
