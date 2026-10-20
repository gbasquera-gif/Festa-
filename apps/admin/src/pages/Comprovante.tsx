import { useEffect } from "react";
import { useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  PAYMENT_METHOD_LABEL,
  FESTAE_CONTATO,
  TERMS_VERSION,
  estaQuitado,
  eventTypeLabel,
  montarComprovante,
  numeroDoContrato,
  type DadosDoComprovante,
  type PaymentMethod,
} from "@festae/shared";
import { api } from "@/lib/api";
import {
  AcoesDoDocumento,
  AssinaturaFestae,
  CSS_DO_DOCUMENTO,
  Linha,
  RodapeFestae,
  telefoneLegivel,
} from "@/components/documento/DocumentoFestae";

interface ReservaCompleta {
  id: string;
  status: string;
  /** Crédito Festaê aplicado, já somado pelo servidor. */
  creditoAplicado?: number;
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
      creditoAplicado: reserva.creditoAplicado ?? 0,
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
      <style>{CSS_DO_DOCUMENTO}</style>

      <AcoesDoDocumento />

      {!c.temPagamento && !c.temCredito && (
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

function Documento({ c, cancelada }: { c: DadosDoComprovante; cancelada: boolean }) {
  const titulo = c.temPagamento || c.temCredito ? "Comprovante de pagamento" : "Confirmação de reserva";
  // Mesma função que a tela de Reservas usa. Duas telas com a mesma regra
  // escrita duas vezes é como a cliente que pagou tudo virava "sinal
  // recebido" numa e "Pago integralmente" na outra. Crédito Festaê cobre a
  // sua parte como um pagamento cobriria, sem ser contado como pagamento.
  const quitada =
    (c.temPagamento || c.temCredito) && estaQuitado(c.valores.total, c.valores.pago + c.valores.credito);

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
        {/* Com crédito Festaê, a conta aparece inteira e separada: o valor da
            festa não muda, o crédito abate, os pagamentos abatem, e o saldo é
            o que sobra. Crédito não é desconto nem pagamento — tem linha sua. */}
        {c.temCredito ? (
          <dl>
            <Linha rotulo="Valor da festa" valor={brl(c.valores.total)} />
            <Linha rotulo="Crédito Festaê utilizado" valor={`− ${brl(c.valores.credito)}`} />
            <Linha rotulo="Pagamentos realizados" valor={brl(c.valores.pago)} />
          </dl>
        ) : (
          <dl>
            <Linha rotulo="Total da festa" valor={brl(c.valores.total)} />
          </dl>
        )}

        {/* Os dois rótulos mudam com o estado porque os dois seriam mentira
            no outro. Quem pagou a festa inteira não pagou um "sinal", e um
            saldo zerado não é uma pendência — é a boa notícia de que está
            tudo quitado, e não pode chegar na cliente com cara de alerta. */}
        <div className="placar">
          <div className="placar-item pago">
            <span>{c.temCredito ? "Pagamentos realizados" : quitada ? "Total recebido" : "Sinal pago"}</span>
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

      <AssinaturaFestae declaracao="Emitido eletronicamente. Vale como comprovante do valor recebido e da data reservada." />

      <RodapeFestae
        nota={
          <>
            Esta reserva segue os Termos de Uso da Festaê, versão {TERMS_VERSION}, disponíveis em{" "}
            reservas.{FESTAE_CONTATO.site}/legal/termos.
          </>
        }
      />
    </article>
  );
}
