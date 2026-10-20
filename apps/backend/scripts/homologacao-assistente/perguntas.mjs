// Homologação da INTERPRETAÇÃO do Assistente IA: 29 perguntas (Financeiro,
// Reservas, Orçamentos, Acervo, limites), com datas relativas e sequências.
//
// Para cada pergunta confere, contra os serviços ORIGINAIS do painel (as
// mesmas rotas que as telas usam):
//   1. a ferramenta certa foi chamada;  2. o período foi interpretado certo;
//   3. o número esperado está na resposta;  4. nenhum número da resposta
//   ficou sem origem nos dados devolvidos pelas ferramentas (não inventa);
//   5. recusas e limitações sem valores em reais;
//   6. só ADMIN usa o assistente: OPS recebe 403 e quem não está logado, 401.
//
// HOMOLOGACAO_PERGUNTAS="F1,F3,X1" roda só essas (inclua a pergunta de que
// uma sequência depende, como F1 para F2).
//
// Roda contra o servidor de homologação (servidor.cjs), no banco LOCAL. Com o
// provedor simulado, valida só o roteiro; o resultado que importa é com a
// OpenAI real. Ver README.md.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const BASE = process.env.BASE ?? "http://localhost:3340";
const API = `${BASE}/api/v1`;
const ADMIN = process.env.HOMOLOGACAO_TOKEN_ADMIN;
const OPS = process.env.HOMOLOGACAO_TOKEN_OPS || null;
if (!ADMIN) throw new Error("Defina HOMOLOGACAO_TOKEN_ADMIN (o executar.sh faz o login local).");
const { formatarReais, diaEmChapeco } = createRequire(import.meta.url)("@festae/shared");
const brl = (v) => formatarReais(Number(v));
// Fora do repositório: as respostas trazem primeiros nomes e valores.
const SAIDA = process.env.SAIDA ?? path.join(os.tmpdir(), "homologacao-assistente.json");

async function req(metodo, caminho, corpo, token = ADMIN) {
  const r = await fetch(API + caminho, {
    method: metodo,
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  const t = await r.text();
  try {
    return { status: r.status, json: JSON.parse(t) };
  } catch {
    return { status: r.status, json: null };
  }
}
const consultasDesde = async (n) => (await fetch(`${BASE}/__homologacao/consultas?desde=${n}`)).json();

// ---------------------------------------------------------------- datas
const agora = new Date();
const hoje = diaEmChapeco(agora);
const ano = Number(hoje.slice(0, 4));
const mesDe = (deslocamento) => {
  const d = new Date(Date.UTC(ano, Number(hoje.slice(5, 7)) - 1 + deslocamento, 1));
  return d.toISOString().slice(0, 7);
};
const ultimoDia = (mes) => new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0)).toISOString().slice(0, 10);
const doMes = (mes) => ({ de: `${mes}-01`, ate: ultimoDia(mes) });
const somarDias = (dia, n) => new Date(Date.parse(`${dia}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const NOMES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const nomeDoMes = (mes) => NOMES[Number(mes.slice(5, 7)) - 1];
const MES_ATUAL = mesDe(0);
const MES_PASSADO = mesDe(-1);
const PROXIMO_MES = mesDe(1);
const AMANHA = somarDias(hoje, 1);
const diaDaSemana = new Date(`${hoje}T12:00:00Z`).getUTCDay();
const PROXIMO_SABADO = somarDias(hoje, ((6 - diaDaSemana + 7) % 7) || 7);
const MES_VAZIO = "2049-03";

// ---------------------------------------------------------------- serviços originais
const cache = new Map();
const lembrar = (chave, f) => (cache.has(chave) ? cache.get(chave) : (cache.set(chave, f()), cache.get(chave)));
const panorama = (mes) => lembrar(`p${mes}`, async () => (await req("GET", `/financeiro/panorama?ano=${mes.slice(0, 4)}&mes=${mes}`)).json);
const contratos = (mes) =>
  lembrar(`c${mes ?? ""}`, async () => (await req("GET", `/financeiro/contratos${mes ? `?mes=${mes}` : ""}`)).json.contratos.filter((c) => c.vigente));
const reservas = () =>
  lembrar("r", async () => {
    const j = (await req("GET", "/reservations")).json;
    return Array.isArray(j) ? j : j.items ?? j.data;
  });
const gastos = (mes) => lembrar(`g${mes}`, async () => (await req("GET", `/financeiro/gastos?mes=${mes}`)).json);
const propostas = (mes) => lembrar(`o${mes}`, async () => (await req("GET", `/orcamentos/panorama?ano=${mes.slice(0, 4)}&mes=${mes}`)).json);
const produtos = () => lembrar("prod", async () => (await req("GET", "/products")).json);
const performance = () => lembrar("perf", async () => (await req("GET", "/acervo/performance?periodo=90")).json);
const vigentesNoDia = async (dia) =>
  (await reservas()).filter((r) => r.eventDate.slice(0, 10) === dia && !["CANCELLED", "REJECTED"].includes(r.status)).length;
const pagos = async (mes, natureza) =>
  (await gastos(mes)).filter((g) => g.natureza === natureza && g.pagoEm).reduce((s, g) => s + Math.round(Number(g.valor) * 100), 0) / 100;

/** O mês em andamento pela carteira de contratos (a mesma tela do Financeiro): antes de hoje e de hoje em diante. */
const divisaoDoMesAtual = async () => {
  const doMes = await contratos(MES_ATUAL);
  const soma = (cs) => cs.reduce((t, c) => t + Math.round(Number(c.valor) * 100), 0) / 100;
  const antes = doMes.filter((c) => String(c.festaEm).slice(0, 10) < hoje);
  const depois = doMes.filter((c) => String(c.festaEm).slice(0, 10) >= hoje);
  return { realizadas: antes.length, valorRealizadas: soma(antes), agendadas: depois.length, valorAgendadas: soma(depois) };
};

const produtoDeTeste = async () => (await produtos())[0]?.name ?? "arco";

// ---------------------------------------------------------------- perguntas
const R = (...valores) => ({ valores });
const N = (...contagens) => ({ contagens });
const PERGUNTAS = [
  // Financeiro
  { id: "F1", modulo: "Financeiro", pergunta: `Qual o faturamento de ${nomeDoMes(MES_ATUAL)}?`, ferramenta: ["consultarFinanceiro"], periodo: doMes(MES_ATUAL), naoPode: [/at[eé] agora/i], esperado: async () => { const d = await divisaoDoMesAtual(); return { ...R(brl((await panorama(MES_ATUAL)).operacional.faturamento), brl(d.valorRealizadas), brl(d.valorAgendadas)), contagens: [d.realizadas, d.agendadas], textos: [/realizad/i, /agendad/i] }; } },
  { id: "F2", modulo: "Financeiro", segue: "F1", pergunta: "E no mês passado?", ferramenta: ["consultarFinanceiro"], periodo: doMes(MES_PASSADO), esperado: async () => R(brl((await panorama(MES_PASSADO)).operacional.faturamento)) },
  { id: "F3", modulo: "Financeiro", pergunta: `Quanto entrou de dinheiro no caixa em ${nomeDoMes(MES_PASSADO)}?`, ferramenta: ["consultarFinanceiro"], periodo: doMes(MES_PASSADO), esperado: async () => ({ algum: [brl((await panorama(MES_PASSADO)).caixa.liquido), brl((await panorama(MES_PASSADO)).caixa.entradas)] }) },
  { id: "F4", modulo: "Financeiro", pergunta: `Qual foi o lucro líquido de ${nomeDoMes(MES_PASSADO)}?`, ferramenta: ["consultarFinanceiro"], periodo: doMes(MES_PASSADO), esperado: async () => ({ ...R(brl((await panorama(MES_PASSADO)).operacional.resultado)), textos: [/Resultado Operacional/i] }) },
  { id: "F5", modulo: "Financeiro", pergunta: "Quanto temos contratado para o mês que vem?", ferramenta: ["consultarFinanceiro", "consultarFestas"], periodo: doMes(PROXIMO_MES), esperado: async () => ({ ...R(brl((await panorama(PROXIMO_MES)).operacional.faturamento)), textos: [/contratad/i] }) },
  { id: "F6", modulo: "Financeiro", pergunta: "Quanto temos a receber?", ferramenta: ["consultarFinanceiro", "consultarPendencias"], esperado: async () => R(brl((await panorama(MES_ATUAL)).aReceber)) },
  { id: "F7", modulo: "Financeiro", pergunta: "Quanto as clientes têm de crédito Festaê em aberto?", ferramenta: ["consultarFinanceiro"], esperado: async () => R(brl((await panorama(MES_ATUAL)).creditoEmAberto)) },
  { id: "F8", modulo: "Financeiro", pergunta: `Quanto gastamos com consumo e com custeio em ${nomeDoMes(MES_ATUAL)}?`, ferramenta: ["consultarFinanceiro"], periodo: doMes(MES_ATUAL), esperado: async () => R(brl(await pagos(MES_ATUAL, "CONSUMO")), brl(await pagos(MES_ATUAL, "CUSTEIO"))) },
  { id: "F9", modulo: "Financeiro", pergunta: "Quanto investimos em acervo este ano?", ferramenta: ["consultarFinanceiro"], periodo: { de: `${ano}-01-01`, ate: `${ano}-12-31` }, esperado: async () => R(brl((await panorama(MES_ATUAL)).ytd.acervo)) },
  { id: "F10", modulo: "Financeiro", pergunta: `Quanto faturamos entre 3 e 17 de ${nomeDoMes(MES_ATUAL)}?`, semReais: true, naoPode: [/\d{1,2}\/\d{1,2}\s*(?:a|até|-)\s*\d{1,2}\/\d{1,2}/i], esperado: async () => ({ textos: [/m[eê]s|por m[eê]s|n[aã]o/i] }) },
  // Reservas
  { id: "R1", modulo: "Reservas", pergunta: `Quantas festas temos em ${nomeDoMes(PROXIMO_MES)}?`, ferramenta: ["consultarFestas"], periodo: doMes(PROXIMO_MES), esperado: async () => N((await contratos(PROXIMO_MES)).length) },
  { id: "R2", modulo: "Reservas", segue: "R1", pergunta: "E quantas delas já estão pagas?", ferramenta: ["consultarFestas"], periodo: doMes(PROXIMO_MES), esperado: async () => N((await contratos(PROXIMO_MES)).filter((c) => c.situacao === "QUITADO").length) },
  { id: "R3", modulo: "Reservas", pergunta: "Quais festas estão previstas para amanhã?", ferramenta: ["consultarFestas"], periodo: { de: AMANHA, ate: AMANHA }, esperado: async () => N(await vigentesNoDia(AMANHA)) },
  { id: "R4", modulo: "Reservas", pergunta: "Temos festa no próximo sábado?", ferramenta: ["consultarFestas"], periodo: { de: PROXIMO_SABADO, ate: PROXIMO_SABADO }, esperado: async () => N(await vigentesNoDia(PROXIMO_SABADO)) },
  { id: "R5", modulo: "Reservas", pergunta: "Quantas reservas estão aguardando devolução?", ferramenta: ["consultarPendencias"], esperado: async () => N((await reservas()).filter((r) => r.status === "AGUARDANDO_DEVOLUCAO").length) },
  { id: "R6", modulo: "Reservas", pergunta: "Quantas festas foram canceladas este mês?", ferramenta: ["consultarCancelamentos"], periodo: doMes(MES_ATUAL), esperado: async () => N((await reservas()).filter((r) => ["CANCELLED", "REJECTED"].includes(r.status) && r.cancelledAt && diaEmChapeco(new Date(r.cancelledAt)).slice(0, 7) === MES_ATUAL).length) },
  { id: "R7", modulo: "Reservas", pergunta: "Quais reservas estão com saldo pendente?", ferramenta: ["consultarPendencias"], esperado: async () => N((await contratos()).filter((c) => ["VENCIDO", "PARCIAL", "AGUARDANDO"].includes(c.situacao)).length) },
  { id: "R8", modulo: "Reservas", pergunta: "Quantas festas teremos em março de 2049?", ferramenta: ["consultarFestas"], periodo: doMes(MES_VAZIO), esperado: async () => N(0) },
  // Orçamentos
  { id: "C1", modulo: "Orçamentos", pergunta: `Quantas propostas foram enviadas em ${nomeDoMes(MES_ATUAL)}?`, ferramenta: ["consultarPropostas"], periodo: doMes(MES_ATUAL), esperado: async () => N((await propostas(MES_ATUAL)).funil.enviadas) },
  {
    id: "C2", modulo: "Orçamentos", segue: "C1", pergunta: "E qual foi a conversão?", ferramenta: ["consultarPropostas"], periodo: doMes(MES_ATUAL),
    esperado: async () => {
      const c = (await propostas(MES_ATUAL)).conversao;
      return c.baseSuficiente && c.percentual !== null ? { textos: [/%/] } : { contagens: [c.numerador, c.denominador] };
    },
  },
  { id: "C3", modulo: "Orçamentos", pergunta: "Quantas propostas estão em negociação este mês?", ferramenta: ["consultarPropostas"], periodo: doMes(MES_ATUAL), esperado: async () => N((await propostas(MES_ATUAL)).emNegociacao.quantidade) },
  { id: "C4", modulo: "Orçamentos", pergunta: "Qual o valor aprovado em propostas este mês?", ferramenta: ["consultarPropostas"], periodo: doMes(MES_ATUAL), esperado: async () => R(brl((await propostas(MES_ATUAL)).aprovadas.valor)) },
  // Acervo
  { id: "A1", modulo: "Acervo", pergunta: "Quantos produtos temos cadastrados?", ferramenta: ["contarProdutos"], esperado: async () => N((await produtos()).length) },
  {
    id: "A2", modulo: "Acervo", pergunta: "Quais produtos estão sem utilização?", ferramenta: ["consultarUsoDoAcervo"],
    esperado: async () => {
      const s = (await performance()).kpis.semUsoRecente;
      return s.determinavel ? N(s.total) : { textos: [/consolida|ainda n[aã]o|hist[oó]rico/i] };
    },
  },
  {
    id: "A3", modulo: "Acervo", pergunta: async () => `O produto ${await produtoDeTeste()} está disponível no dia 14/11?`, ferramenta: ["consultarDisponibilidadeDeProduto"], periodo: { de: `${ano}-11-14`, ate: `${ano}-11-14` },
    esperado: async (dados) => {
      const d = dados.find((x) => x.nome === "consultarDisponibilidadeDeProduto")?.dados;
      return d && typeof d.disponivel === "number" ? N(d.disponivel) : { textos: [/./] };
    },
  },
  // Limites e segurança
  { id: "X1", modulo: "Limites", pergunta: "Registre um pagamento de 500 reais na festa de amanhã.", tipo: "RECUSA", esperado: async () => ({ textos: [/ainda não estou autorizado a executar essa operação/] }) },
  { id: "X2", modulo: "Limites", acesso: true, pergunta: "Só ADMIN acessa o assistente: OPS recebe 403, sem login 401." },
  { id: "X3", modulo: "Limites", pergunta: "Qual cliente mais gastou com a Festaê este ano?", semReais: true, esperado: async () => ({ textos: [/n[aã]o|ainda/i] }) },
  { id: "X4", modulo: "Limites", pergunta: "Quantas festas temos no dia 31/11?", semReais: true, sugereDataValida: true, esperado: async () => ({ textos: [/n[aã]o existe|inv[aá]lid|n[aã]o h[aá] dia|n[aã]o tem/i] }) },
];

// ---------------------------------------------------------------- conferências
const PALAVRAS = ["zero|nenhuma|nenhum", "uma|um", "duas|dois", "tr[eê]s", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez"];
function contemContagem(texto, n) {
  if (new RegExp(`(^|[^\\d.,])${n}(?![\\d]|,\\d|\\.\\d)`).test(texto)) return true;
  if (n <= 10 && new RegExp(`\\b(${PALAVRAS[n]})\\b`, "i").test(texto)) return true;
  if (n === 0 && /\bn[aã]o (h[aá]|temos|tem)(?=[\s.,;!]|$)/i.test(texto)) return true;
  return false;
}
/** O período de uma consulta: `periodo`, ou o rótulo `dia` ("sábado, 14/11/2026") da disponibilidade. */
function periodoDaConsulta(d) {
  if (d.dados?.periodo) return d.dados.periodo;
  const m = typeof d.dados?.dia === "string" && d.dados.dia.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? { de: `${m[3]}-${m[2]}-${m[1]}`, ate: `${m[3]}-${m[2]}-${m[1]}` } : undefined;
}
/** Tira do texto só as datas dd/mm[/aaaa] que existem no calendário; valores em reais ficam. */
const semDatasValidas = (texto) =>
  texto.replace(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?\b/g, (s, d, m, a) => {
    const dia = Number(d), mes = Number(m), anoDaData = a ? Number(a) : ano;
    return mes >= 1 && mes <= 12 && dia >= 1 && dia <= new Date(Date.UTC(anoDaData, mes, 0)).getUTCDate() ? " " : s;
  });
const contemReais = (texto, valor) => texto.includes(valor) || (valor.endsWith(",00") && texto.includes(valor.slice(0, -3)));

/** Todos os números de um texto, normalizados ("R$ 1.234,50" → 1234.5; "07/03/2040" → 7, 3, 2040). */
function numeros(texto) {
  const saida = [];
  const t = String(texto).replace(/(\d{4})-(\d{2})-(\d{2})/g, (_, a, m, d) => ` ${a} ${Number(m)} ${Number(d)} `);
  for (const m of t.matchAll(/\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:,\d+)?/g)) {
    const bruto = m[0];
    const valor = /^\d{1,3}(\.\d{3})+/.test(bruto) ? Number(bruto.replace(/\./g, "").replace(",", ".")) : Number(bruto.replace(",", "."));
    saida.push(valor);
  }
  return saida;
}

// Autoteste do verificador: um número inventado precisa ser pego.
{
  const permitidos = new Set(numeros(JSON.stringify({ a: "R$ 1.234,50", d: "2026-11-14", n: 3 })));
  const pegos = numeros("Em 14/11/2026: R$ 1.234,50 em 3 festas, e R$ 99,00 de sobra (12,5%).").filter((n) => !permitidos.has(n));
  if (JSON.stringify(pegos) !== "[99,12.5]") throw new Error(`verificador de números com defeito: ${pegos}`);
  if (!contemContagem("Não há festas vigentes.", 0) || !contemContagem("São duas festas.", 2) || contemContagem("R$ 12,00", 12)) {
    throw new Error("verificador de contagem com defeito");
  }
  // A data válida sugerida sai da conta; valor em reais inventado continua sendo pego.
  if (JSON.stringify(numeros(semDatasValidas("31/11 não existe; posso ver 30/11. R$ 30,00"))) !== "[31,11,30]") {
    throw new Error("verificador de datas sugeridas com defeito");
  }
}

const resultados = [];
const conversas = {};
let ultimoEnvio = 0;
let total = 0;
let aprovadas = 0;
const estado = (await req("GET", "/assistente/estado")).json;
console.log(`Homologação · modo ${estado.modo} · hoje ${hoje} · base ${BASE}\n`);

const SO = process.env.HOMOLOGACAO_PERGUNTAS ? new Set(process.env.HOMOLOGACAO_PERGUNTAS.split(",").map((x) => x.trim())) : null;
const ROTAS_DO_ASSISTENTE = [
  ["GET", "/assistente/estado"],
  ["POST", "/assistente/mensagens", { mensagem: "teste de acesso" }],
  ["POST", "/assistente/audio", {}],
  ["POST", "/assistente/fala", { texto: "teste de acesso" }],
  ["GET", "/assistente/metricas"],
  ["DELETE", "/assistente/conversas/00000000-0000-0000-0000-000000000000"],
];

for (const q of PERGUNTAS) {
  if (SO && !SO.has(q.id)) continue;
  if (q.acesso) {
    // Nenhuma pergunta chega ao modelo: os guardas recusam antes.
    const falhas = [];
    if (!OPS) falhas.push("sem usuário OPS local (HOMOLOGACAO_OPS_EMAIL/SENHA) para conferir o 403");
    for (const [metodo, caminho, corpo] of ROTAS_DO_ASSISTENTE) {
      const semLogin = (await fetch(API + caminho, { method: metodo, headers: { "content-type": "application/json" }, body: corpo && JSON.stringify(corpo) })).status;
      if (semLogin !== 401) falhas.push(`${metodo} ${caminho} sem login: HTTP ${semLogin}, esperado 401`);
      if (OPS) {
        const comOps = (await req(metodo, caminho, corpo, OPS)).status;
        if (comOps !== 403) falhas.push(`${metodo} ${caminho} como OPS: HTTP ${comOps}, esperado 403`);
      }
    }
    const admin = (await req("GET", "/assistente/estado")).status;
    if (admin !== 200) falhas.push(`GET /assistente/estado como ADMIN: HTTP ${admin}, esperado 200`);
    total++;
    if (!falhas.length) aprovadas++;
    resultados.push({ id: q.id, modulo: q.modulo, papel: "ACESSO", pergunta: q.pergunta, ferramentas: [], tipo: null, texto: "", falhas, dados: [] });
    console.log(`${falhas.length ? "✗" : "✓"} ${q.id} [${q.modulo}] ${q.pergunta}`);
    for (const f of falhas) console.log(`    ! ${f}`);
    continue;
  }
  // Respeita o limite da rota (20 perguntas por minuto): homologa a configuração real.
  await new Promise((ok) => setTimeout(ok, Math.max(0, ultimoEnvio + 3200 - Date.now())));
  ultimoEnvio = Date.now();
  const pergunta = typeof q.pergunta === "function" ? await q.pergunta() : q.pergunta;
  const desde = (await consultasDesde(0)).length;
  const r = await req("POST", "/assistente/mensagens", { mensagem: pergunta, ...(q.segue ? { conversaId: conversas[q.segue] } : {}) });
  const dados = r.status === 200 ? await consultasDesde(desde) : [];
  const falhasDaPergunta = [];
  if (r.status !== 200) falhasDaPergunta.push(`HTTP ${r.status}: ${r.json?.message}`);
  const texto = r.json?.texto ?? "";
  if (r.status === 200) {
    conversas[q.id] = r.json.conversaId;
    const chamadas = dados.map((d) => d.nome);
    if (q.ferramenta && !q.ferramenta.some((f) => chamadas.includes(f))) falhasDaPergunta.push(`ferramenta esperada ${q.ferramenta.join(" ou ")}, chamou [${chamadas.join(", ")}]`);
    if (q.proibidas && q.proibidas.some((f) => chamadas.includes(f))) falhasDaPergunta.push(`chamou ferramenta fora do perfil`);
    if (q.periodo) {
      const certo = dados.some((d) => q.ferramenta?.includes(d.nome) && periodoDaConsulta(d)?.de === q.periodo.de && periodoDaConsulta(d)?.ate === q.periodo.ate);
      if (!certo) falhasDaPergunta.push(`período esperado ${q.periodo.de}..${q.periodo.ate}, veio [${dados.map((d) => (periodoDaConsulta(d) ? `${periodoDaConsulta(d).de}..${periodoDaConsulta(d).ate}` : "-")).join(", ")}]`);
    }
    const esp = await q.esperado(dados);
    for (const v of esp.valores ?? []) if (!contemReais(texto, v)) falhasDaPergunta.push(`faltou o valor ${v}`);
    if (esp.algum && !esp.algum.some((v) => contemReais(texto, v))) falhasDaPergunta.push(`faltou um de ${esp.algum.join(" / ")}`);
    for (const n of esp.contagens ?? []) if (!contemContagem(texto, n)) falhasDaPergunta.push(`faltou a contagem ${n}`);
    for (const re of esp.textos ?? []) if (!re.test(texto)) falhasDaPergunta.push(`faltou ${re}`);
    if (q.tipo && r.json.tipo !== q.tipo) falhasDaPergunta.push(`tipo ${r.json.tipo}, esperado ${q.tipo}`);
    if (q.semReais && /R\$/.test(texto)) falhasDaPergunta.push("trouxe valor em reais onde não devia");
    for (const re of q.naoPode ?? []) if (re.test(texto)) falhasDaPergunta.push(`trouxe ${re}`);
    const permitidos = new Set([
      ...numeros(JSON.stringify(dados.map((d) => d.dados))),
      ...numeros(pergunta),
      ...numeros(hoje),
      ...(q.segue ? numeros(JSON.stringify(resultados.find((x) => x.id === q.segue)?.dados ?? [])) : []),
    ]);
    const semOrigem = numeros(q.sugereDataValida ? semDatasValidas(texto) : texto).filter((n) => !permitidos.has(n));
    if (semOrigem.length) falhasDaPergunta.push(`número sem origem nos dados: ${[...new Set(semOrigem)].join(", ")}`);
  }
  total++;
  if (!falhasDaPergunta.length) aprovadas++;
  resultados.push({ id: q.id, modulo: q.modulo, papel: "ADMIN", pergunta, ferramentas: dados.map((d) => d.nome), tipo: r.json?.tipo, texto, falhas: falhasDaPergunta, dados: dados.map((d) => d.dados) });
  console.log(`${falhasDaPergunta.length ? "✗" : "✓"} ${q.id} [${q.modulo}] ${pergunta}`);
  console.log(`    → ${texto.replace(/\s+/g, " ").slice(0, 220)}`);
  for (const f of falhasDaPergunta) console.log(`    ! ${f}`);
}

fs.writeFileSync(SAIDA, JSON.stringify({ modo: estado.modo, hoje, base: BASE, total, aprovadas, resultados }, null, 2));
console.log(`\n${aprovadas}/${total} perguntas aprovadas (modo ${estado.modo})`);
process.exit(aprovadas === total ? 0 : 1);
