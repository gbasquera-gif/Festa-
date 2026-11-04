/**
 * Sandbox do Mercado Pago: qual a menor validade de Pix aceita, pelo MESMO
 * caminho da produção.
 *
 * Usa a classe real do app (MercadoPagoGateway.createCheckout, compilada em
 * dist): POST /v1/payments pelo SDK oficial, payment_method_id "pix",
 * date_of_expiration no formato que o app envia ("...-00:00") e chave de
 * idempotência. Depois lê o pagamento (GET /v1/payments/:id) para ver a
 * validade que o Mercado Pago gravou, e cancela cada cobrança criada.
 *
 * Proteções:
 * - credencial só pelo ambiente (MP_ACCESS_TOKEN, vindo do segredo do
 *   Environment protegido); nunca impressa;
 * - só segue se a credencial for de teste: prefixo TEST-, ou conta marcada
 *   como test_user em /users/me; senão para antes de criar qualquer cobrança;
 * - toda cobrança criada é conferida: live_mode tem de ser false; se vier
 *   true, é cancelada na hora e o teste para;
 * - R$ 1,00 por caso, comprador fictício; toda cobrança é cancelada no fim;
 * - imprime só minutos, status e códigos de erro: nada de token, QR, e-mail
 *   ou dados de conta.
 *
 * Uso local de conferência (sem rede e sem credencial): node testar.cjs --simular
 */
const path = require("node:path");

const CASOS_MINUTOS = [2, 5, 10, 15, 20, 29, 30, 31];
const SIMULAR = process.argv.includes("--simular");

function sanear(texto) {
  return String(texto ?? "")
    .replace(/(APP_USR|TEST)-[\w-]+/g, "[credencial]")
    .replace(/[\w.+-]+@[\w.-]+/g, "[e-mail]")
    .replace(/\s+/g, " ")
    .slice(0, 180);
}

function parar(msg) {
  console.log(`PARADO: ${msg}`);
  process.exit(2);
}

async function ehCredencialDeTeste(token, buscarConta) {
  if (token.startsWith("TEST-")) return { ok: true, como: "prefixo TEST-" };
  const conta = await buscarConta(token).catch(() => null);
  if (conta && Array.isArray(conta.tags) && conta.tags.includes("test_user")) return { ok: true, como: "conta test_user" };
  return { ok: false };
}

async function executar({ token, gateway, lerPagamento, buscarConta, agora = () => Date.now() }) {
  if (!token) parar("falta MP_ACCESS_TOKEN (segredo MP_SANDBOX_ACCESS_TOKEN do ambiente mercadopago-sandbox).");
  const teste = await ehCredencialDeTeste(token, buscarConta);
  if (!teste.ok) parar("a credencial não é de teste. Nenhuma cobrança foi criada.");
  console.log(`credencial de teste confirmada (${teste.como})`);

  const execucao = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const linhas = [];
  for (const minutos of CASOS_MINUTOS) {
    const pedido = new Date(agora() + minutos * 60_000);
    const linha = { minutos };
    try {
      const r = await gateway.createCheckout({
        paymentId: `sandbox-validade-${execucao}-${minutos}`,
        amount: 1,
        description: "Teste sandbox Festae - validade do Pix",
        payerEmail: "comprador-sandbox@testuser.com",
        method: "PIX",
        expiresAt: pedido,
      });
      const p = await lerPagamento(r.externalReference);
      if (p.live_mode !== false) {
        await gateway.cancelar(r.externalReference);
        parar(`live_mode não é false no caso de ${minutos} min: cobrança cancelada e teste interrompido.`);
      }
      const gravada = p.date_of_expiration ? new Date(p.date_of_expiration) : null;
      linha.resultado = "ACEITO";
      linha.validadeGravadaMin = gravada ? Math.round(((gravada.getTime() - agora()) / 60_000) * 10) / 10 : null;
      linha.ajusteSeg = gravada ? Math.round((gravada.getTime() - pedido.getTime()) / 1000) : null;
      linha.status = p.status;
      linha.cancelamento = await gateway.cancelar(r.externalReference);
    } catch (e) {
      linha.resultado = "RECUSADO";
      linha.http = e?.status ?? e?.cause?.status ?? null;
      linha.erro = sanear(e?.error ?? e?.code ?? "");
      linha.causas = Array.isArray(e?.cause) ? e.cause.map((c) => sanear(`${c.code ?? ""} ${c.description ?? ""}`)).join(" | ") : "";
      linha.mensagem = sanear(e?.message ?? e);
    }
    linhas.push(linha);
    console.log(JSON.stringify(linha));
  }

  const aceitos = linhas.filter((l) => l.resultado === "ACEITO").map((l) => l.minutos);
  const recusados = linhas.filter((l) => l.resultado === "RECUSADO").map((l) => l.minutos);
  const pendentes = linhas.filter((l) => l.resultado === "ACEITO" && l.cancelamento !== "ENCERRADA").length;
  console.log(`RESUMO aceitos=[${aceitos.join(",")}] recusados=[${recusados.join(",")}] menor_aceito=${aceitos.length ? Math.min(...aceitos) : "nenhum"} cobrancas_nao_encerradas=${pendentes}`);
  return { linhas, aceitos, recusados, pendentes };
}

async function principal() {
  if (SIMULAR) return simular();
  const token = process.env.MP_ACCESS_TOKEN;
  const { MercadoPagoGateway } = require(path.resolve(__dirname, "../../dist/modules/payments/gateway/mercadopago-gateway.service.js"));
  const { MercadoPagoConfig, Payment } = require("mercadopago");
  const gateway = new MercadoPagoGateway();
  const pagamentos = token ? new Payment(new MercadoPagoConfig({ accessToken: token })) : null;
  await executar({
    token,
    gateway,
    lerPagamento: (id) => pagamentos.get({ id }),
    buscarConta: async (t) => {
      const r = await fetch("https://api.mercadopago.com/users/me", { headers: { authorization: `Bearer ${t}` } });
      return r.ok ? r.json() : null;
    },
  });
}

/** Confere a lógica sem rede: provedor fictício que recusa abaixo de 30 min. */
async function simular() {
  const criadas = new Map();
  const gateway = {
    async createCheckout(i) {
      const min = (i.expiresAt.getTime() - Date.now()) / 60_000;
      if (min < 29.9) throw { status: 400, error: "bad_request", message: "date_of_expiration invalid", cause: [{ code: 4020, description: "simulado" }] };
      const id = String(criadas.size + 1);
      criadas.set(id, { live_mode: false, status: "pending", date_of_expiration: i.expiresAt.toISOString() });
      return { externalReference: id };
    },
    async cancelar(id) {
      criadas.get(id).status = "cancelled";
      return "ENCERRADA";
    },
  };
  const ok = (c, m) => { if (!c) { console.log(`FALHA: ${m}`); process.exitCode = 1; } else console.log(`ok: ${m}`); };
  const r = await executar({ token: "TEST-ficticio", gateway, lerPagamento: async (id) => criadas.get(id), buscarConta: async () => null });
  ok(r.aceitos.join() === "30,31", "aceita 30 e 31, recusa abaixo de 30 (provedor simulado)");
  ok([...criadas.values()].every((c) => c.status === "cancelled"), "toda cobrança criada foi cancelada");
  ok(sanear("erro APP_USR-123-abc para a@b.com") === "erro [credencial] para [e-mail]", "credencial e e-mail nunca saem no log");
  ok((await ehCredencialDeTeste("APP_USR-x", async () => ({ tags: ["normal"] }))).ok === false, "credencial de produção é recusada antes de criar cobrança");
  ok((await ehCredencialDeTeste("APP_USR-x", async () => ({ tags: ["test_user"] }))).ok === true, "conta de teste (test_user) é aceita");
}

principal().catch((e) => {
  console.log(`ERRO: ${sanear(e?.message ?? e)}`);
  process.exit(1);
});
