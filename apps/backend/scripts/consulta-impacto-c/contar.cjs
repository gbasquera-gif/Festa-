/**
 * Impacto da Entrega C em produção — SOMENTE LEITURA, só números agregados.
 *
 * Usa as mesmas funções da C (opcaoQueSegura, kitsDoCatalogo, demandaDaOpcao,
 * seguradoPorPropostasNoPeriodo, itensDoKitDoPedido, STATUS_QUE_COMPROMETEM)
 * para contar o que as propostas aprovadas sem reserva passarão a segurar
 * na loja e na venda manual. Nada é gravado: a transação é READ ONLY, e uma
 * tentativa de escrita é feita de propósito (num savepoint) para provar que
 * o banco a recusa. Nenhum nome, telefone, id ou número de proposta é
 * impresso — o log é público.
 */
const path = require("node:path");
const dist = (p) => require(path.resolve(__dirname, "../../dist/modules", p));
const { prisma } = require("@festae/database");
const { diaEmChapeco } = require("@festae/shared");
const { opcaoQueSegura, kitsDoCatalogo, seguradoPorPropostasNoPeriodo } = dist("orcamentos/compromisso-das-propostas.js");
const { demandaDaOpcao } = dist("orcamentos/disponibilidade-da-proposta.js");
const { itensDoKitDoPedido, somarCompromisso } = dist("availability/item-commitment.js");
const { SELECAO_DO_COMPROMISSO, STATUS_QUE_COMPROMETEM } = dist("availability/selecao-do-pedido.js");

const H48 = 48 * 3_600_000;
const saida = [];
const n = (k, v) => {
  if (typeof v === "string" ? !/^(on|off)$/.test(v) : !Number.isFinite(v)) throw new Error("valor não agregado");
  saida.push(`${k}=${v}`);
};
const soma = (m, k, q) => m.set(k, (m.get(k) ?? 0) + q);

async function main() {
  const agora = new Date();
  const hojeDia = diaEmChapeco(agora);
  const hoje = new Date(`${hojeDia}T00:00:00.000Z`);
  const ate = new Date("2100-01-01T00:00:00.000Z");
  const em30 = new Date(hoje.getTime() + 30 * 86_400_000).toISOString().slice(0, 10);

  await prisma.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
      await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '20s'");
      const [{ transaction_read_only: ro }] = await tx.$queryRawUnsafe("SHOW transaction_read_only");
      if (ro !== "on") throw new Error("transação não está em modo somente leitura");
      n("transacao_somente_leitura", ro);
      // Prova: o banco recusa escrita nesta transação.
      await tx.$executeRawUnsafe("SAVEPOINT prova");
      let bloqueada = "off";
      try {
        await tx.$executeRawUnsafe('UPDATE "orcamentos" SET "id" = "id" WHERE false');
      } catch {
        bloqueada = "on";
      }
      await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT prova");
      n("escrita_bloqueada", bloqueada);
      if (bloqueada !== "on") throw new Error("escrita não foi bloqueada");

      // 0. A consulta enxerga dados? Só sim/não — sem revelar volume.
      const sim = (x) => (x ? "on" : "off");
      n("existem_propostas_no_banco", sim(await tx.orcamento.findFirst({ select: { id: true } })));
      n("existem_propostas_que_viraram_reserva", sim(await tx.orcamento.findFirst({ where: { reservationId: { not: null } }, select: { id: true } })));
      n("existem_reservas_futuras_que_seguram_acervo", sim(await tx.reservation.findFirst({ where: { eventDate: { gte: hoje }, status: { in: [...STATUS_QUE_COMPROMETEM] } }, select: { id: true } })));

      // 1. Aprovadas sem reserva (= sem sinal registrado: confirmar o sinal converte antes).
      const todas = await tx.orcamento.findMany({
        where: { status: "APROVADO", reservationId: null },
        select: { id: true, festaEm: true, aprovadoEm: true },
      });
      const futura = (a) => a.festaEm && a.festaEm.toISOString().slice(0, 10) >= hojeDia;
      const antiga = (a) => !a.aprovadoEm || agora.getTime() - a.aprovadoEm.getTime() >= H48;
      n("aprovadas_sem_reserva_total", todas.length);
      n("com_festa_hoje_ou_futura", todas.filter(futura).length);
      n("com_festa_passada", todas.filter((a) => a.festaEm && !futura(a)).length);
      n("sem_data_da_festa", todas.filter((a) => !a.festaEm).length);
      n("aprovadas_ha_48h_ou_mais", todas.filter(antiga).length);
      n("futuras_aprovadas_ha_48h_ou_mais", todas.filter((a) => futura(a) && antiga(a)).length);
      const idsAntigas = new Set(todas.filter(antiga).map((a) => a.id));

      // 2. O que cada futura segura — a mesma montagem de aprovadasNoPeriodo da C.
      const futuras = await tx.orcamento.findMany({
        where: { status: "APROVADO", reservationId: null, festaEm: { gte: hoje, lt: ate } },
        select: {
          id: true, numero: true, festaEm: true, opcaoAprovadaId: true,
          opcoes: { orderBy: { ordem: "asc" }, select: { id: true, ordem: true, nome: true, kitId: true, composicaoDoKit: true, itens: { select: { productId: true, quantidade: true } } } },
        },
      });
      const seguradas = futuras.flatMap((a) => {
        const opcao = opcaoQueSegura(a);
        return opcao ? [{ a, opcao }] : [];
      });
      const kits = await kitsDoCatalogo(seguradas.map((x) => x.opcao), tx);
      const porProposta = seguradas.map(({ a, opcao }) => {
        const d = demandaDaOpcao(opcao, (kitId) => kits.get(kitId));
        const itens = new Map();
        for (const i of [...d.itensDoKit, ...d.itensAvulsos]) soma(itens, i.productId, i.quantity);
        return { id: a.id, dia: a.festaEm.toISOString().slice(0, 10), itens, antiga: idsAntigas.has(a.id) };
      });
      const comPecas = porProposta.filter((p) => p.itens.size > 0);
      n("futuras_que_passam_a_segurar_pecas", comPecas.length);
      n("futuras_sem_pecas_a_segurar", futuras.length - comPecas.length);

      // Conferência: a montagem acima bate com a função oficial da C.
      const oficial = await seguradoPorPropostasNoPeriodo(hoje, ate, tx);
      const H = new Map(); // dia -> produto -> unidades (todas)
      const Hn = new Map(); // dia -> produto -> unidades (só as aprovadas há menos de 48 h)
      for (const p of comPecas) {
        const h = H.get(p.dia) ?? new Map(); H.set(p.dia, h);
        const hn = Hn.get(p.dia) ?? new Map(); Hn.set(p.dia, hn);
        for (const [prod, q] of p.itens) { soma(h, prod, q); if (!p.antiga) soma(hn, prod, q); }
      }
      let bate = oficial.size === H.size;
      for (const [dia, s] of oficial) {
        const h = H.get(dia) ?? new Map();
        if (s.total.size !== h.size) bate = false;
        for (const [prod, q] of s.total) if (h.get(prod) !== q) bate = false;
      }
      n("conferencia_com_a_regra_da_c", bate ? "on" : "off");
      let unidades = 0;
      for (const [, h] of H) for (const [, q] of h) unidades += q;
      n("dias_futuros_com_pecas_seguradas", H.size);
      n("unidades_seguradas_por_propostas", unidades);

      // 3. Reservas que comprometem acervo nesses dias (a mesma regra da disponibilidade).
      const dias = [...H.keys()];
      const R = new Map();
      if (dias.length > 0) {
        const reservas = await tx.reservation.findMany({
          where: { eventDate: { gte: hoje, lt: ate }, status: { in: [...STATUS_QUE_COMPROMETEM] } },
          select: { eventDate: true, order: { select: SELECAO_DO_COMPROMISSO } },
        });
        const porDia = new Map();
        for (const r of reservas) {
          const dia = r.eventDate.toISOString().slice(0, 10);
          if (!H.has(dia)) continue;
          const l = porDia.get(dia) ?? []; porDia.set(dia, l);
          l.push({ itensDoKit: itensDoKitDoPedido(r.order), itensAvulsos: r.order.items });
        }
        for (const [dia, l] of porDia) R.set(dia, somarCompromisso(l));
      }
      const ids = [...new Set([...H.values()].flatMap((h) => [...h.keys()]))];
      const produtos = ids.length ? await tx.product.findMany({ where: { id: { in: ids } }, select: { id: true, stockQuantity: true } }) : [];
      const E = new Map(produtos.map((p) => [p.id, p.stockQuantity]));

      // 4. Conflitos e efeito na loja, par a par (dia, peça).
      let pares = 0, excesso = 0, reservasSozinhas = 0, entrePropostas = 0, propostasMaisReservas = 0;
      let lojaZera = 0, lojaZeraSoPorAntigas = 0, lojaReduz = 0, unidadesSaem = 0, lojaZera30 = 0;
      const diasExcesso = new Set(), diasLoja = new Set(), prodLoja = new Set();
      for (const [dia, h] of H) {
        const r = R.get(dia) ?? new Map();
        const hn = Hn.get(dia) ?? new Map();
        for (const [prod, q] of h) {
          if (!E.has(prod)) continue; // sem cadastro de estoque: a regra deixa passar
          pares++;
          const e = E.get(prod), rr = r.get(prod) ?? 0, livreHoje = Math.max(0, e - rr);
          if (rr + q > e) {
            excesso++; diasExcesso.add(dia);
            if (rr > e) reservasSozinhas++;
            else if (q > e) entrePropostas++;
            else propostasMaisReservas++;
          }
          const sai = Math.min(q, livreHoje);
          if (sai > 0) { lojaReduz++; unidadesSaem += sai; diasLoja.add(dia); prodLoja.add(prod); }
          if (livreHoje >= 1 && livreHoje - q <= 0) {
            lojaZera++;
            if (dia <= em30) lojaZera30++;
            if (livreHoje - (hn.get(prod) ?? 0) >= 1) lojaZeraSoPorAntigas++;
          }
        }
      }
      n("pares_dia_peca_com_pecas_seguradas", pares);
      n("pares_em_excesso_reservas_mais_propostas_acima_do_acervo", excesso);
      n("excesso_onde_reservas_ja_excedem_sozinhas", reservasSozinhas);
      n("excesso_entre_propostas_aprovadas", entrePropostas);
      n("excesso_entre_propostas_e_reservas", propostasMaisReservas);
      n("dias_com_excesso", diasExcesso.size);
      // Propostas que, hoje, não conseguiriam converter (a conversão da C confere reservas + outras aprovadas).
      let naoConverteriam = 0, naoConverteriamAntigas = 0;
      for (const p of comPecas) {
        const r = R.get(p.dia) ?? new Map(), h = H.get(p.dia);
        let falta = false;
        for (const [prod, q] of p.itens) {
          if (!E.has(prod)) continue;
          if ((r.get(prod) ?? 0) + (h.get(prod) ?? 0) > E.get(prod)) falta = true; // h já inclui a própria (q)
        }
        if (falta) { naoConverteriam++; if (p.antiga) naoConverteriamAntigas++; }
      }
      n("propostas_que_hoje_nao_converteriam_por_falta", naoConverteriam);
      n("nao_converteriam_aprovadas_ha_48h_ou_mais", naoConverteriamAntigas);
      n("pares_em_que_a_loja_passa_a_ter_menos_unidades", lojaReduz);
      n("unidades_que_deixam_de_ser_vendaveis_na_loja", unidadesSaem);
      n("pares_em_que_a_peca_esgota_na_loja", lojaZera);
      n("peca_esgota_na_loja_nos_proximos_30_dias", lojaZera30);
      n("peca_esgota_na_loja_so_por_aprovadas_ha_48h_ou_mais", lojaZeraSoPorAntigas);
      n("dias_afetados_na_loja", diasLoja.size);
      n("pecas_distintas_afetadas_na_loja", prodLoja.size);
    },
    { timeout: 60_000, isolationLevel: "RepeatableRead" },
  );
}

main()
  .then(() => { for (const l of saida) console.log(l); })
  .catch((e) => { console.log(`falha=${e && e.constructor ? e.constructor.name : "erro"}`); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
