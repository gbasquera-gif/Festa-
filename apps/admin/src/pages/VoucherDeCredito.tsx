import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  NOTA_DO_VOUCHER,
  descricaoDoMovimento,
  extratoDeCredito,
  formatarDataDaFesta,
  formatarDiaDoMomento,
  formatarReais,
  numeroDoContrato,
  numeroDoCredito,
  textoDoVoucher,
  type MovimentoDeCredito,
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

type DadosDoVoucher = {
  id: string;
  numero: number;
  valor: number;
  geradoEm: string;
  cliente: { id: string; nome: string; telefone: string | null; email: string | null };
  origem: { reservaId: string; numero: number; festaEm: string };
  motivo: string | null;
};

type DadosDoSaldo = {
  cliente: { id: string; nome: string; telefone: string | null; email: string | null };
  saldo: number;
  emitidoEm: string;
  movimentos: MovimentoDeCredito[];
};

/** O nome do arquivo sai do título da aba quando a pessoa salva em PDF. */
function useTituloDoArquivo(titulo: string | null) {
  useEffect(() => {
    if (!titulo) return;
    const anterior = document.title;
    document.title = titulo;
    return () => {
      document.title = anterior;
    };
  }, [titulo]);
}

function Contratante({ cliente }: { cliente: DadosDoVoucher["cliente"] }) {
  return (
    <section className="bloco">
      <h2>Cliente</h2>
      <dl>
        <Linha rotulo="Nome" valor={cliente.nome} />
        {cliente.telefone && <Linha rotulo="Telefone" valor={telefoneLegivel(cliente.telefone)} />}
        {cliente.email && <Linha rotulo="E-mail" valor={cliente.email} />}
      </dl>
    </section>
  );
}

/**
 * O Voucher de Crédito Festaê.
 *
 * O mesmo papel do comprovante — logo, letra, cores, assinatura e rodapé —,
 * porque é o mesmo tipo de documento: algo que a Festaê afirma por escrito e
 * a cliente guarda. Sai pelo mesmo caminho também: imprimir ou salvar em PDF,
 * que no celular é o menu que compartilha.
 *
 * Mostra sempre o valor concedido, nunca o saldo de hoje. O voucher é a prova
 * do que foi registrado no cancelamento; usar parte do crédito depois não o
 * torna falso nem o muda. É refeito do registro toda vez que é aberto — não
 * existe arquivo guardado — e por isso sai igual hoje e daqui a um ano.
 *
 * Não tem endereço público. Os dados vêm da API com o login de quem abriu; o
 * número impresso é referência para conversa, não código de resgate.
 */
export function VoucherDeCredito({ movimentoId }: { movimentoId: string }) {
  const { data: v, isLoading, error } = useQuery<DadosDoVoucher>({
    queryKey: ["voucher", movimentoId],
    queryFn: () => api(`/creditos/${movimentoId}/voucher`),
  });
  useTituloDoArquivo(v ? `Voucher de Crédito ${numeroDoCredito(v.numero)} — ${v.cliente.nome}` : null);

  if (isLoading) return <p className="text-muted-foreground">Carregando voucher...</p>;
  if (error || !v) return <p className="text-destructive">Não foi possível carregar este voucher.</p>;

  return (
    <>
      <style>{CSS_DO_DOCUMENTO}</style>
      <AcoesDoDocumento />

      <article id="comprovante" className="folha" data-voucher>
        <header className="cabecalho">
          <img src="/logo-festae.png" alt="Festaê" className="logo" />
          <div className="identificacao">
            <p className="titulo-documento">Voucher de Crédito</p>
            <p className="numero-contrato numero-credito">
              <span>CRÉDITO Nº</span> <span>{numeroDoCredito(v.numero)}</span>
            </p>
            <p className="emitido">Gerado em {formatarDiaDoMomento(v.geradoEm)}</p>
          </div>
        </header>

        {/* Cliente e origem antes do texto: a frase fala da "cliente acima
            identificada", e ela precisa estar acima de fato. */}
        <div className="colunas depois-do-cabecalho">
          <Contratante cliente={v.cliente} />
          <section className="bloco">
            <h2>Origem</h2>
            <dl>
              <Linha rotulo="Origem" valor={`Cancelamento da reserva nº ${numeroDoContrato(v.origem.numero)}`} />
              <Linha rotulo="Festa prevista para" valor={formatarDataDaFesta(v.origem.festaEm)} />
              <Linha rotulo="Data de geração" valor={formatarDiaDoMomento(v.geradoEm)} />
              {v.motivo && <Linha rotulo="Motivo" valor={v.motivo} />}
            </dl>
          </section>
        </div>

        <div className="valor-do-credito">
          <span>Crédito concedido</span>
          <strong>{formatarReais(v.valor)}</strong>
        </div>

        <p className="declaracao">{textoDoVoucher(v.valor)}</p>

        <p className="nota-do-voucher">{NOTA_DO_VOUCHER}</p>

        <AssinaturaFestae declaracao="Emitido eletronicamente a partir do registro do crédito no sistema Festaê." />
        <RodapeFestae nota={`Crédito Nº ${numeroDoCredito(v.numero)} · referência do registro, não é código de resgate.`} />
      </article>
    </>
  );
}

/**
 * O comprovante do saldo atual de crédito.
 *
 * Diferente do voucher, este responde "quanto eu tenho hoje": o saldo é a
 * soma do extrato, e o extrato vai junto para a conta ser conferível.
 */
export function ComprovanteDoSaldo({ clienteId }: { clienteId: string }) {
  const { data: s, isLoading, error } = useQuery<DadosDoSaldo>({
    queryKey: ["cliente", clienteId, "saldo"],
    queryFn: () => api(`/clientes/${clienteId}/creditos/saldo`),
  });
  useTituloDoArquivo(s ? `Saldo de crédito Festaê — ${s.cliente.nome}` : null);

  if (isLoading) return <p className="text-muted-foreground">Carregando saldo...</p>;
  if (error || !s) return <p className="text-destructive">Não foi possível carregar o saldo.</p>;

  const extrato = extratoDeCredito(s.movimentos);
  return (
    <>
      <style>{CSS_DO_DOCUMENTO}</style>
      <AcoesDoDocumento />

      <article id="comprovante" className="folha" data-saldo>
        <header className="cabecalho">
          <img src="/logo-festae.png" alt="Festaê" className="logo" />
          <div className="identificacao">
            <p className="titulo-documento">Comprovante de saldo de crédito</p>
            <p className="numero-contrato">{formatarReais(s.saldo)}</p>
            <p className="emitido">Emitido em {formatarDiaDoMomento(s.emitidoEm)}</p>
          </div>
        </header>

        <div className="depois-do-cabecalho">
          <Contratante cliente={s.cliente} />
        </div>

        <p className="declaracao">
          Em {formatarDiaDoMomento(s.emitidoEm)}, a cliente acima identificada possui{" "}
          <strong>{formatarReais(s.saldo)}</strong> de crédito Festaê disponível para utilização em uma futura
          contratação, conforme as condições comerciais aplicáveis.
        </p>

        <section className="bloco">
          <h2>Movimentos do crédito</h2>
          <table className="extrato-do-saldo">
            <thead>
              <tr>
                <th>Data</th>
                <th>Descrição</th>
                <th className="num">Valor</th>
                <th className="num">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {extrato.map((l) => (
                <tr key={l.id}>
                  <td>{formatarDiaDoMomento(l.criadoEm)}</td>
                  <td>{descricaoDoMovimento(l, numeroDoContrato)}</td>
                  <td className="num">{l.valor < 0 ? `− ${formatarReais(-l.valor)}` : formatarReais(l.valor)}</td>
                  <td className="num">{formatarReais(l.saldo)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <p className="nota-do-voucher">{NOTA_DO_VOUCHER}</p>

        <AssinaturaFestae declaracao="Emitido eletronicamente a partir do extrato de crédito no sistema Festaê." />
        <RodapeFestae nota="O saldo é a soma dos movimentos acima, na data de emissão." />
      </article>
    </>
  );
}
