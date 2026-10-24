// Homologação da VOZ com a OpenAI real: a pergunta é sintetizada direto na
// OpenAI, enviada como áudio (/assistente/audio, o caminho do microfone do
// painel) e conferida — transcrição de datas e valores e período interpretado.
// Só as quatro frases fixas abaixo vão para a síntese, sem nenhum dado do banco.
// A voz do servidor (/assistente/fala) segue bloqueada: ela leria nomes reais.
import { createRequire } from "node:module";

const BASE = process.env.BASE ?? "http://localhost:3340";
const API = `${BASE}/api/v1`;
const ADMIN = process.env.HOMOLOGACAO_TOKEN_ADMIN;
if (!ADMIN) throw new Error("Defina HOMOLOGACAO_TOKEN_ADMIN (o executar.sh faz o login local).");
const { diaEmChapeco } = createRequire(import.meta.url)("@festae/shared");
const ano = diaEmChapeco(new Date()).slice(0, 4);
const auth = { authorization: `Bearer ${ADMIN}` };

if (!process.env.OPENAI_API_KEY) {
  console.log("Pulado: OPENAI_API_KEY não está no ambiente.");
  process.exit(2);
}
const estado = await (await fetch(`${API}/assistente/estado`, { headers: auth })).json();
if (estado.modo !== "OPENAI") {
  console.log(`Pulado: precisa do modo OPENAI (está ${estado.modo}).`);
  process.exit(2);
}

// Mesmos parâmetros da voz do servidor. Em erro, só o código HTTP: nunca a chave.
async function sintetizar(texto) {
  const modelo = process.env.ASSISTENTE_IA_MODELO_VOZ?.trim() || "gpt-4o-mini-tts";
  const corpo = { model: modelo, voice: process.env.ASSISTENTE_IA_VOZ?.trim() || "coral", input: texto, response_format: "mp3" };
  if (modelo.startsWith("gpt-")) corpo.instructions = "Fale em português do Brasil, com tom cordial, claro e objetivo.";
  const r = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify(corpo),
  });
  return r.status === 200 ? Buffer.from(await r.arrayBuffer()) : r.status;
}

const FRASES = [
  { fala: "Quantas festas temos no dia catorze de novembro?", transcricao: /(14|catorze|quatorze).*novembro/i, periodo: { de: `${ano}-11-14`, ate: `${ano}-11-14` } },
  { fala: "Quanto entrou no caixa em setembro?", transcricao: /caixa.*setembro/i, periodo: { de: `${ano}-09-01`, ate: `${ano}-09-30` } },
  { fala: `Qual foi o faturamento de outubro de ${ano}?`, transcricao: new RegExp(`faturamento.*outubro.*${ano}`, "i"), periodo: { de: `${ano}-10-01`, ate: `${ano}-10-31` } },
  { fala: "Temos festa depois de amanhã?", transcricao: /depois de amanh[ãa]/i },
];

// HOMOLOGACAO_PERGUNTAS="V3" fala só essa (V1 a V4, na ordem abaixo).
const SO = process.env.HOMOLOGACAO_PERGUNTAS ? new Set(process.env.HOMOLOGACAO_PERGUNTAS.split(",").map((x) => x.trim())) : null;
const escolhidas = FRASES.filter((_, i) => !SO || SO.has(`V${i + 1}`));

let ok = 0;
for (const f of escolhidas) {
  const audio = await sintetizar(f.fala);
  if (typeof audio === "number") {
    console.log(`✗ "${f.fala}" — síntese do áudio de teste falhou (HTTP ${audio})`);
    continue;
  }
  const desde = (await (await fetch(`${BASE}/__homologacao/consultas?desde=0`)).json()).length;
  const form = new FormData();
  form.append("audio", new Blob([audio], { type: "audio/mpeg" }), "pergunta.mp3");
  form.append("segundos", String(Math.max(2, Math.round(audio.length / 6000))));
  const r = await fetch(`${API}/assistente/audio`, { method: "POST", headers: auth, body: form });
  const j = await r.json();
  const consultas = await (await fetch(`${BASE}/__homologacao/consultas?desde=${desde}`)).json();
  const falhas = [];
  if (r.status !== 200) falhas.push(`HTTP ${r.status}: ${j.message}`);
  if (!f.transcricao.test(j.transcricao ?? "")) falhas.push(`transcrição "${j.transcricao}"`);
  if (f.periodo && !consultas.some((c) => c.dados?.periodo?.de === f.periodo.de && c.dados?.periodo?.ate === f.periodo.ate)) falhas.push("período interpretado diferente");
  if (!falhas.length) ok++;
  console.log(`${falhas.length ? "✗" : "✓"} "${f.fala}" → "${j.transcricao}"`);
  console.log(`    → ${(j.resposta?.texto ?? "").replace(/\s+/g, " ").slice(0, 200)}`);
  for (const x of falhas) console.log(`    ! ${x}`);
}
console.log(`\n${ok}/${escolhidas.length} perguntas por voz aprovadas`);
process.exit(ok === escolhidas.length ? 0 : 1);
