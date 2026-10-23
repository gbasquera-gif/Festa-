// Carrega as despesas fictícias (ficticios.mjs) pela própria API, no banco
// LOCAL da homologação. Não repete a carga: se já houver despesa com a marca,
// não faz nada.
import { createRequire } from "node:module";
import { DESPESAS_FICTICIAS, MARCA } from "./ficticios.mjs";

const BASE = process.env.BASE ?? "http://localhost:3340";
const API = `${BASE}/api/v1`;
const ADMIN = process.env.HOMOLOGACAO_TOKEN_ADMIN;
if (!ADMIN) throw new Error("Defina HOMOLOGACAO_TOKEN_ADMIN (o executar.sh faz o login local).");
const { diaEmChapeco } = createRequire(import.meta.url)("@festae/shared");

const hoje = diaEmChapeco(new Date());
const mes = (deslocamento) =>
  new Date(Date.UTC(Number(hoje.slice(0, 4)), Number(hoje.slice(5, 7)) - 1 + deslocamento, 1)).toISOString().slice(0, 7);
const MESES = { PASSADO: mes(-1), ATUAL: mes(0) };

const cabecalhos = { "content-type": "application/json", authorization: `Bearer ${ADMIN}` };
const existentes = await (await fetch(`${API}/financeiro/gastos`, { headers: cabecalhos })).json();
if (!Array.isArray(existentes)) throw new Error("Não consegui listar as despesas (login de ADMIN?).");
if (existentes.some((g) => String(g.descricao).startsWith(MARCA))) {
  console.log("Despesas fictícias já carregadas neste banco.");
  process.exit(0);
}

let criadas = 0;
for (const d of DESPESAS_FICTICIAS) {
  const pagoEm = `${MESES[d.mes]}-${String(d.dia).padStart(2, "0")}T12:00:00.000Z`;
  const r = await fetch(`${API}/financeiro/gastos`, {
    method: "POST",
    headers: cabecalhos,
    body: JSON.stringify({
      descricao: `${MARCA} ${d.descricao}`,
      natureza: d.natureza,
      valor: d.valor,
      pagoEm,
      fornecedor: d.fornecedor,
      categoria: d.categoria,
    }),
  });
  if (r.status !== 201) throw new Error(`Despesa fictícia recusada (HTTP ${r.status}): ${await r.text()}`);
  criadas++;
}
console.log(`${criadas} despesas fictícias carregadas (${MESES.PASSADO} e ${MESES.ATUAL}).`);
