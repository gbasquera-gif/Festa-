import { useEffect } from "react";
import { useLocation, useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  COMPANY,
  PAYMENT_METHOD_LABEL,
  FESTAE_CONTATO,
  TERMS_VERSION,
  eventTypeLabel,
  montarComprovante,
  numeroDoContrato,
  type DadosDoComprovante,
  type PaymentMethod,
} from "@festae/shared";
import { api } from "@/lib/api";
import { ALLURA_WOFF2_BASE64 } from "./assinatura-manuscrita";

interface ReservaCompleta {
  id: string;
  status: string;
  contractSeq: number;
  eventDate: string;
  requestedAt: string;
  order: {
    fulfillment: "PICKUP" | "DELIVERY";
    assembly: boolean;
    subtotalKit: string | number;
    deliveryFee: string | number;
    assemblyFee: string | number;
    total: string | number;
    notes: string | null;
    kit: { name: string } | null;
    items: { quantity: number; product: { name: string } }[];
    payments: { id: string; amount: string | number; status: string; method: string; paidAt: string | null }[];
    event: {
      type: string;
      guestCount: number | null;
      address: string | null;
      neighborhood: string | null;
      city: string;
      theme: { name: string } | null;
      user: { name: string; phone: string | null; email: string | null };
    };
  };
}

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/**
 * Telefone como se lê em voz alta: (49) 99123-4567.
 *
 * O banco guarda o que a operação digitou, com ou sem máscara. Num documento
 * que a cliente confere, um "49991234567" corrido é onde o olho tropeça — e
 * é o número pelo qual ela vai ser chamada no dia da festa.
 */
function telefoneLegivel(bruto: string): string {
  const d = bruto.replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return bruto;
}

/**
 * O comprovante que a cliente guarda.
 *
 * Impresso do painel e enviado por WhatsApp — não é um endereço na internet.
 * O papel tem nome, telefone e endereço de uma pessoa; um link, mesmo com
 * código difícil, é dado pessoal esperando vazar. Quem precisa emitir já
 * está dentro do painel, autenticado.
 *
 * Os estilos são próprios, e não classes do painel, porque este é o único
 * lugar do sistema que precisa sair igual no papel. Depender do Tailwind
 * aqui deixaria a impressão à mercê de uma classe que alguém mudou noutra
 * tela — e o erro só apareceria na mão da cliente.
 */
export default function Comprovante() {
  const [, params] = useRoute("/reservas/:id/comprovante");
  const [, navegar] = useLocation();
  const id = params?.id ?? "";

  const { data: reserva, isLoading, error } = useQuery({
    queryKey: ["reserva", id],
    queryFn: () => api<ReservaCompleta>(`/reservations/${id}`),
    enabled: Boolean(id),
  });

  // O título da aba vira o nome do arquivo quando a pessoa salva em PDF pelo
  // celular. "Comprovante FE-0042 — Renata" é achável depois; "Festaê Admin"
  // vira mais um PDF sem nome na pasta de downloads.
  useEffect(() => {
    if (!reserva) return;
    const anterior = document.title;
    document.title = `Comprovante ${numeroDoContrato(reserva.contractSeq)} — ${reserva.order.event.user.name}`;
    return () => {
      document.title = anterior;
    };
  }, [reserva]);

  if (isLoading) return <p className="text-muted-foreground">Carregando comprovante...</p>;
  if (error || !reserva) return <p className="text-destructive">Não foi possível carregar esta reserva.</p>;

  const c = montarComprovante({
    contractSeq: reserva.contractSeq,
    requestedAt: reserva.requestedAt,
    eventDate: reserva.eventDate,
    cliente: {
      nome: reserva.order.event.user.name,
      telefone: reserva.order.event.user.phone,
      email: reserva.order.event.user.email,
    },
    festa: {
      tipo: eventTypeLabel(reserva.order.event.type as never),
      tema: reserva.order.event.theme?.name ?? null,
      convidados: reserva.order.event.guestCount,
      cidade: reserva.order.event.city,
      endereco: reserva.order.event.address,
      bairro: reserva.order.event.neighborhood,
    },
    logistica: {
      entrega: reserva.order.fulfillment === "DELIVERY",
      montagem: reserva.order.assembly,
    },
    kit: reserva.order.kit ? { nome: reserva.order.kit.name } : null,
    itens: reserva.order.items.map((i) => ({ nome: i.product.name, quantidade: i.quantity })),
    valores: {
      total: Number(reserva.order.total),
      entrega: Number(reserva.order.deliveryFee),
      montagem: Number(reserva.order.assemblyFee),
      desconto: 0,
    },
    pagamentos: reserva.order.payments.map((p) => ({
      valor: Number(p.amount),
      forma: PAYMENT_METHOD_LABEL[p.method as PaymentMethod] ?? p.method,
      pagoEm: p.paidAt,
      recebido: p.status === "PAID",
    })),
    observacoes: reserva.order.notes,
  });

  return (
    <>
      <style>{CSS_DO_COMPROVANTE}</style>

      <div className="acoes-do-comprovante">
        <button type="button" onClick={() => navegar(`/reservas`)} className="botao-secundario">
          Voltar
        </button>
        <button type="button" onClick={() => window.print()} className="botao-principal">
          Imprimir ou salvar em PDF
        </button>
      </div>

      {!c.temPagamento && (
        <p className="aviso-sem-pagamento">
          Nenhum pagamento foi registrado nesta reserva ainda. O documento sai como confirmação da
          reserva, não como comprovante de pagamento — o valor recebido aparece assim que o sinal
          for registrado.
        </p>
      )}

      <Documento c={c} cancelada={reserva.status === "CANCELLED" || reserva.status === "REJECTED"} />
    </>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="linha-dado">
      <dt>{rotulo}</dt>
      <dd>{valor}</dd>
    </div>
  );
}

function Documento({ c, cancelada }: { c: DadosDoComprovante; cancelada: boolean }) {
  const titulo = c.temPagamento ? "Comprovante de pagamento" : "Confirmação de reserva";
  const quitada = c.temPagamento && c.valores.saldo === 0;

  return (
    <article id="comprovante" className="folha">
      {cancelada && <p className="tarja-cancelada">Reserva cancelada</p>}

      <header className="cabecalho">
        <img src="/logo-festae.png" alt="Festaê" className="logo" />
        <div className="identificacao">
          <p className="titulo-documento">{titulo}</p>
          <p className="numero-contrato">{c.contrato}</p>
          <p className="emitido">Emitido em {c.emitidoEm}</p>
        </div>
      </header>

      <p className="declaracao">
        A festa de <strong>{c.cliente.nome}</strong> está confirmada para{" "}
        <strong>{c.dataDaFesta}</strong>.
      </p>

      <div className="colunas">
        <section className="bloco">
          <h2>Contratante</h2>
          <dl>
            <Linha rotulo="Nome" valor={c.cliente.nome} />
            {c.cliente.telefone && (
              <Linha rotulo="Telefone" valor={telefoneLegivel(c.cliente.telefone)} />
            )}
            {c.cliente.email && <Linha rotulo="E-mail" valor={c.cliente.email} />}
            <Linha rotulo="Reserva feita em" valor={c.reservadoEm} />
          </dl>
        </section>

        <section className="bloco">
          <h2>A festa</h2>
          <dl>
            <Linha rotulo="Ocasião" valor={c.festa.tipo} />
            {c.festa.tema && <Linha rotulo="Tema" valor={c.festa.tema} />}
            {c.festa.convidados && <Linha rotulo="Convidados" valor={String(c.festa.convidados)} />}
            <Linha
              rotulo="Retirada ou entrega"
              valor={
                (c.logistica.entrega ? "Entrega no local" : "Retirada na Festaê") +
                (c.logistica.montagem ? " · com montagem" : "")
              }
            />
            {c.logistica.endereco && (
              <Linha rotulo="Endereço" valor={`${c.logistica.endereco} — ${c.festa.cidade}`} />
            )}
          </dl>
        </section>
      </div>

      <section className="bloco">
        <h2>O que vem na sua festa</h2>
        {/* O número de colunas acompanha o tamanho da lista. Medido: em
            coluna única, treze linhas já empurram o documento para a segunda
            folha — que é o que a operação relatou. Em duas, cabem dezessete;
            em três, a lista deixa de ser o que decide o número de páginas. */}
        <ul
          className={`itens ${
            c.itens.length > 12 ? "itens-tres-colunas" : c.itens.length > 5 ? "itens-duas-colunas" : ""
          }`}
        >
          {c.itens.map((item) => (
            <li key={item.descricao}>
              <span className="item-nome">{item.descricao}</span>
              <span className="quantidade">{item.quantidade}×</span>
            </li>
          ))}
          {c.itens.length === 0 && <li className="vazio">Itens a combinar.</li>}
        </ul>
      </section>

      <section className="bloco valores">
        <h2>Valores</h2>
        <dl>
          <Linha rotulo="Total da festa" valor={brl(c.valores.total)} />
        </dl>

        {/* Os dois rótulos mudam com o estado porque os dois seriam mentira
            no outro. Quem pagou a festa inteira não pagou um "sinal", e um
            saldo zerado não é uma pendência — é a boa notícia de que está
            tudo quitado, e não pode chegar na cliente com cara de alerta. */}
        <div className="placar">
          <div className="placar-item pago">
            <span>{quitada ? "Total recebido" : "Sinal pago"}</span>
            <strong>{brl(c.valores.pago)}</strong>
          </div>
          <div className={`placar-item ${quitada ? "quitado" : "saldo"}`}>
            <span>{quitada ? "Pago integralmente" : "Saldo restante"}</span>
            <strong>{quitada ? "Nada a pagar" : brl(c.valores.saldo)}</strong>
          </div>
        </div>

        {c.valores.saldo > 0 && (
          <p className="nota-saldo">
            O saldo é pago na retirada ou na entrega dos itens, no dia combinado.
          </p>
        )}

        {c.pagamentos.length > 0 && (
          <table className="pagamentos">
            <tbody>
              {c.pagamentos.map((p, i) => (
                <tr key={i}>
                  <td>{p.quando ? `Recebido em ${p.quando}` : "Recebido"}</td>
                  <td>{p.forma}</td>
                  <td className="quantidade">{brl(p.valor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {c.observacoes && (
        <section className="bloco">
          <h2>Combinados</h2>
          <p className="observacoes">{c.observacoes}</p>
        </section>
      )}

      <section className="assinatura">
        {/* O nome vem acima do fio, como assinatura sobre linha de
            assinatura, e repetido em letra de imprensa abaixo — é assim que
            um documento assinado se lê, e é o que permite conferir o nome
            quando a letra cursiva não entrega uma letra. */}
        <p className="marca-assinatura">Maria Luiza Pocai</p>
        <p className="linha-assinatura" />
        <p className="quem-assina">
          Maria Luiza Pocai · {COMPANY.tradeName} · CNPJ {COMPANY.taxId}
        </p>
        <p className="emitido-por">
          Emitido eletronicamente. Vale como comprovante do valor recebido e da data reservada.
        </p>
      </section>

      <footer className="rodape">
        <p className="rodape-empresa">
          {COMPANY.address} — {COMPANY.city}/{COMPANY.state}
        </p>
        <p className="rodape-contatos">
          {FESTAE_CONTATO.telefone} · {FESTAE_CONTATO.email} · {FESTAE_CONTATO.site} ·{" "}
          {FESTAE_CONTATO.instagram}
        </p>
        <p className="rodape-termos">
          Esta reserva segue os Termos de Uso da Festaê, versão {TERMS_VERSION}, disponíveis em{" "}
          {FESTAE_CONTATO.site}/legal/termos.
        </p>
      </footer>
    </article>
  );
}

/**
 * Estilo do documento.
 *
 * Marinho estrutura, coral marca o número que importa, dourado faz os fios
 * finos que dão ao papel o ar de documento e não de recibo de mercado. O
 * creme é o fundo — na tela ele aquece, e na impressão some, porque tinta de
 * fundo em folha inteira é cartucho gasto à toa.
 */
const CSS_DO_COMPROVANTE = `
@font-face {
  font-family: "Assinatura Festae";
  src: url(data:font/woff2;base64,${ALLURA_WOFF2_BASE64}) format("woff2");
  font-weight: 400;
  font-display: block;
}
.acoes-do-comprovante {
  display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 16px;
}
.acoes-do-comprovante button {
  min-height: 44px; padding: 0 20px; border-radius: 999px;
  font: 600 15px/1 "Nunito", system-ui, sans-serif; cursor: pointer; border: 1px solid transparent;
}
.botao-principal { background: #14304C; color: #fff; }
.botao-secundario { background: transparent; color: #14304C; border-color: #E8DCC8; }
.aviso-sem-pagamento {
  margin: 0 0 16px; padding: 12px 14px; border-radius: 12px;
  background: #FDF3E7; border: 1px solid #D3A24E; color: #6B4A12;
  font: 400 14px/1.5 "Nunito", system-ui, sans-serif; max-width: 820px;
}

.folha {
  --navy: #14304C; --coral: #F2674C; --gold: #D3A24E;
  --cream: #FBF6EE; --linen: #F3EADC; --sand: #E8DCC8;
  box-sizing: border-box;
  width: 100%; max-width: 820px; margin: 0;
  background: var(--cream); color: var(--navy);
  border: 1px solid var(--sand); border-radius: 16px;
  padding: 32px 30px 24px;
  font: 400 14px/1.55 "Nunito", system-ui, -apple-system, sans-serif;
}
.folha * { box-sizing: border-box; }

.tarja-cancelada {
  margin: -8px 0 20px; padding: 8px 14px; border-radius: 8px;
  background: #FBE9E7; color: #B3261E; border: 1px solid #E7A9A2;
  font-weight: 700; text-align: center; letter-spacing: .04em; text-transform: uppercase;
}

.cabecalho {
  display: flex; align-items: flex-start; justify-content: space-between;
  gap: 20px; padding-bottom: 18px; border-bottom: 2px solid var(--gold);
}
.logo { width: 148px; height: auto; }
.identificacao { text-align: right; }
.titulo-documento {
  margin: 0; max-width: 260px; font-size: 12px; font-weight: 700;
  text-transform: uppercase; letter-spacing: .07em; color: #56708C;
}
.numero-contrato {
  margin: 4px 0 0; font-size: 26px; font-weight: 800; color: var(--coral);
  letter-spacing: .02em; font-variant-numeric: tabular-nums;
}
.emitido { margin: 2px 0 0; font-size: 12px; color: #56708C; }

.declaracao {
  margin: 20px 0 22px; font-size: 17px; line-height: 1.5;
  padding: 14px 16px; background: var(--linen); border-radius: 12px;
  border-left: 4px solid var(--coral);
}
.declaracao strong { font-weight: 800; }

.colunas { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
@media (max-width: 640px) { .colunas { grid-template-columns: 1fr; } }

.bloco { margin-bottom: 20px; }
.bloco h2 {
  margin: 0 0 8px; font-size: 11px; font-weight: 800; text-transform: uppercase;
  letter-spacing: .09em; color: var(--gold);
  padding-bottom: 5px; border-bottom: 1px solid var(--sand);
}
.bloco dl { margin: 0; }
.linha-dado {
  display: flex; justify-content: space-between; gap: 14px;
  padding: 3px 0; align-items: baseline;
}
.linha-dado dt { margin: 0; color: #56708C; font-size: 13px; flex-shrink: 0; }
.linha-dado dd { margin: 0; text-align: right; font-weight: 600; min-width: 0; word-break: break-word; }

.itens { list-style: none; margin: 0; padding: 0; }
.itens li {
  display: flex; align-items: baseline; justify-content: space-between; gap: 12px;
  padding: 6px 0; border-bottom: 1px dotted var(--sand);
}
.itens li:last-child { border-bottom: none; }
.item-nome { min-width: 0; }
.itens-duas-colunas,
.itens-tres-colunas { display: grid; column-gap: 22px; }
.itens-duas-colunas { grid-template-columns: 1fr 1fr; }
.itens-tres-colunas { grid-template-columns: 1fr 1fr 1fr; column-gap: 16px; }
.itens-tres-colunas .item-nome { font-size: 13px; }
/* No celular as colunas espremeriam os nomes; lá a folha rola. */
@media (max-width: 640px) {
  .itens-duas-colunas,
  .itens-tres-colunas { grid-template-columns: 1fr; }
}
.quantidade { text-align: right; font-weight: 700; font-variant-numeric: tabular-nums; white-space: nowrap; }
.vazio { color: #56708C; font-style: italic; border-bottom: none !important; }

.placar { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 14px; }
/* No celular os dois valores empilham: lado a lado eles estouravam a folha,
   e a operação lê este documento no telefone antes de enviar. No papel a
   largura sempre dá, então a impressão volta às duas colunas. */
@media (max-width: 640px) { .placar { grid-template-columns: 1fr; } }
@media print { .placar { grid-template-columns: 1fr 1fr !important; } }
.placar-item {
  padding: 14px 16px; border-radius: 12px; text-align: center;
  display: flex; flex-direction: column; gap: 2px;
}
.placar-item span { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; }
.placar-item strong { font-size: 24px; font-weight: 800; font-variant-numeric: tabular-nums; }
.placar-item.pago { background: var(--navy); color: #fff; }
.placar-item.pago span { color: #A9C2DC; }
.placar-item.saldo { background: #fff; border: 2px solid var(--coral); color: var(--coral); }
.placar-item.saldo span { color: #B9503C; }
/* Quitado é notícia boa: fio dourado e tinta calma, não a borda de alerta. */
.placar-item.quitado { background: #fff; border: 2px solid var(--gold); color: #6B4A12; }
.placar-item.quitado span { color: #8A6A2C; }
.placar-item.quitado strong { font-size: 20px; }

.nota-saldo { margin: 10px 0 0; font-size: 13px; color: #56708C; }

.pagamentos { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 13px; }
.pagamentos td { padding: 5px 0; border-bottom: 1px dotted var(--sand); color: #56708C; }
.pagamentos td:last-child { color: var(--navy); }

.observacoes { margin: 0; white-space: pre-wrap; }

.assinatura { margin-top: 26px; padding-top: 18px; border-top: 2px solid var(--gold); text-align: center; }
/* A cursiva tem hastes que descem abaixo da linha de base (o "z" do Luiza).
   O padding embaixo é o que impede o fio da assinatura de cortá-las. */
.marca-assinatura {
  margin: 0; padding-bottom: 6px;
  font-family: "Assinatura Festae", "Segoe Script", cursive;
  font-size: 40px; font-weight: 400; color: var(--navy);
  line-height: 1.1; letter-spacing: .01em;
}
.linha-assinatura {
  width: 260px; margin: 0 auto 8px; border-bottom: 1px solid var(--navy);
}
.quem-assina { margin: 0; font-size: 12px; color: #56708C; line-height: 1.5; }
.emitido-por { margin: 10px auto 0; max-width: 460px; font-size: 11px; color: #7A8FA6; line-height: 1.5; }

.rodape { margin-top: 20px; padding-top: 14px; border-top: 1px solid var(--sand); text-align: center; }
.rodape p { margin: 2px 0; font-size: 11px; color: #7A8FA6; line-height: 1.5; }
.rodape-contatos { font-weight: 700; color: var(--navy) !important; font-size: 12px !important; }

@media print {
  @page { size: A4; margin: 12mm; }
  body * { visibility: hidden; }
  #comprovante, #comprovante * { visibility: visible; }
  #comprovante {
    position: absolute; left: 0; top: 0; width: 100%; max-width: none;
    border: none; border-radius: 0; padding: 0;
    background: #fff;
    font-size: 9pt;
  }
  /* Compactação só do papel. Um comprovante que vira duas folhas, com a
     segunda carregando apenas a assinatura, é folha e tinta gastas — e
     chega na cliente com cara de documento mal feito. Na tela o espaço
     continua largo, porque lá ele não custa nada. */
  #comprovante .logo { width: 88px; }
  #comprovante .cabecalho { padding-bottom: 9px; }
  #comprovante .numero-contrato { font-size: 19px; }
  #comprovante .declaracao { margin: 8px 0; padding: 6px 10px; font-size: 11px; }
  #comprovante .colunas { gap: 14px; }
  #comprovante .bloco { margin-bottom: 7px; }
  #comprovante .bloco h2 { margin-bottom: 5px; padding-bottom: 3px; }
  #comprovante .linha-dado { padding: 1.5px 0; }
  #comprovante .itens li { padding: 3px 0; }
  #comprovante .itens-duas-colunas { grid-template-columns: 1fr 1fr !important; }
  #comprovante .itens-tres-colunas { grid-template-columns: 1fr 1fr 1fr !important; }
  #comprovante .placar { margin-top: 8px; gap: 8px; }
  #comprovante .placar-item { padding: 6px 12px; }
  #comprovante .placar-item strong { font-size: 17px; }
  #comprovante .nota-saldo { margin-top: 7px; }
  #comprovante .pagamentos { margin-top: 8px; }
  #comprovante .placar-item.quitado strong { font-size: 16px; }
  #comprovante .assinatura { margin-top: 9px; padding-top: 8px; }
  #comprovante .marca-assinatura { font-size: 27px; padding-bottom: 3px; }
  #comprovante .emitido-por { margin-top: 7px; }
  #comprovante .rodape { margin-top: 8px; padding-top: 7px; }
  #comprovante .linha-assinatura { margin-bottom: 6px; }
  #comprovante .emitido-por { font-size: 10px; }
  #comprovante .rodape p { font-size: 10px; }
  /* Fundo colorido em folha inteira é cartucho gasto; os blocos que
     carregam informação continuam com cor, porque neles a cor é o que
     separa o que foi pago do que falta. */
  .declaracao { background: #F3EADC !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .placar-item.pago { background: #14304C !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .placar-item.saldo { border-color: #F2674C !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .placar-item.quitado { border-color: #D3A24E !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .numero-contrato, .marca-assinatura { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .acoes-do-comprovante, .aviso-sem-pagamento { display: none !important; }
  .bloco, .assinatura, .placar { break-inside: avoid; }
}
`;
