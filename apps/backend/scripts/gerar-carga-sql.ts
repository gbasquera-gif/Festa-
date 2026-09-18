/**
 * Gera a carga histórica como SQL puro.
 *
 * Existe porque quem vai executar não tem o repositório clonado: o script
 * TypeScript precisa do monorepo, do Prisma e do node. Um arquivo .sql roda
 * no psql que o `railway connect` abre, do mesmo jeito que as consultas de
 * conferência.
 *
 *   tsx scripts/gerar-carga-sql.ts <backup.json> <excecoes.json> > carga.sql
 *
 * O SQL gerado é transacional e idempotente. Ele não altera nada que já
 * existe: só insere o que falta, e reconhece o que já entrou pela referência
 * externa.
 */
import { readFileSync } from "node:fs";
import { normalizarDataDaFesta, isDeliveryCity, DELIVERY_CITY } from "@festae/shared";
import { classificarGasto } from "./classificar-gasto";

type Venda = {
  num: string; data: string; cliente: string; evento?: string; dataEvento: string;
  cidade?: string; modalidade?: string; valor: number; sinal: number; status: string; obs?: string;
};
type Conta = { desc: string; categoria?: string; venc?: string; dataPgto?: string; valor: number; status?: string; obs?: string; data?: string };
type Aporte = { data: string; finalidade: string; valor: number; forma?: string; obs?: string };

/** Escapa uma string para literal SQL. Aspas simples duplicadas, nada mais. */
function txt(valor: string | null | undefined): string {
  if (valor === null || valor === undefined || valor === "") return "NULL";
  return `'${String(valor).replace(/'/g, "''")}'`;
}

function data(bruta: string): string {
  const t = String(bruta).trim();
  const iso = t.includes("/")
    ? t.split("/").reverse().map((p, i) => (i === 0 ? p : p.padStart(2, "0"))).join("-")
    : t.slice(0, 10);
  return normalizarDataDaFesta(iso).toISOString();
}

function semAcento(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

const TIPOS: Record<string, string> = {
  aniversario: "ANIVERSARIO", batizado: "BATIZADO",
  "cha revelacao": "CHA_REVELACAO", "cha de bebe": "CHA_DE_BEBE",
};

function slug(s: string) {
  return semAcento(s).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
}

function referenciaGasto(aba: string, quando: string, valor: number, descricao: string) {
  return `legado:${aba}:${data(quando).slice(0, 10)}:${valor.toFixed(2)}:${slug(descricao)}`;
}

function recebimentos(v: Venda) {
  const saida: { valor: number; tipo: string }[] = [];
  if (v.sinal > 0) saida.push({ valor: v.sinal, tipo: "DEPOSIT" });
  if (v.status.trim().toLowerCase() === "pago") {
    const resto = Number((v.valor - v.sinal).toFixed(2));
    if (resto > 0) saida.push({ valor: resto, tipo: "INDETERMINADO" });
  }
  return saida;
}

const [caminhoBackup, caminhoExcecoes, ...numerosAusentes] = process.argv.slice(2);
const bruto = JSON.parse(readFileSync(caminhoBackup, "utf-8")) as Record<string, string>;
const ler = <T,>(k: string): T[] => (bruto[k] ? (JSON.parse(bruto[k]) as T[]) : []);
const vendas = ler<Venda>("festae:vendas");
const contas = ler<Conta>("festae:contas");
const aportes = ler<Aporte>("festae:aportes");
const meta = bruto["festae:meta"] ? (JSON.parse(bruto["festae:meta"]) as { valor: number }) : null;
const declaracoes = caminhoExcecoes
  ? (JSON.parse(readFileSync(caminhoExcecoes, "utf-8")) as Record<string, { regra: string; justificativa: string }[]>)
  : {};

const ausentes = new Set(numerosAusentes);
const aCriar = vendas.filter((v) => ausentes.has(v.num.trim()));
if (aCriar.length !== ausentes.size) {
  console.error(`Esperava ${ausentes.size} contratos ausentes, encontrei ${aCriar.length}.`);
  process.exit(1);
}

const linhas: string[] = [];
const p = (s = "") => linhas.push(s);

// A diretiva de encoding vem antes de qualquer byte acentuado, inclusive dos
// comentários: o psql do Windows assume WIN1252 como encoding de cliente, e ao
// ler um arquivo UTF-8 tenta converter WIN1252 -> UTF8. O "Á" de "Árvore em
// MDF" é C3 81 em UTF-8; o byte 0xC3 existe no WIN1252, mas 0x81 não, e a
// conversão morre com "byte sequence 0x81 has no equivalent in UTF8" —
// abortando a transação inteira. Declarar UTF8 faz os bytes passarem direto,
// sem conversão nenhuma, e nenhum acento precisa ser removido.
p("\\encoding UTF8");
p("SET client_encoding TO 'UTF8';");
p("");
p("-- CARGA HISTÓRICA — gerada por scripts/gerar-carga-sql.ts");
p("--");
p("-- A primeira linha declara UTF-8 e precisa continuar sendo a primeira.");
p("--");
p("-- Transacional: tudo entra ou nada entra.");
p("-- Idempotente: rodar de novo não duplica — cada registro carrega uma");
p("-- referência externa única, e a inserção é condicionada a ela não existir.");
p("-- Não altera NADA que já está no banco: só INSERT de linha nova.");
p("--");
p(`-- Contratos a criar: ${aCriar.map((v) => v.num.trim()).join(", ")}`);
p(`-- Gastos: ${contas.length + aportes.length}   Meta: ${meta ? meta.valor : "—"}`);
p("");
p("BEGIN;");
p("");

for (const v of aCriar) {
  const num = v.num.trim();
  const ref = `legado:contrato:${num}`;
  const cliente = v.cliente.trim();
  const primeiroNome = cliente.split(/\s+/)[0];
  const cidade = (v.cidade ?? "").trim() || DELIVERY_CITY;
  const modalidade = semAcento(v.modalidade ?? "");
  const entrega = modalidade.includes("entrega");
  const montagem = modalidade.includes("montagem");
  const tipo = TIPOS[semAcento(v.evento ?? "").trim()] ?? "OUTRO";
  const fechado = data(v.data);
  const festa = data(v.dataEvento);
  const passou = new Date(festa) < new Date();

  p(`-- ---------- ${num} · ${cliente} ----------`);
  p(`DO $carga$`);
  p(`DECLARE`);
  p(`  v_cliente text;`);
  p(`  v_evento  text := gen_random_uuid()::text;`);
  p(`  v_pedido  text := gen_random_uuid()::text;`);
  p(`  v_reserva text := gen_random_uuid()::text;`);
  p(`BEGIN`);
  p(`  -- Se este contrato já entrou, não faz nada. É o que torna a carga`);
  p(`  -- segura de repetir.`);
  p(`  IF EXISTS (SELECT 1 FROM reservations WHERE "referenciaExterna" = ${txt(ref)}) THEN`);
  p(`    RAISE NOTICE '${num}: ja existe, nada a fazer';`);
  p(`    RETURN;`);
  p(`  END IF;`);
  p("");
  p(`  -- Segunda guarda, contra o que se moveu depois da conciliação: se a`);
  p(`  -- operação cadastrou este mesmo negócio no Admin entre a fotografia e`);
  p(`  -- agora, ele não carrega a referência externa — e sem esta checagem a`);
  p(`  -- carga criaria uma festa duplicada no mesmo dia.`);
  p(`  IF EXISTS (`);
  p(`    SELECT 1 FROM reservations r`);
  p(`      JOIN orders o ON o.id = r."orderId"`);
  p(`      JOIN events e ON e.id = o."eventId"`);
  p(`      JOIN users  u ON u.id = e."userId"`);
  p(`     WHERE r."eventDate"::date = ${txt(festa)}::date`);
  p(`       AND lower(u.name) LIKE '%' || lower(${txt(primeiroNome)}) || '%'`);
  p(`       AND r.status NOT IN ('CANCELLED','REJECTED')`);
  p(`  ) THEN`);
  p(`    RAISE NOTICE '${num}: ja existe reserva para este cliente nesta data — NAO criado';`);
  p(`    RETURN;`);
  p(`  END IF;`);
  p("");
  p(`  -- Cliente: reaproveita se já houver alguém com este nome.`);
  p(`  SELECT id INTO v_cliente FROM users`);
  p(`   WHERE lower(name) = lower(${txt(cliente)}) AND "deletedAt" IS NULL LIMIT 1;`);
  p(`  IF v_cliente IS NULL THEN`);
  p(`    v_cliente := gen_random_uuid()::text;`);
  p(`    INSERT INTO users (id, name, role, "createdAt", "updatedAt")`);
  p(`    VALUES (v_cliente, ${txt(cliente)}, 'CLIENT', ${txt(fechado)}::timestamp, now());`);
  p(`  END IF;`);
  p("");
  p(`  INSERT INTO events (id, "userId", type, date, city, state, "saleChannel", "createdAt", "updatedAt")`);
  p(`  VALUES (v_evento, v_cliente, '${tipo}', ${txt(festa)}::timestamp, ${txt(cidade)}, 'SC', 'OUTRO', ${txt(fechado)}::timestamp, now());`);
  p("");
  p(`  -- Taxas em zero: a origem guarda um valor só, sem separar serviço de`);
  p(`  -- taxa. Gravar a taxa da tabela inventaria uma cobrança e faria o total`);
  p(`  -- discordar do contrato.`);
  p(`  INSERT INTO orders (id, "eventId", status, "subtotalKit", "subtotalExtras",`);
  p(`                      "deliveryFee", "assemblyFee", total, fulfillment, assembly, notes, "createdAt", "updatedAt")`);
  p(`  VALUES (v_pedido, v_evento, 'CONFIRMED', 0, ${v.valor}, 0, 0, ${v.valor},`);
  p(`          '${entrega ? "DELIVERY" : "PICKUP"}', ${montagem}, ${txt(v.obs)}, ${txt(fechado)}::timestamp, now());`);
  p("");
  for (const r of recebimentos(v)) {
    p(`  -- Sem data: a origem guardava quanto, nunca quando.`);
    p(`  INSERT INTO payments (id, "orderId", type, amount, method, status, "paidAt", "createdAt")`);
    p(`  VALUES (gen_random_uuid()::text, v_pedido, '${r.tipo}', ${r.valor}, 'OUTRO', 'PAID', NULL, ${txt(fechado)}::timestamp);`);
    p("");
  }
  p(`  INSERT INTO reservations (id, "orderId", "eventDate", status, "requestedAt", "confirmedAt",`);
  p(`                            "origemDoRegistro", "referenciaExterna")`);
  p(`  VALUES (v_reserva, v_pedido, ${txt(festa)}::timestamp, '${passou ? "COMPLETED" : "CONFIRMED"}',`);
  p(`          ${txt(fechado)}::timestamp, ${txt(fechado)}::timestamp, 'MIGRACAO', ${txt(ref)});`);
  p("");

  const excecoes: { regra: string; motivo: string; origem: string }[] = [];
  if (entrega && !isDeliveryCity(cidade)) {
    excecoes.push({
      regra: "ENTREGA_FORA_DA_CIDADE_ATENDIDA",
      motivo: `Entrega realizada fora de ${DELIVERY_CITY} por negociação pontual. A regra geral segue valendo.`,
      origem: "detectada",
    });
  }
  for (const d of declaracoes[num] ?? []) {
    excecoes.push({ regra: d.regra, motivo: d.justificativa, origem: "declarada" });
  }
  for (const e of excecoes) {
    p(`  INSERT INTO excecoes_comerciais (id, "reservationId", regra, justificativa, "origemDaInformacao", "autorizadaPorId", "autorizadaEm")`);
    p(`  VALUES (gen_random_uuid()::text, v_reserva, ${txt(e.regra)}, ${txt(e.motivo)}, ${txt(e.origem)}, NULL, now());`);
  }
  p(`  RAISE NOTICE '${num}: criado';`);
  p(`END`);
  p(`$carga$;`);
  p("");
}

p("-- ---------- Gastos ----------");
p("-- ON CONFLICT na referência externa: rodar de novo não duplica.");
const gastos = [
  ...contas.map((c) => ({
    ref: referenciaGasto("conta", c.dataPgto ?? c.venc ?? c.data ?? "", c.valor, c.desc),
    descricao: c.desc,
    natureza: classificarGasto(c.desc, c.categoria),
    valor: c.valor,
    pagoEm: c.status?.toLowerCase() === "pago" && c.dataPgto ? data(c.dataPgto) : null,
    venceEm: c.venc ? data(c.venc) : null,
    categoria: c.categoria ?? null,
    forma: null as string | null,
    obs: c.obs || null,
  })),
  ...aportes.map((a) => ({
    ref: referenciaGasto("aporte", a.data, a.valor, a.finalidade),
    descricao: a.finalidade,
    natureza: classificarGasto(a.finalidade),
    valor: a.valor,
    pagoEm: data(a.data),
    venceEm: null as string | null,
    categoria: null as string | null,
    forma: a.forma ?? null,
    obs: a.obs || null,
  })),
];
p(`INSERT INTO gastos (id, descricao, natureza, valor, "pagoEm", "venceEm", categoria,`);
p(`                    "formaDePagamento", observacao, "referenciaExterna", "criadoEm", "atualizadoEm")`);
p("VALUES");
p(
  gastos
    .map(
      (g) =>
        `  (gen_random_uuid()::text, ${txt(g.descricao)}, '${g.natureza}', ${g.valor}, ` +
        `${g.pagoEm ? `${txt(g.pagoEm)}::timestamp` : "NULL"}, ${g.venceEm ? `${txt(g.venceEm)}::timestamp` : "NULL"}, ` +
        `${txt(g.categoria)}, ${txt(g.forma)}, ${txt(g.obs)}, ${txt(g.ref)}, now(), now())`,
    )
    .join(",\n"),
);
p(`ON CONFLICT ("referenciaExterna") DO NOTHING;`);
p("");

if (meta) {
  const agora = new Date();
  const competencia = `${agora.getUTCFullYear()}-${String(agora.getUTCMonth() + 1).padStart(2, "0")}`;
  p("-- ---------- Meta ----------");
  p(`INSERT INTO metas_mensais (id, competencia, "lucroAlvo", "criadoEm", "atualizadoEm")`);
  p(`VALUES (gen_random_uuid()::text, '${competencia}', ${meta.valor}, now(), now())`);
  p(`ON CONFLICT (competencia) DO UPDATE SET "lucroAlvo" = EXCLUDED."lucroAlvo", "atualizadoEm" = now();`);
  p("");
}

p("COMMIT;");
p("");
p("-- ---------- Conferência ----------");
p("SELECT 'reservas migradas' AS controle, count(*)::text AS valor FROM reservations WHERE \"referenciaExterna\" LIKE 'legado:%'");
p("UNION ALL SELECT 'reservas totais', count(*)::text FROM reservations");
p("UNION ALL SELECT 'pagamentos totais', count(*)::text FROM payments");
p("UNION ALL SELECT 'excecoes comerciais', count(*)::text FROM excecoes_comerciais");
p("UNION ALL SELECT 'gastos', count(*)::text FROM gastos");
p("UNION ALL SELECT 'gastos ACERVO', count(*)::text FROM gastos WHERE natureza='ACERVO'");
p("UNION ALL SELECT 'gastos CONSUMO', count(*)::text FROM gastos WHERE natureza='CONSUMO'");
p("UNION ALL SELECT 'gastos CUSTEIO', count(*)::text FROM gastos WHERE natureza='CUSTEIO'");
p("UNION ALL SELECT 'metas', count(*)::text FROM metas_mensais");
p("UNION ALL SELECT 'faturamento contratado', to_char(sum(o.total),'FM999999990.00') FROM reservations r JOIN orders o ON o.id=r.\"orderId\" WHERE r.status NOT IN ('CANCELLED','REJECTED')");
p("UNION ALL SELECT 'recebido', to_char(coalesce(sum(amount),0),'FM999999990.00') FROM payments WHERE status='PAID'");
p("UNION ALL SELECT 'a receber', to_char((SELECT sum(o.total) FROM reservations r JOIN orders o ON o.id=r.\"orderId\" WHERE r.status NOT IN ('CANCELLED','REJECTED')) - (SELECT coalesce(sum(amount),0) FROM payments WHERE status='PAID'),'FM999999990.00');");

console.log(linhas.join("\n"));
